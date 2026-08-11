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

/** Scrypt work factors, shared by encrypt and decrypt so a value round-trips. */
const SCRYPT = { N: 16384, r: 8, p: 1, dkLen: 32 } as const;

export async function secureEncrypt(data: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptPromise(
    Buffer.from(password, 'utf-8'),
    salt,
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    SCRYPT.dkLen,
  );
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
}

export async function secureDecrypt(encryptedHex: string, password: string): Promise<string> {
  const encryptedData = Buffer.from(encryptedHex, 'hex');
  const salt = encryptedData.subarray(0, SALT_LENGTH);
  const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = encryptedData.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = await scryptPromise(
    Buffer.from(password, 'utf-8'),
    salt,
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    SCRYPT.dkLen,
  );
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
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
): Promise<{ decrypted: string; wasLegacy: boolean }> {
  try {
    // The current format is hex; non-hex legacy data fails here and falls through.
    const decrypted = await secureDecrypt(encryptedData, password);
    return { decrypted, wasLegacy: false };
  } catch (secureError) {
    walletLogger.debug('Secure decryption failed, attempting legacy method', {
      error: secureError instanceof Error ? secureError.message : 'Unknown error',
    });

    try {
      const decrypted = legacyDecrypt(encryptedData, password);
      return { decrypted, wasLegacy: true };
    } catch (legacyError) {
      walletLogger.error('Decryption failed for both secure and legacy methods.', {
        secureError: secureError instanceof Error ? secureError.message : 'Unknown error',
        legacyError: legacyError instanceof Error ? legacyError.message : 'Unknown error',
      });
      throw new Error('Invalid password or corrupted data');
    }
  }
}
