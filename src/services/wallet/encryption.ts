/**
 * Password-based encryption primitives, deliberately free of any elliptic-curve dependency.
 *
 * New values are sealed with Argon2id (via the lazy-loaded WASM in `hash-wasm`) + AES-256-GCM.
 * Older values still open: scrypt + AES-GCM (the v2 format before the Argon2id switch, and the
 * pre-versioned v1 hex form) and the unauthenticated CryptoJS legacy format. Every v2 blob records
 * its own KDF and parameters in a header, so decryption never has to guess. See
 * docs/proposals/argon2id-kdf.md and docs/proposals/scrypt-kdf-hardening.md.
 *
 * Keeping these in their own module — separate from WalletService, which binds ecpair/tiny-secp256k1
 * at module load — means StorageService, SecurityService and BackupService can encrypt and decrypt
 * without dragging the ~1.7 MB secp256k1 build into the initial bundle of every route. The Argon2id
 * WASM is itself lazy-loaded (only needed on unlock / sign / create / backup).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { scrypt } from 'scrypt-js';
import * as CryptoJS from 'crypto-js';
import { walletLogger } from '@/lib/Logger';

const scryptPromise = (
  password: Buffer,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  dkLen: number,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      let hasStarted = false;
      let lastProgress = 0;

      // scrypt-js v3's progress callback receives a single 0..1 value and may return true to
      // cancel. We only use it to detect that the derivation actually started.
      const progressCallback = (progress: number): boolean | void => {
        hasStarted = true;
        if (progress - lastProgress >= 0.1 || progress === 1) {
          walletLogger.debug(`Scrypt progress: ${Math.round(progress * 100)}%`);
          lastProgress = progress;
        }
        return false;
      };

      scrypt(password, salt, N, r, p, dkLen, progressCallback)
        .then((key) => resolve(Buffer.from(key)))
        .catch((error) => {
          walletLogger.error('Scrypt error:', error);
          reject(error);
        });

      // Safety net in case the callback is never invoked.
      setTimeout(() => {
        if (!hasStarted) {
          reject(new Error('Scrypt key derivation timed out - callback was never called'));
        }
      }, 10000);
    } catch (e) {
      reject(new Error(`Failed to initialize scrypt: ${e instanceof Error ? e.message : String(e)}`));
    }
  });
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

type ScryptParams = { kdf: 'scrypt'; N: number; r: number; p: number; dkLen: number };
type Argon2Params = { kdf: 'argon2id'; m: number; t: number; p: number; dkLen: number; v: number };
type KdfParams = ScryptParams | Argon2Params;

/**
 * Pre-versioned v1 hex blobs carry no header, so their scrypt factors (the original interactive
 * ~16 MB setting) are pinned here. scrypt-v2 blobs record their own N in the header, so no constant
 * is needed for them.
 */
const SCRYPT_V1: ScryptParams = { kdf: 'scrypt', N: 16384, r: 8, p: 1, dkLen: 32 };

/**
 * Argon2id profile used for every new value. Memory-hard and side-channel resistant, and near-native
 * speed via WASM (unlike pure-JS scrypt). Each field is written into the v2 header, so re-tuning is a
 * one-line change with no format churn. `m` is KiB, `t` iterations, `p` parallelism, `v` the Argon2
 * version (0x13). Overridable at build time via NEXT_PUBLIC_ARGON2_* for the e2e build ONLY — those
 * tests do not exercise KDF strength, and cheap params keep browser derivation fast and deterministic.
 * The versioned header keeps low-cost e2e blobs and production blobs mutually decryptable.
 */
const ARGON2_V2: Argon2Params = {
  kdf: 'argon2id',
  m: Number(process.env.NEXT_PUBLIC_ARGON2_M) || 65536,
  t: Number(process.env.NEXT_PUBLIC_ARGON2_T) || 3,
  p: 1,
  dkLen: 32,
  v: 0x13,
};

/** Prefix marking the versioned, self-describing format: `v2.<base64 header>.<base64 body>`. */
const V2_PREFIX = 'v2.';

/** Which KDF a value was decrypted from. Drives the re-encrypt-on-unlock upgrade to Argon2id. */
export type EncryptionFormat = 'argon2id' | 'scrypt' | 'legacy';

async function deriveKey(password: string, salt: Buffer, params: KdfParams): Promise<Buffer> {
  if (params.kdf === 'argon2id') {
    // Lazy-load so the WASM never enters the initial route bundle.
    const { argon2id } = await import('hash-wasm');
    const hash = await argon2id({
      password: Buffer.from(password, 'utf-8'),
      salt,
      parallelism: params.p,
      iterations: params.t,
      memorySize: params.m,
      hashLength: params.dkLen,
      outputType: 'binary',
    });
    return Buffer.from(hash);
  }
  return scryptPromise(Buffer.from(password, 'utf-8'), salt, params.N, params.r, params.p, params.dkLen);
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

interface ParsedBlob {
  params: KdfParams;
  salt: Buffer;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

// Slice a raw `salt ‖ iv ‖ tag ‖ ciphertext` buffer into its parts.
function sliceBlob(bin: Buffer, params: KdfParams): ParsedBlob {
  return {
    params,
    salt: bin.subarray(0, SALT_LENGTH),
    iv: bin.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH),
    tag: bin.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH),
    ciphertext: bin.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH),
  };
}

// Read the KDF params from a v2 header (kdf defaults to scrypt for headers written before Argon2id).
function paramsFromHeader(header: any): KdfParams {
  if (header.kdf === 'argon2id') {
    const params: Argon2Params = {
      kdf: 'argon2id',
      m: header.m,
      t: header.t,
      p: header.p,
      dkLen: header.dkLen ?? 32,
      v: header.v ?? 0x13,
    };
    if (![params.m, params.t, params.p, params.dkLen].every(Number.isInteger)) {
      throw new Error('Invalid v2 Argon2id parameters');
    }
    return params;
  }
  const params: ScryptParams = {
    kdf: 'scrypt',
    N: header.N,
    r: header.r,
    p: header.p,
    dkLen: header.dkLen ?? 32,
  };
  if (![params.N, params.r, params.p, params.dkLen].every(Number.isInteger)) {
    throw new Error('Invalid v2 scrypt parameters');
  }
  return params;
}

// Parse a `v2.<base64 header>.<base64 body>` blob, reading the KDF params from its header.
function parseV2(encrypted: string): ParsedBlob {
  const parts = encrypted.split('.');
  if (parts.length !== 3 || parts[0] !== 'v2') {
    throw new Error('Malformed v2 ciphertext');
  }
  const header = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
  return sliceBlob(Buffer.from(parts[2], 'base64'), paramsFromHeader(header));
}

export async function secureEncrypt(data: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, ARGON2_V2);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from(JSON.stringify(ARGON2_V2), 'utf-8').toString('base64');
  const body = Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
  return `${V2_PREFIX}${header}.${body}`;
}

export async function secureDecrypt(encryptedText: string, password: string): Promise<string> {
  // v2: self-describing — read the KDF and params from the header.
  if (encryptedText.startsWith(V2_PREFIX)) {
    const { params, salt, iv, tag, ciphertext } = parseV2(encryptedText);
    const key = await deriveKey(password, salt, params);
    return gcmDecrypt(key, iv, tag, ciphertext);
  }
  // v1: hex `salt ‖ iv ‖ tag ‖ ciphertext` derived with the original interactive scrypt factors.
  const { salt, iv, tag, ciphertext } = sliceBlob(Buffer.from(encryptedText, 'hex'), SCRYPT_V1);
  const key = await deriveKey(password, salt, SCRYPT_V1);
  return gcmDecrypt(key, iv, tag, ciphertext);
}

/**
 * Legacy decryption using CryptoJS for backward compatibility.
 */
export function legacyDecrypt(encryptedData: string, password: string): string {
  const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, password);
  const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
  if (!decryptedText) {
    throw new Error('Legacy decryption failed or resulted in empty string.');
  }
  return decryptedText;
}

/**
 * Inspect which on-disk encryption format a stored blob uses WITHOUT decrypting it — purely from
 * its shape. Safe to call with no password; intended for a read-only indicator ("Encryption:
 * Argon2id"). It classifies the same way `decryptData` does, so the label matches the format the
 * next unlock would report and upgrade from:
 *
 *  - `v2.` prefix  → read the header's `kdf` ('argon2id', or 'scrypt' for headers written before
 *                    the Argon2id switch)
 *  - bare hex      → the original scrypt format (v1)
 *  - anything else → legacy CryptoJS
 */
export function inspectEncryptionFormat(encryptedData: string): EncryptionFormat {
  if (encryptedData.startsWith(V2_PREFIX)) {
    try {
      const header = JSON.parse(Buffer.from(encryptedData.split('.')[1], 'base64').toString('utf-8'));
      return header.kdf === 'argon2id' ? 'argon2id' : 'scrypt';
    } catch {
      return 'scrypt';
    }
  }
  return /^[0-9a-f]+$/i.test(encryptedData) ? 'scrypt' : 'legacy';
}

// Report which KDF a v2 blob used (or 'scrypt' for a bare v1 hex blob), so callers can upgrade.
function formatOfSecure(encryptedData: string): EncryptionFormat {
  if (!encryptedData.startsWith(V2_PREFIX)) return 'scrypt';
  try {
    const header = JSON.parse(Buffer.from(encryptedData.split('.')[1], 'base64').toString('utf-8'));
    return header.kdf === 'argon2id' ? 'argon2id' : 'scrypt';
  } catch {
    return 'scrypt';
  }
}

/**
 * Unified decryption that handles the current (Argon2id + AES-GCM), older scrypt, and legacy
 * (CryptoJS) formats.
 *
 * IMPORTANT — the formats give very different guarantees:
 *
 * - The Argon2id/scrypt formats are AES-GCM, which is authenticated. A wrong password always throws.
 * - The legacy CryptoJS format is unauthenticated AES-CBC. There is nothing in the ciphertext to
 *   verify a password against, so a wrong password yields garbage plaintext. Usually that garbage
 *   is invalid UTF-8 and this throws, but often enough to matter it decodes cleanly and is
 *   returned as if it were correct.
 *
 * So `wasLegacy: true` means "this value has not been authenticated". Callers must validate it
 * against what they expected — isValidWIF for a key, bip39.validateMnemonic for a mnemonic —
 * before trusting it, and certainly before writing it anywhere.
 *
 * `format` lets callers re-encrypt anything that is not yet Argon2id after a successful unlock.
 *
 * @returns The decrypted data, whether the legacy format was used, and which KDF it came from.
 */
export async function decryptData(
  encryptedData: string,
  password: string,
): Promise<{ decrypted: string; wasLegacy: boolean; format: EncryptionFormat }> {
  try {
    // v2 is `v2.`-prefixed; the pre-versioned format is hex; non-hex legacy data fails here and
    // falls through.
    const decrypted = await secureDecrypt(encryptedData, password);
    return { decrypted, wasLegacy: false, format: formatOfSecure(encryptedData) };
  } catch (secureError) {
    walletLogger.debug('Secure decryption failed, attempting legacy method', {
      error: secureError instanceof Error ? secureError.message : 'Unknown error',
    });

    try {
      const decrypted = legacyDecrypt(encryptedData, password);
      return { decrypted, wasLegacy: true, format: 'legacy' };
    } catch (legacyError) {
      walletLogger.error('Decryption failed for both secure and legacy methods.', {
        secureError: secureError instanceof Error ? secureError.message : 'Unknown error',
        legacyError: legacyError instanceof Error ? legacyError.message : 'Unknown error',
      });
      throw new Error('Invalid password or corrupted data');
    }
  }
}
