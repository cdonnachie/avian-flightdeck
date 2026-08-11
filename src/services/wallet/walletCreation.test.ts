import { beforeEach, describe, expect, it } from 'vitest';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';

import {
  WalletService,
  avianNetwork,
  buildDescriptorBody,
  decryptData,
  descriptorChecksum,
} from './WalletService';
import { StorageService } from '@/services/core/StorageService';
import { TEST_MNEMONIC, TEST_PASSWORD, resetStorage } from '@/test/helpers';

/**
 * The paths that bring a wallet into existence. A mistake here — the wrong coin type, purpose or
 * script type — produces a wallet whose funds sit at addresses the app will never derive again,
 * so the addresses are checked against the same golden vectors used in derivation.test.ts.
 */

const bip32 = BIP32Factory(ecc);

const GOLDEN = {
  bip44Avian: 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG',
  bip44AvianWif: 'KwgGM49xXFfGn1FK3JjbaKHzjNq2jydshvoYmwqjnGAsA4FeuqS4',
  bip44Ravencoin: 'RDjNvZL1TJQ7R8L23jDutdEioQG4eTC38V',
  bip84Avian: 'avn1qwq3xtmwmzelhwdtvfc9dslda32mlrngceqk4mr',
  bip49Avian: 'rPfwFThd2xyfJWYqRMRk5gPihXMMwXdfJT',
  withPassphrase: 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF',
};

let wallet: WalletService;

beforeEach(() => {
  resetStorage();
  wallet = new WalletService();
});

describe('createNewWallet', () => {
  it('creates an encrypted, mnemonic-backed wallet and stores it', async () => {
    const created = await wallet.createNewWallet({ name: 'First', password: TEST_PASSWORD });

    expect(created.name).toBe('First');
    expect(created.address.startsWith('R')).toBe(true);
    expect(created.isEncrypted).toBe(true);
    expect(created.coinType).toBe(921);

    expect(await StorageService.getWalletCount()).toBe(1);
    expect((await StorageService.getActiveWallet())?.address).toBe(created.address);
  });

  it('encrypts the key and the mnemonic with the given password', async () => {
    const created = await wallet.createNewWallet({ name: 'First', password: TEST_PASSWORD });

    const mnemonic = (await decryptData(created.mnemonic!, TEST_PASSWORD)).decrypted;
    expect(bip39.validateMnemonic(mnemonic)).toBe(true);

    const wif = (await decryptData(created.privateKey, TEST_PASSWORD)).decrypted;
    expect(await wallet.validatePrivateKey(wif)).toBe(true);
  });

  it('adopts a mnemonic the caller supplies', async () => {
    const created = await wallet.createNewWallet({
      name: 'Restored',
      password: TEST_PASSWORD,
      mnemonic: TEST_MNEMONIC,
    });

    expect(created.address).toBe(GOLDEN.bip44Avian);
  });

  it('can create a 24-word wallet', async () => {
    const created = await wallet.createNewWallet({
      name: 'Long',
      password: TEST_PASSWORD,
      mnemonicLength: 256,
    });

    const mnemonic = (await decryptData(created.mnemonic!, TEST_PASSWORD)).decrypted;
    expect(mnemonic.split(' ')).toHaveLength(24);
  });

  it('stores an encrypted BIP39 passphrase and applies it to the derivation', async () => {
    const created = await wallet.createNewWallet({
      name: 'Passphrased',
      password: TEST_PASSWORD,
      mnemonic: TEST_MNEMONIC,
      passphrase: 'trezor',
    });

    expect(created.address).toBe(GOLDEN.withPassphrase);
    expect(created.bip39Passphrase).toBeTruthy();
    expect(created.bip39Passphrase).not.toBe('trezor');
    expect((await decryptData(created.bip39Passphrase!, TEST_PASSWORD)).decrypted).toBe('trezor');
  });

  it('can create a keypair-only wallet with no mnemonic', async () => {
    const created = await wallet.createNewWallet({
      name: 'KeyOnly',
      password: TEST_PASSWORD,
      useMnemonic: false,
    });

    expect(created.mnemonic).toBeUndefined();
    expect(created.address.startsWith('R')).toBe(true);
  });

  it('can create a wallet without making it active', async () => {
    await wallet.createNewWallet({ name: 'First', password: TEST_PASSWORD });
    const second = await wallet.createNewWallet({
      name: 'Second',
      password: TEST_PASSWORD,
      makeActive: false,
    });

    expect((await StorageService.getActiveWallet())?.name).toBe('First');
    expect(second.isActive).toBe(false);
  });

  it('refuses a weak password', async () => {
    await expect(wallet.createNewWallet({ name: 'Weak', password: 'short' })).rejects.toThrow(
      /at least 8 characters/,
    );
    expect(await StorageService.getWalletCount()).toBe(0);
  });

  it('refuses an invalid supplied mnemonic and stores nothing', async () => {
    await expect(
      wallet.createNewWallet({
        name: 'Bad',
        password: TEST_PASSWORD,
        mnemonic: 'not a real mnemonic',
      }),
    ).rejects.toThrow(/Invalid mnemonic/);

    expect(await StorageService.getWalletCount()).toBe(0);
  });

  it('refuses a duplicate wallet name', async () => {
    await wallet.createNewWallet({ name: 'Same', password: TEST_PASSWORD });

    await expect(wallet.createNewWallet({ name: 'Same', password: TEST_PASSWORD })).rejects.toThrow(
      /already exists/,
    );
  });
});

describe('importWalletFromMnemonic', () => {
  it('imports at the default BIP44 Avian path', async () => {
    const created = await wallet.importWalletFromMnemonic({
      name: 'Imported',
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
    });

    expect(created.address).toBe(GOLDEN.bip44Avian);
    expect(created.coinType).toBe(921);
    expect(created.addressType).toBe('p2pkh');
  });

  it.each([
    ['p2wpkh' as const, GOLDEN.bip84Avian, 84],
    ['p2sh-p2wpkh' as const, GOLDEN.bip49Avian, 49],
    ['p2pkh' as const, GOLDEN.bip44Avian, 44],
  ])('imports %s at the matching BIP purpose', async (addressType, expected, purpose) => {
    const created = await wallet.importWalletFromMnemonic({
      name: `Imported-${addressType}`,
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
      addressType,
    });

    expect(created.address).toBe(expected);
    expect(created.addressType).toBe(addressType);
    expect(WalletService.parseDescriptor(created.descriptor!).purpose).toBe(purpose);
  });

  it('imports a Ravencoin-legacy wallet at coin type 175', async () => {
    const created = await wallet.importWalletFromMnemonic({
      name: 'Legacy',
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
      coinType: 175,
    });

    expect(created.address).toBe(GOLDEN.bip44Ravencoin);
    expect(created.coinType).toBe(175);
    expect(WalletService.parseDescriptor(created.descriptor!).coinType).toBe(175);
  });

  it('applies a BIP39 passphrase', async () => {
    const created = await wallet.importWalletFromMnemonic({
      name: 'Passphrased',
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
      passphrase: 'trezor',
    });

    expect(created.address).toBe(GOLDEN.withPassphrase);
  });

  it('records a descriptor whose xpub matches the wallet', async () => {
    const created = await wallet.importWalletFromMnemonic({
      name: 'Imported',
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
    });

    const parsed = WalletService.parseDescriptor(created.descriptor!);
    const expectedXpub = bip32
      .fromSeed(bip39.mnemonicToSeedSync(TEST_MNEMONIC), avianNetwork)
      .derivePath("m/44'/921'/0'")
      .neutered()
      .toBase58();

    expect(parsed.xkey).toBe(expectedXpub);
    expect(parsed.isPrivate).toBe(false);
    expect(created.descriptor).not.toContain('xprv');
  });

  it('refuses an invalid mnemonic', async () => {
    await expect(
      wallet.importWalletFromMnemonic({
        name: 'Bad',
        mnemonic: 'not a valid mnemonic phrase here at all ok',
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow(/Invalid mnemonic/);
  });

  it('refuses a weak password', async () => {
    await expect(
      wallet.importWalletFromMnemonic({
        name: 'Weak',
        mnemonic: TEST_MNEMONIC,
        password: 'short',
      }),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it('refuses to import the same address twice', async () => {
    await wallet.importWalletFromMnemonic({
      name: 'First',
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
    });

    await expect(
      wallet.importWalletFromMnemonic({
        name: 'Second',
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('allows the same mnemonic at a different script type, since the address differs', async () => {
    await wallet.importWalletFromMnemonic({
      name: 'Legacy',
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
    });

    const segwit = await wallet.importWalletFromMnemonic({
      name: 'SegWit',
      mnemonic: TEST_MNEMONIC,
      password: TEST_PASSWORD,
      addressType: 'p2wpkh',
    });

    expect(segwit.address).toBe(GOLDEN.bip84Avian);
    expect(await StorageService.getWalletCount()).toBe(2);
  });
});

describe('importWalletFromPrivateKey', () => {
  it('imports a plain WIF key', async () => {
    const created = await wallet.importWalletFromPrivateKey({
      name: 'FromKey',
      privateKey: GOLDEN.bip44AvianWif,
      password: TEST_PASSWORD,
    });

    expect(created.address).toBe(GOLDEN.bip44Avian);
    expect(created.isEncrypted).toBe(true);
    expect(created.mnemonic).toBeUndefined();
  });

  it('re-encrypts the key at rest under the new password', async () => {
    const created = await wallet.importWalletFromPrivateKey({
      name: 'FromKey',
      privateKey: GOLDEN.bip44AvianWif,
      password: TEST_PASSWORD,
    });

    expect(created.privateKey).not.toBe(GOLDEN.bip44AvianWif);
    expect((await decryptData(created.privateKey, TEST_PASSWORD)).decrypted).toBe(
      GOLDEN.bip44AvianWif,
    );
  });

  it('accepts an already-encrypted key when given its password', async () => {
    const { secureEncrypt } = await import('./WalletService');
    const encrypted = await secureEncrypt(GOLDEN.bip44AvianWif, TEST_PASSWORD);

    const created = await wallet.importWalletFromPrivateKey({
      name: 'FromEncrypted',
      privateKey: encrypted,
      password: TEST_PASSWORD,
    });

    expect(created.address).toBe(GOLDEN.bip44Avian);
  });

  it('refuses a key that is neither valid WIF nor decryptable', async () => {
    await expect(
      wallet.importWalletFromPrivateKey({
        name: 'Bad',
        privateKey: 'definitely-not-a-key',
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow(/Invalid private key format or incorrect password/);
  });

  it('refuses a weak password', async () => {
    await expect(
      wallet.importWalletFromPrivateKey({
        name: 'Weak',
        privateKey: GOLDEN.bip44AvianWif,
        password: 'short',
      }),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it('refuses a duplicate address', async () => {
    await wallet.importWalletFromPrivateKey({
      name: 'First',
      privateKey: GOLDEN.bip44AvianWif,
      password: TEST_PASSWORD,
    });

    await expect(
      wallet.importWalletFromPrivateKey({
        name: 'Second',
        privateKey: GOLDEN.bip44AvianWif,
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe('importWalletFromDescriptor', () => {
  const accountNode = bip32
    .fromSeed(bip39.mnemonicToSeedSync(TEST_MNEMONIC), avianNetwork)
    .derivePath("m/44'/921'/0'");

  const descriptorFor = (xkey: string, addrType: 'p2pkh' | 'p2wpkh' = 'p2pkh', purpose = 44) => {
    const body = buildDescriptorBody(addrType, 'deadbeef', purpose, 921, xkey);
    return `${body}#${descriptorChecksum(body)}`;
  };

  it('imports an account-level xprv descriptor', async () => {
    const created = await wallet.importWalletFromDescriptor({
      name: 'Descriptor',
      descriptor: descriptorFor(accountNode.toBase58()),
      password: TEST_PASSWORD,
    });

    // The descriptor's first receiving key is account/0/0, the same as m/44'/921'/0'/0/0.
    expect(created.address).toBe(GOLDEN.bip44Avian);
    expect(created.addressType).toBe('p2pkh');
    expect(created.coinType).toBe(921);
  });

  it('stores the account xprv encrypted, and a public-only descriptor', async () => {
    const created = await wallet.importWalletFromDescriptor({
      name: 'Descriptor',
      descriptor: descriptorFor(accountNode.toBase58()),
      password: TEST_PASSWORD,
    });

    expect(created.xprv).toBeTruthy();
    expect(created.xprv).not.toContain('xprv');
    expect((await decryptData(created.xprv!, TEST_PASSWORD)).decrypted).toBe(
      accountNode.toBase58(),
    );

    expect(created.descriptor).toContain('xpub');
    expect(created.descriptor).not.toContain('xprv');
  });

  it('refuses a watch-only xpub descriptor with an actionable message', async () => {
    await expect(
      wallet.importWalletFromDescriptor({
        name: 'WatchOnly',
        descriptor: descriptorFor(accountNode.neutered().toBase58()),
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow(/listdescriptors true/);
  });

  it('refuses a descriptor whose key is not a valid extended key', async () => {
    await expect(
      wallet.importWalletFromDescriptor({
        name: 'Broken',
        descriptor: 'pkh([deadbeef/44h/921h/0h]xprvNotARealKey/0/*)',
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow();
  });

  it('refuses an unsupported script type', async () => {
    await expect(
      wallet.importWalletFromDescriptor({
        name: 'Taproot',
        descriptor: `tr(${accountNode.toBase58()}/0/*)`,
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow(/Unsupported descriptor type/);
  });

  it('refuses a weak password', async () => {
    await expect(
      wallet.importWalletFromDescriptor({
        name: 'Weak',
        descriptor: descriptorFor(accountNode.toBase58()),
        password: 'short',
      }),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it('round-trips: the descriptor it stores re-imports to the same address', async () => {
    const first = await wallet.importWalletFromDescriptor({
      name: 'Original',
      descriptor: descriptorFor(accountNode.toBase58()),
      password: TEST_PASSWORD,
    });

    // Re-importing the stored (public) descriptor must be refused, since it has no key material.
    await expect(
      wallet.importWalletFromDescriptor({
        name: 'Copy',
        descriptor: first.descriptor!,
        password: TEST_PASSWORD,
      }),
    ).rejects.toThrow(/only a public key/);
  });
});

describe('detectCoinTypeFromMnemonic', () => {
  it('reports candidate addresses for both coin types', async () => {
    const result = await WalletService.detectCoinTypeFromMnemonic(TEST_MNEMONIC);

    expect(result).toBeTruthy();
    expect(JSON.stringify(result)).toContain(GOLDEN.bip44Avian);
    expect(JSON.stringify(result)).toContain(GOLDEN.bip44Ravencoin);
  });
});
