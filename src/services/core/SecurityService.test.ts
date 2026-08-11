import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as CryptoJS from 'crypto-js';

import { securityService } from './SecurityService';
import { StorageService } from './StorageService';
import { decryptData, secureEncrypt } from '@/services/wallet/WalletService';
import { TEST_MNEMONIC, TEST_PASSWORD, resetStorage } from '@/test/helpers';

/**
 * SecurityService is a singleton with in-memory state, so each test resets both the database and
 * the lockout counters. Biometric flows are not covered here — they need a real WebAuthn
 * authenticator; what is covered is the lock state machine, settings and the lockout policy.
 */

const ADDRESS = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
const WIF = 'KwgGM49xXFfGn1FK3JjbaKHzjNq2jydshvoYmwqjnGAsA4FeuqS4';

const createEncryptedWallet = async () => {
  await StorageService.createWallet({
    name: 'Locked',
    address: ADDRESS,
    privateKey: await secureEncrypt(WIF, TEST_PASSWORD),
    isEncrypted: true,
  });
};

beforeEach(async () => {
  resetStorage();
  securityService.resetFailedAttempts();
  // The singleton keeps its lock state between tests. Locking against an empty database is the
  // supported way to force it back to unlocked: lockWallet short-circuits when no wallet exists.
  await securityService.lockWallet('manual');
});

describe('security settings', () => {
  it('supplies sensible defaults on a fresh install', async () => {
    const settings = await securityService.getSecuritySettings();

    expect(settings.autoLock.enabled).toBe(true);
    expect(settings.autoLock.timeout).toBe(300_000);
    expect(settings.biometric.enabled).toBe(false);
    expect(settings.auditLog.enabled).toBe(true);
  });

  it('persists the defaults it generated, so later reads agree with the first', async () => {
    const first = await securityService.getSecuritySettings();
    const second = await securityService.getSecuritySettings();

    expect(second.autoLock).toEqual(first.autoLock);
    expect(second.biometric).toEqual(first.biometric);
    expect(second.auditLog).toEqual(first.auditLog);
    // The persisted copy also picks up a `terms` section that the returned defaults omit; the
    // shapes differ but nothing security-relevant does.
    expect(second).toHaveProperty('terms');
  });

  it('merges an update rather than replacing the whole object', async () => {
    await securityService.updateSecuritySettings({
      autoLock: {
        enabled: false,
        timeout: 60_000,
        biometricUnlock: false,
        requirePasswordAfterTimeout: true,
      },
    });

    const settings = await securityService.getSecuritySettings();
    expect(settings.autoLock.timeout).toBe(60_000);
    expect(settings.autoLock.enabled).toBe(false);
    // Untouched sections survive.
    expect(settings.auditLog.enabled).toBe(true);
  });

  it('writes settings through to storage', async () => {
    await securityService.updateSecuritySettings({
      auditLog: { enabled: false, retentionDays: 7, maxEntries: 10 },
    });

    const stored = await StorageService.getSettings();
    expect(stored.security_settings.auditLog.retentionDays).toBe(7);
  });
});

describe('lock state', () => {
  it('is never locked when there is no wallet to protect', async () => {
    await securityService.lockWallet('manual');
    expect(await securityService.isLocked()).toBe(false);
  });

  it('locks a wallet on request', async () => {
    await createEncryptedWallet();

    await securityService.lockWallet('manual');

    expect(await securityService.isLocked()).toBe(true);
    expect(securityService.getSecurityState().lockReason).toBe('manual');
  });

  it('unlocks with the correct password', async () => {
    await createEncryptedWallet();
    await securityService.lockWallet('manual');

    expect(await securityService.unlockWallet(TEST_PASSWORD)).toBe(true);
    expect(await securityService.isLocked()).toBe(false);
  });

  it('stays locked on the wrong password', async () => {
    await createEncryptedWallet();
    await securityService.lockWallet('manual');

    expect(await securityService.unlockWallet('not-the-password')).toBe(false);
    expect(await securityService.isLocked()).toBe(true);
  });

  it('clears the session marker when locking', async () => {
    await createEncryptedWallet();
    sessionStorage.setItem('security_session_active', 'true');

    await securityService.lockWallet('manual');

    expect(sessionStorage.getItem('security_session_active')).toBeNull();
  });

  it('skips a timeout lock when the user asked not to be asked again', async () => {
    await createEncryptedWallet();
    await securityService.updateSecuritySettings({
      autoLock: {
        enabled: true,
        timeout: 300_000,
        biometricUnlock: false,
        requirePasswordAfterTimeout: false,
      },
    });

    await securityService.lockWallet('timeout');

    expect(await securityService.isLocked()).toBe(false);
  });

  it('still honours a manual lock when timeout locking is disabled', async () => {
    await createEncryptedWallet();
    await securityService.updateSecuritySettings({
      autoLock: {
        enabled: true,
        timeout: 300_000,
        biometricUnlock: false,
        requirePasswordAfterTimeout: false,
      },
    });

    await securityService.lockWallet('manual');

    expect(await securityService.isLocked()).toBe(true);
  });

  it('notifies subscribers when the lock state changes', async () => {
    await createEncryptedWallet();
    const listener = vi.fn();
    const unsubscribe = securityService.onLockStateChange(listener);

    await securityService.lockWallet('manual');
    expect(listener).toHaveBeenCalledWith(true, 'manual');

    await securityService.unlockWallet(TEST_PASSWORD);
    // The reason from the previous lock is carried through on unlock; subscribers must branch on
    // the boolean, not on the reason.
    expect(listener).toHaveBeenLastCalledWith(false, 'manual');

    unsubscribe();
    listener.mockClear();
    await securityService.lockWallet('manual');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('unlocking a wallet still on the legacy encryption format', () => {
  const createLegacyWallet = async (mnemonic?: string) =>
    StorageService.createWallet({
      name: 'Legacy',
      address: ADDRESS,
      privateKey: CryptoJS.AES.encrypt(WIF, TEST_PASSWORD).toString(),
      ...(mnemonic ? { mnemonic: CryptoJS.AES.encrypt(mnemonic, TEST_PASSWORD).toString() } : {}),
      isEncrypted: true,
    });

  it('unlocks and upgrades the stored key to the authenticated format', async () => {
    const created = await createLegacyWallet();
    await securityService.lockWallet('manual');

    expect(await securityService.unlockWallet(TEST_PASSWORD)).toBe(true);

    const stored = await StorageService.getWalletById(created.id!);
    // Upgraded blobs are scrypt/AES-GCM hex, not CryptoJS base64.
    expect(stored?.privateKey).toMatch(/^[0-9a-f]+$/);
    expect((await decryptData(stored!.privateKey, TEST_PASSWORD)).decrypted).toBe(WIF);
  });

  it('never overwrites the stored key when the password is wrong', async () => {
    // The legacy format cannot authenticate a password, so a wrong one can decrypt to
    // plausible rubbish. Upgrading that over the real key would destroy the wallet with no
    // way back — the worst outcome this codebase can produce. Repeat, since each ciphertext
    // is salted differently and only some wrong-password results decode at all.
    for (let attempt = 0; attempt < 15; attempt++) {
      resetStorage();
      securityService.resetFailedAttempts();
      const created = await createLegacyWallet();
      const originalKey = (await StorageService.getWalletById(created.id!))!.privateKey;
      await securityService.lockWallet('manual');

      expect(await securityService.unlockWallet('wrong-password')).toBe(false);

      const stored = await StorageService.getWalletById(created.id!);
      expect(stored?.privateKey).toBe(originalKey);
      // And the real password still works afterwards.
      expect((await decryptData(stored!.privateKey, TEST_PASSWORD)).decrypted).toBe(WIF);
    }
  });

  it('never overwrites the stored mnemonic with something that is not a mnemonic', async () => {
    const created = await createLegacyWallet(TEST_MNEMONIC);
    await securityService.lockWallet('manual');

    await securityService.unlockWallet(TEST_PASSWORD);

    const stored = await StorageService.getWalletById(created.id!);
    expect((await decryptData(stored!.mnemonic!, TEST_PASSWORD)).decrypted).toBe(TEST_MNEMONIC);
  });
});

describe('failed attempt lockout', () => {
  it('is not locked out to begin with', () => {
    expect(securityService.isLockedOut()).toBe(false);
    expect(securityService.getRemainingLockoutTime()).toBe(0);
  });

  it('locks out only after the fifth failure', () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      securityService.recordFailedAttempt();
      expect(securityService.isLockedOut()).toBe(false);
    }

    securityService.recordFailedAttempt();
    expect(securityService.isLockedOut()).toBe(true);
  });

  it('reports a countdown while locked out', () => {
    for (let attempt = 0; attempt < 5; attempt++) securityService.recordFailedAttempt();

    const remaining = securityService.getRemainingLockoutTime();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(300_000);
  });

  it('survives a page refresh, so the lockout cannot be skipped by reloading', () => {
    for (let attempt = 0; attempt < 5; attempt++) securityService.recordFailedAttempt();

    expect(localStorage.getItem('security_failed_attempts')).toBe('5');
    expect(localStorage.getItem('security_last_failed_attempt')).toBeTruthy();
  });

  it('clears the counter and its storage on reset', () => {
    for (let attempt = 0; attempt < 5; attempt++) securityService.recordFailedAttempt();

    securityService.resetFailedAttempts();

    expect(securityService.isLockedOut()).toBe(false);
    expect(localStorage.getItem('security_failed_attempts')).toBeNull();
  });

  it('refuses an unlock attempt during the lockout window', async () => {
    await createEncryptedWallet();
    for (let attempt = 0; attempt < 5; attempt++) securityService.recordFailedAttempt();

    await expect(securityService.unlockWallet(TEST_PASSWORD)).rejects.toThrow(
      /Too many failed attempts/,
    );
  });
});

describe('audit log', () => {
  it('records events and reads them back', async () => {
    await securityService.logSecurityEvent('wallet_lock', 'a test event', true);

    const log = await securityService.getSecurityAuditLog();
    expect(log.some((entry) => entry.details === 'a test event')).toBe(true);
  });

  it('records the success flag so failures are distinguishable', async () => {
    await securityService.logSecurityEvent('password_auth', 'failed attempt', false);

    const log = await securityService.getSecurityAuditLog();
    const entry = log.find((item) => item.details === 'failed attempt');
    expect(entry?.success).toBe(false);
  });

  it('can be cleared', async () => {
    await securityService.logSecurityEvent('wallet_lock', 'noise', true);

    await securityService.clearSecurityAuditLog();

    expect(await securityService.getSecurityAuditLog()).toEqual([]);
  });
});
