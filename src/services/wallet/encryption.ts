/**
 * Password-based encryption primitives, deliberately free of any elliptic-curve dependency.
 *
 * These helpers use only scrypt + AES-GCM (current format) and CryptoJS (legacy format). Keeping
 * them in their own module — separate from WalletService, which binds ecpair/tiny-secp256k1 at
 * module load — means StorageService, SecurityService and BackupService can encrypt and decrypt
 * without dragging the ~1.7 MB secp256k1 build into the initial bundle of every route.
 *
 * Anything that needs actual key operations (signing, WIF validation, HD derivation) still lives
 * in WalletService.
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

type ScryptParams = { N: number; r: number; p: number; dkLen: number };

/**
 * Scrypt work factors. V1 is the original interactive setting (~16 MB) — kept only so ciphertext
 * written before the hardening still decrypts. V2 is the hardened profile (~32 MB) used for every
 * new value; it is recorded in each v2 blob's header so decryption never has to guess, and a future
 * bump is just another profile without a format change. See docs/proposals/scrypt-kdf-hardening.md.
 */
const SCRYPT_V1: ScryptParams = { N: 16384, r: 8, p: 1, dkLen: 32 };
// N is overridable at build time via NEXT_PUBLIC_SCRYPT_N for the e2e build ONLY — those tests do
// not exercise KDF strength, and a cheap N keeps browser scrypt fast and deterministic. Production
// builds set nothing and get the hardened default. The versioned format records the N actually
// used, so a low-N e2e blob and a production blob remain mutually decryptable.
const SCRYPT_V2: ScryptParams = {
  N: Number(process.env.NEXT_PUBLIC_SCRYPT_N) || 32768,
  r: 8,
  p: 1,
  dkLen: 32,
};

/** Prefix marking the versioned, self-describing format: `v2.<base64 header>.<base64 body>`. */
const V2_PREFIX = 'v2.';

/** Which on-disk format a value was decrypted from. Drives the re-encrypt-on-unlock upgrade. */
export type EncryptionFormat = 'v1' | 'v2' | 'legacy';

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return scryptPromise(Buffer.from(password, 'utf-8'), salt, params.N, params.r, params.p, params.dkLen);
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

interface ParsedBlob {
  params: ScryptParams;
  salt: Buffer;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

// Slice a raw `salt ‖ iv ‖ tag ‖ ciphertext` buffer into its parts.
function sliceBlob(bin: Buffer, params: ScryptParams): ParsedBlob {
  return {
    params,
    salt: bin.subarray(0, SALT_LENGTH),
    iv: bin.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH),
    tag: bin.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH),
    ciphertext: bin.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH),
  };
}

// Parse a `v2.<base64 header>.<base64 body>` blob, reading the KDF params from its header.
function parseV2(encrypted: string): ParsedBlob {
  const parts = encrypted.split('.');
  if (parts.length !== 3 || parts[0] !== 'v2') {
    throw new Error('Malformed v2 ciphertext');
  }
  const header = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
  const params: ScryptParams = {
    N: header.N,
    r: header.r,
    p: header.p,
    dkLen: header.dkLen ?? 32,
  };
  if (
    !Number.isInteger(params.N) ||
    !Number.isInteger(params.r) ||
    !Number.isInteger(params.p) ||
    !Number.isInteger(params.dkLen)
  ) {
    throw new Error('Invalid v2 KDF parameters');
  }
  return sliceBlob(Buffer.from(parts[2], 'base64'), params);
}

export async function secureEncrypt(data: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, SCRYPT_V2);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from(
    JSON.stringify({ kdf: 'scrypt', ...SCRYPT_V2 }),
    'utf-8',
  ).toString('base64');
  const body = Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
  return `${V2_PREFIX}${header}.${body}`;
}

export async function secureDecrypt(encryptedText: string, password: string): Promise<string> {
  // v2: self-describing — read the params from the header.
  if (encryptedText.startsWith(V2_PREFIX)) {
    const { params, salt, iv, tag, ciphertext } = parseV2(encryptedText);
    const key = await deriveKey(password, salt, params);
    return gcmDecrypt(key, iv, tag, ciphertext);
  }
  // v1: hex `salt ‖ iv ‖ tag ‖ ciphertext` derived with the original interactive factors.
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
 * Unified decryption that handles both the current (scrypt + AES-GCM) and legacy (CryptoJS)
 * formats.
 *
 * IMPORTANT — the two formats give very different guarantees:
 *
 * - The current format is AES-GCM, which is authenticated. A wrong password always throws.
 * - The legacy CryptoJS format is unauthenticated AES-CBC. There is nothing in the ciphertext to
 *   verify a password against, so a wrong password yields garbage plaintext. Usually that garbage
 *   is invalid UTF-8 and this throws, but often enough to matter it decodes cleanly and is
 *   returned as if it were correct.
 *
 * So `wasLegacy: true` means "this value has not been authenticated". Callers must validate it
 * against what they expected — isValidWIF for a key, bip39.validateMnemonic for a mnemonic —
 * before trusting it, and certainly before writing it anywhere.
 *
 * @returns The decrypted data and whether the legacy format was used.
 */
export async function decryptData(
  encryptedData: string,
  password: string,
): Promise<{ decrypted: string; wasLegacy: boolean; format: EncryptionFormat }> {
  try {
    // v2 is `v2.`-prefixed; the current format is hex; non-hex legacy data fails here and falls
    // through. `format` lets callers upgrade v1/legacy blobs to v2 after a successful unlock.
    const decrypted = await secureDecrypt(encryptedData, password);
    const format: EncryptionFormat = encryptedData.startsWith(V2_PREFIX) ? 'v2' : 'v1';
    return { decrypted, wasLegacy: false, format };
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
