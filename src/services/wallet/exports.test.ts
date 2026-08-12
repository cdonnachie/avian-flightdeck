import { beforeEach, describe, expect, it } from 'vitest';
import * as CryptoJS from 'crypto-js';

import { WalletService, buildDescriptorBody, descriptorChecksum, secureEncrypt } from './WalletService';
import { StorageService } from '@/services/core/StorageService';
import { TEST_MNEMONIC, TEST_PASSWORD, resetStorage } from '@/test/helpers';

/**
 * The paths that hand secrets back to the user. Every one of them must refuse without the right
 * password, and must return something actually usable with it — a half-decrypted key is worse
 * than an error, because the user would save it and lose access to their funds.
 */

const ADDRESS = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
const WIF = 'KwgGM49xXFfGn1FK3JjbaKHzjNq2jydshvoYmwqjnGAsA4FeuqS4';

let wallet: WalletService;

const createWallet = async (overrides: Record<string, unknown> = {}) => {
  const created = await StorageService.createWallet({
    name: 'Main',
    address: ADDRESS,
    privateKey: await secureEncrypt(WIF, TEST_PASSWORD),
    mnemonic: await secureEncrypt(TEST_MNEMONIC, TEST_PASSWORD),
    isEncrypted: true,
    ...overrides,
  });
  return created;
};

beforeEach(() => {
  resetStorage();
  wallet = new WalletService();
});

describe('exportPrivateKey', () => {
  it('returns the WIF for the right password', async () => {
    await createWallet();
    expect(await wallet.exportPrivateKey(TEST_PASSWORD)).toBe(WIF);
  });

  it('refuses without a password when the wallet is encrypted', async () => {
    await createWallet();
    await expect(wallet.exportPrivateKey()).rejects.toThrow(/Password required/);
  });

  it('refuses the wrong password rather than returning anything', async () => {
    await createWallet();
    await expect(wallet.exportPrivateKey('wrong-password')).rejects.toThrow();
  });

  it('explains itself when there is no wallet at all', async () => {
    await expect(wallet.exportPrivateKey(TEST_PASSWORD)).rejects.toThrow(/No private key found/);
  });

  it('returns the key directly for an unencrypted wallet', async () => {
    await StorageService.createWallet({
      name: 'Plain',
      address: ADDRESS,
      privateKey: WIF,
      isEncrypted: false,
    });

    expect(await wallet.exportPrivateKey()).toBe(WIF);
  });

  it('converts a stored raw hex key into WIF on the way out', async () => {
    // Older wallets stored a bare 32-byte hex key; exporting one must still produce something
    // importable elsewhere.
    const hexKey = '0000000000000000000000000000000000000000000000000000000000000001';
    await StorageService.createWallet({
      name: 'Hex',
      address: ADDRESS,
      privateKey: hexKey,
      isEncrypted: false,
    });

    const exported = await wallet.exportPrivateKey();
    expect(exported).not.toBe(hexKey);
    expect(await wallet.validatePrivateKey(exported)).toBe(true);
  });

  it('refuses a stored key that is neither WIF nor hex', async () => {
    await StorageService.createWallet({
      name: 'Broken',
      address: ADDRESS,
      privateKey: 'this-is-not-a-key',
      isEncrypted: false,
    });

    await expect(wallet.exportPrivateKey()).rejects.toThrow(/Corrupted private key/);
  });
});

describe('exportMnemonic', () => {
  it('returns the mnemonic for the right password', async () => {
    await createWallet();
    expect(await wallet.exportMnemonic(TEST_PASSWORD)).toBe(TEST_MNEMONIC);
  });

  it('refuses without a password when the wallet is encrypted', async () => {
    await createWallet();
    await expect(wallet.exportMnemonic()).rejects.toThrow(/Password required/);
  });

  it('refuses the wrong password', async () => {
    await createWallet();
    await expect(wallet.exportMnemonic('wrong-password')).rejects.toThrow(
      /Invalid password or corrupted mnemonic/,
    );
  });

  it('returns null for a wallet that never had a mnemonic', async () => {
    await StorageService.createWallet({
      name: 'KeyOnly',
      address: ADDRESS,
      privateKey: await secureEncrypt(WIF, TEST_PASSWORD),
      isEncrypted: true,
    });

    expect(await wallet.exportMnemonic(TEST_PASSWORD)).toBeNull();
  });
});

describe('exportActiveWalletPrivateKey', () => {
  it('returns the WIF for the right password', async () => {
    await createWallet();
    expect(await wallet.exportActiveWalletPrivateKey(TEST_PASSWORD)).toBe(WIF);
  });

  it('refuses without a password, and with the wrong one', async () => {
    await createWallet();

    await expect(wallet.exportActiveWalletPrivateKey()).rejects.toThrow(/Password required/);
    await expect(wallet.exportActiveWalletPrivateKey('nope')).rejects.toThrow(/Invalid password/);
  });

  it('refuses when there is no active wallet', async () => {
    await expect(wallet.exportActiveWalletPrivateKey(TEST_PASSWORD)).rejects.toThrow(
      /No active wallet/,
    );
  });

  it('never overwrites a legacy key when the password is wrong', async () => {
    // The legacy format is unauthenticated, so a wrong password can decrypt to plausible
    // rubbish. If that rubbish were re-encrypted over the stored key the wallet would be
    // destroyed by a typo, with no way back. Try repeatedly, since each ciphertext differs.
    for (let attempt = 0; attempt < 15; attempt++) {
      resetStorage();
      const legacyBlob = CryptoJS.AES.encrypt(WIF, TEST_PASSWORD).toString();
      const created = await StorageService.createWallet({
        name: 'Legacy',
        address: ADDRESS,
        privateKey: legacyBlob,
        isEncrypted: true,
      });

      await expect(wallet.exportActiveWalletPrivateKey('wrong-password')).rejects.toThrow(
        /Invalid password/,
      );

      // The stored key must be untouched, and must still open with the real password.
      const stored = await StorageService.getWalletById(created.id!);
      expect(stored?.privateKey).toBe(legacyBlob);
      expect(await wallet.exportActiveWalletPrivateKey(TEST_PASSWORD)).toBe(WIF);
    }
  });

  it('re-encrypts a legacy CryptoJS key to the modern format on export', async () => {
    const created = await StorageService.createWallet({
      name: 'Legacy',
      address: ADDRESS,
      privateKey: CryptoJS.AES.encrypt(WIF, TEST_PASSWORD).toString(),
      isEncrypted: true,
    });

    expect(await wallet.exportActiveWalletPrivateKey(TEST_PASSWORD)).toBe(WIF);

    // The stored blob should now be scrypt/AES-GCM hex, not the old base64 form.
    const stored = await StorageService.getWalletById(created.id!);
    expect(stored?.privateKey).toMatch(/^v2\./);
    expect(stored?.privateKey).not.toBe(created.privateKey);
  });
});

describe('exportActiveWalletMnemonic', () => {
  it('returns the mnemonic for the right password', async () => {
    await createWallet();
    expect(await wallet.exportActiveWalletMnemonic(TEST_PASSWORD)).toBe(TEST_MNEMONIC);
  });

  it('refuses without a password, and with the wrong one', async () => {
    await createWallet();

    await expect(wallet.exportActiveWalletMnemonic()).rejects.toThrow(/Password required/);
    await expect(wallet.exportActiveWalletMnemonic('nope')).rejects.toThrow(/Invalid password/);
  });

  it('refuses when the wallet has no mnemonic', async () => {
    await StorageService.createWallet({
      name: 'KeyOnly',
      address: ADDRESS,
      privateKey: WIF,
      isEncrypted: false,
    });

    await expect(wallet.exportActiveWalletMnemonic(TEST_PASSWORD)).rejects.toThrow(
      /No mnemonic available/,
    );
  });
});

describe('getWalletDescriptor', () => {
  it('derives a checksummed descriptor from an HD wallet', async () => {
    const created = await createWallet();

    const descriptor = await wallet.getWalletDescriptor(created, TEST_PASSWORD);

    expect(descriptor).toMatch(/^pkh\(\[[0-9a-f]{8}\/44h\/921h\/0h\]xpub[a-zA-Z0-9]+\/0\/\*\)#[a-z0-9]{8}$/);
  });

  it('produces a descriptor that parses back to the same parameters', async () => {
    const created = await createWallet();

    const descriptor = await wallet.getWalletDescriptor(created, TEST_PASSWORD);
    const parsed = WalletService.parseDescriptor(descriptor);

    expect(parsed.addrType).toBe('p2pkh');
    expect(parsed.purpose).toBe(44);
    expect(parsed.coinType).toBe(921);
    expect(parsed.isPrivate).toBe(false);
  });

  it('carries a non-default script type and coin type through', async () => {
    const created = await createWallet({ addressType: 'p2wpkh', coinType: 175 });

    const parsed = WalletService.parseDescriptor(
      await wallet.getWalletDescriptor(created, TEST_PASSWORD),
    );

    expect(parsed.addrType).toBe('p2wpkh');
    expect(parsed.purpose).toBe(84);
    expect(parsed.coinType).toBe(175);
  });

  it('never leaks a private key into the descriptor', async () => {
    const created = await createWallet();

    const descriptor = await wallet.getWalletDescriptor(created, TEST_PASSWORD);

    expect(descriptor).not.toContain('xprv');
    expect(descriptor).not.toContain(WIF);
    expect(descriptor).not.toContain('abandon');
  });

  it('refuses the wrong password rather than emitting a descriptor for the wrong keys', async () => {
    const created = await createWallet();

    await expect(wallet.getWalletDescriptor(created, 'wrong-password')).rejects.toThrow();
  });

  it('returns the stored descriptor verbatim for a descriptor-imported wallet', async () => {
    const body = buildDescriptorBody('p2wpkh', 'deadbeef', 84, 921, 'xpub6C');
    const stored = `${body}#${descriptorChecksum(body)}`;
    const created = await StorageService.createWallet({
      name: 'Imported',
      address: ADDRESS,
      privateKey: 'encrypted',
      descriptor: stored,
      isEncrypted: true,
    });

    expect(await wallet.getWalletDescriptor(created, TEST_PASSWORD)).toBe(stored);
  });

  it('refuses a wallet with neither a mnemonic nor a descriptor', async () => {
    const created = await StorageService.createWallet({
      name: 'KeyOnly',
      address: ADDRESS,
      privateKey: WIF,
      isEncrypted: false,
    });

    await expect(wallet.getWalletDescriptor(created, TEST_PASSWORD)).rejects.toThrow(
      /requires an HD wallet with a mnemonic/,
    );
  });
});

describe('checkWalletRecoveryOptions', () => {
  it('describes an existing wallet and offers no way in, because none is needed', async () => {
    await createWallet();

    const options = await wallet.checkWalletRecoveryOptions();

    expect(options.hasWallet).toBe(true);
    expect(options.isEncrypted).toBe(true);
    expect(options.hasMnemonic).toBe(true);
    // recoveryOptions lists ways to *obtain* a wallet, so it is empty once one exists.
    expect(options.recoveryOptions).toEqual([]);
  });

  it('offers the ways in when there is no wallet', async () => {
    const options = await wallet.checkWalletRecoveryOptions();

    expect(options.hasWallet).toBe(false);
    expect(options.hasMnemonic).toBe(false);
    expect(options.recoveryOptions).toHaveLength(3);
    expect(options.recoveryOptions.join(' ')).toMatch(/mnemonic/i);
  });

  it('notices a wallet that has a key but no mnemonic', async () => {
    await StorageService.createWallet({
      name: 'KeyOnly',
      address: ADDRESS,
      privateKey: WIF,
      isEncrypted: false,
    });

    const options = await wallet.checkWalletRecoveryOptions();

    expect(options.hasWallet).toBe(true);
    expect(options.hasMnemonic).toBe(false);
    expect(options.isEncrypted).toBe(false);
  });
});
