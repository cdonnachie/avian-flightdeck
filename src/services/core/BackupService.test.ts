import { beforeEach, describe, expect, it } from 'vitest';

import { BackupService } from './BackupService';
import { StorageService } from './StorageService';
import { TEST_PASSWORD, resetStorage } from '@/test/helpers';
import type { WalletBackup } from '@/types/backup';

const ADDRESS_A = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
const ADDRESS_B = 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF';

/** A backup file as a File, the way the import UI hands it over. */
const asFile = async (blob: Blob) =>
  new File([await blob.text()], 'backup.json', { type: 'application/json' });

const seedWallets = async () => {
  await StorageService.createWallet({
    name: 'Primary',
    address: ADDRESS_A,
    privateKey: 'encrypted-primary-key',
    mnemonic: 'encrypted-mnemonic',
    isEncrypted: true,
  });
  await StorageService.createWallet({
    name: 'Secondary',
    address: ADDRESS_B,
    privateKey: 'encrypted-secondary-key',
    isEncrypted: true,
    makeActive: false,
  });
};

beforeEach(() => {
  resetStorage();
});

describe('createFullBackup', () => {
  it('captures every wallet with the fields needed to restore it', async () => {
    await seedWallets();

    const backup = await BackupService.createFullBackup();

    expect(backup.wallets).toHaveLength(2);
    expect(backup.wallets.map((wallet) => wallet.name).sort()).toEqual(['Primary', 'Secondary']);
    for (const wallet of backup.wallets) {
      expect(wallet.address).toBeTruthy();
      expect(wallet.privateKey).toBeTruthy();
    }
  });

  it('stamps a version and a timestamp', async () => {
    await seedWallets();

    const backup = await BackupService.createFullBackup();

    expect(backup.version).toBeTruthy();
    expect(backup.timestamp).toBeLessThanOrEqual(Date.now());
    expect(backup.metadata).toBeTruthy();
  });

  it('produces a valid backup of an empty wallet set', async () => {
    const backup = await BackupService.createFullBackup();

    expect(backup.wallets).toEqual([]);
    expect(BackupService.validateBackup(backup).isValid).toBe(true);
  });

  it('carries the address book across', async () => {
    await seedWallets();
    await StorageService.saveAddress({
      id: '',
      name: 'Alice',
      address: ADDRESS_B,
      dateAdded: new Date(),
      useCount: 0,
    });

    const backup = await BackupService.createFullBackup();

    expect(backup.addressBook).toHaveLength(1);
    expect(backup.addressBook[0].name).toBe('Alice');
  });
});

describe('validateBackup', () => {
  const validBackup = async () => {
    await seedWallets();
    return BackupService.createFullBackup();
  };

  it('accepts a backup this version produced', async () => {
    const result = BackupService.validateBackup(await validBackup());

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.walletsCount).toBe(2);
    expect(result.hasEncryptedData).toBe(true);
  });

  it('reports every missing top-level field rather than only the first', () => {
    const result = BackupService.validateBackup({});

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Missing backup version',
        'Missing backup timestamp',
        'Missing wallets data',
        'Missing metadata',
      ]),
    );
  });

  it('rejects a wallet with no private key, which could not be restored', async () => {
    const backup = await validBackup();
    backup.wallets[0].privateKey = '';

    const result = BackupService.validateBackup(backup);

    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Missing private key/);
  });

  it('warns rather than fails on a version it does not recognise', async () => {
    const backup = await validBackup();
    backup.version = '0.0.1-ancient';

    const result = BackupService.validateBackup(backup);

    expect(result.isValid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/may not be fully compatible/);
  });

  it('warns about a timestamp from the future', async () => {
    const backup = await validBackup();
    backup.timestamp = Date.now() + 86_400_000;

    expect(BackupService.validateBackup(backup).warnings.join(' ')).toMatch(/future/);
  });
});

describe('export and re-import', () => {
  it('round-trips an unencrypted backup', async () => {
    await seedWallets();
    const backup = await BackupService.createFullBackup();

    const blob = await BackupService.exportBackup(backup);
    const { backup: parsed, validation } = await BackupService.parseBackupFile(await asFile(blob));

    expect(validation.isValid).toBe(true);
    expect(parsed.wallets.map((wallet) => wallet.address).sort()).toEqual(
      backup.wallets.map((wallet) => wallet.address).sort(),
    );
  });

  it('round-trips a password-protected backup', async () => {
    await seedWallets();
    const backup = await BackupService.createFullBackup();

    const blob = await BackupService.exportBackup(backup, TEST_PASSWORD);
    const { backup: parsed } = await BackupService.parseBackupFile(
      await asFile(blob),
      TEST_PASSWORD,
    );

    expect(parsed.wallets).toHaveLength(2);
  });

  it('leaves no wallet data readable in an encrypted export', async () => {
    await seedWallets();
    const backup = await BackupService.createFullBackup();

    const text = await (await BackupService.exportBackup(backup, TEST_PASSWORD)).text();

    expect(text).not.toContain(ADDRESS_A);
    expect(text).not.toContain('encrypted-primary-key');
    expect(text).not.toContain('Primary');
  });

  it('refuses an encrypted backup with no password, with an actionable message', async () => {
    await seedWallets();
    const blob = await BackupService.exportBackup(
      await BackupService.createFullBackup(),
      TEST_PASSWORD,
    );

    await expect(BackupService.parseBackupFile(await asFile(blob))).rejects.toThrow(
      /encrypted.*password/i,
    );
  });

  it('refuses an encrypted backup opened with the wrong password', async () => {
    await seedWallets();
    const blob = await BackupService.exportBackup(
      await BackupService.createFullBackup(),
      TEST_PASSWORD,
    );

    await expect(BackupService.parseBackupFile(await asFile(blob), 'wrong')).rejects.toThrow();
  });

  it('refuses a file that is not a wallet backup at all', async () => {
    const file = new File(['{"hello":"world"}'], 'notes.json', { type: 'application/json' });

    await expect(BackupService.parseBackupFile(file)).rejects.toThrow(/Invalid backup file format/);
  });
});

describe('restoreFromBackup', () => {
  const restoreOptions = {
    includeWallets: true,
    includeAddressBook: true,
    includeSettings: false,
    includeTransactions: false,
    includeSecurityAudit: false,
    includeWatchedAddresses: false,
    overwriteExisting: false,
  };

  const backupOfTwoWallets = async (): Promise<WalletBackup> => {
    await seedWallets();
    const backup = await BackupService.createFullBackup();
    resetStorage();
    return backup;
  };

  it('recreates the wallets into an empty database', async () => {
    const backup = await backupOfTwoWallets();

    await BackupService.restoreFromBackup(backup, restoreOptions);

    const wallets = await StorageService.getAllWallets();
    expect(wallets).toHaveLength(2);
    expect(wallets.map((wallet) => wallet.address).sort()).toEqual([ADDRESS_A, ADDRESS_B].sort());
  });

  it('preserves the private keys, or the restore would be worthless', async () => {
    const backup = await backupOfTwoWallets();

    await BackupService.restoreFromBackup(backup, restoreOptions);

    const restored = await StorageService.getWalletByAddress(ADDRESS_A);
    expect(restored?.privateKey).toBe('encrypted-primary-key');
    expect(restored?.mnemonic).toBe('encrypted-mnemonic');
  });

  it('skips wallets that already exist unless told to overwrite', async () => {
    const backup = await backupOfTwoWallets();
    await StorageService.createWallet({
      name: 'Primary',
      address: ADDRESS_A,
      privateKey: 'the-key-already-here',
      isEncrypted: true,
    });

    await BackupService.restoreFromBackup(backup, restoreOptions);

    const existing = await StorageService.getWalletByAddress(ADDRESS_A);
    expect(existing?.privateKey).toBe('the-key-already-here');
    expect(await StorageService.getWalletCount()).toBe(2);
  });

  it('restores the address book when asked', async () => {
    await seedWallets();
    await StorageService.saveAddress({
      id: '',
      name: 'Alice',
      address: ADDRESS_B,
      dateAdded: new Date(),
      useCount: 0,
    });
    const backup = await BackupService.createFullBackup();
    resetStorage();

    await BackupService.restoreFromBackup(backup, restoreOptions);

    const addresses = await StorageService.getSavedAddresses();
    expect(addresses.map((entry) => entry.name)).toContain('Alice');
  });

  it('leaves wallets alone when they are excluded from the restore', async () => {
    const backup = await backupOfTwoWallets();

    await BackupService.restoreFromBackup(backup, { ...restoreOptions, includeWallets: false });

    expect(await StorageService.getAllWallets()).toEqual([]);
  });

  it('reports progress as it goes', async () => {
    const backup = await backupOfTwoWallets();
    const steps: string[] = [];

    await BackupService.restoreFromBackup(backup, restoreOptions, (step) => steps.push(step));

    expect(steps.length).toBeGreaterThan(0);
    expect(steps.join(' ')).toMatch(/wallet/i);
  });
});

describe('verifyBackupIntegrity', () => {
  it('passes a well-formed backup', async () => {
    await seedWallets();
    expect(await BackupService.verifyBackupIntegrity(await BackupService.createFullBackup())).toBe(
      true,
    );
  });

  it('fails a backup with a wallet missing its key material', async () => {
    await seedWallets();
    const backup = await BackupService.createFullBackup();
    backup.wallets[1].privateKey = '';

    expect(await BackupService.verifyBackupIntegrity(backup)).toBe(false);
  });
});

describe('getBackupSummary', () => {
  it('summarises what the user is about to restore', async () => {
    await seedWallets();
    const backup = await BackupService.createFullBackup();

    const summary = BackupService.getBackupSummary(backup);

    expect(summary.walletsCount).toBe(2);
    expect(summary.hasEncryptedWallets).toBe(true);
    expect(summary.hdWalletsCount).toBe(1); // only Primary carries a mnemonic
    expect(summary.walletNames.sort()).toEqual(['Primary', 'Secondary']);
  });
});

describe('QR transport', () => {
  const payload = 'A'.repeat(2_500);

  it('splits a long backup into ordered, labelled chunks', () => {
    const chunks = BackupService.splitBackupForQR(payload);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, index) => {
      const info = BackupService.getQRChunkInfo(chunk);
      expect(info).toEqual({ index: index + 1, totalChunks: chunks.length });
    });
  });

  it('reassembles the original payload from its chunks', async () => {
    const chunks = BackupService.splitBackupForQR(payload);
    expect(await BackupService.combineQRChunks(chunks)).toBe(payload);
  });

  it('reassembles correctly even when chunks are scanned out of order', async () => {
    const chunks = BackupService.splitBackupForQR(payload);
    expect(await BackupService.combineQRChunks([...chunks].reverse())).toBe(payload);
  });

  it('keeps a short backup to a single chunk', () => {
    expect(BackupService.splitBackupForQR('short')).toHaveLength(1);
  });

  it('rejects data that is not one of its chunks', () => {
    expect(BackupService.getQRChunkInfo('just some scanned text')).toBeNull();
    expect(BackupService.getQRChunkInfo('AVIAN_QR_CHUNK|malformed')).toBeNull();
    expect(BackupService.getQRChunkInfo('AVIAN_QR_CHUNK|x/y|data')).toBeNull();
  });
});
