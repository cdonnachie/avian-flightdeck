import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Address derivation is where a silent regression is most expensive: a wrong coin type, purpose
 * or network byte produces addresses that look fine but cannot be spent from. The expected
 * values below are golden vectors for the published BIP39 test mnemonic — they must never
 * change without a deliberate, documented reason.
 */

// deriveAddressesWithBalances builds its own ElectrumService and connects, so the network layer
// is replaced wholesale for this file.
vi.mock('../core/ElectrumService', () => {
  class ElectrumService {
    isConnectedToServer() {
      return true;
    }
    async connect() {}
    async getBalance() {
      return 0;
    }
    async getTransactionHistory() {
      return [];
    }
    async disconnect() {}
  }
  return { ElectrumService };
});

import { WalletService, decryptData } from './WalletService';
import { StorageService } from '@/services/core/StorageService';
import { TEST_MNEMONIC, TEST_PASSWORD, resetStorage } from '@/test/helpers';

const GOLDEN = {
  /** m/44'/921'/0'/0/0 — the wallet's default path */
  avianAccount0: 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG',
  avianAccount0Wif: 'KwgGM49xXFfGn1FK3JjbaKHzjNq2jydshvoYmwqjnGAsA4FeuqS4',
  /** Same path, BIP39 passphrase "trezor" */
  withPassphrase: 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF',
  /** m/44'/175'/0'/0/0 — Ravencoin-legacy coin type */
  ravencoinAccount0: 'RDjNvZL1TJQ7R8L23jDutdEioQG4eTC38V',
  /** m/84'/921'/0'/0/0 */
  nativeSegwit: 'avn1qwq3xtmwmzelhwdtvfc9dslda32mlrngceqk4mr',
  /** m/49'/921'/0'/0/0 */
  wrappedSegwit: 'rPfwFThd2xyfJWYqRMRk5gPihXMMwXdfJT',
  /** m/44'/921'/0'/0/1 */
  index1: 'RUqbuDKvv8x31EVVmNfmdb31BQ7xG6HDmU',
  /** m/44'/921'/0'/1/0 — first change address */
  change0: 'RR1Mpon9wYPdZYfJMuew7YmeidJ9q4aZ5Y',
  /** m/44'/921'/1'/0/0 — second account */
  account1: 'RU4xj9ArRCSU3mcqobx5i9FTjMB1Z4kk9J',
};

let wallet: WalletService;

beforeEach(() => {
  resetStorage();
  wallet = new WalletService();
});

describe('generateWalletFromMnemonic', () => {
  it('derives the documented address for the published test mnemonic', async () => {
    const result = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
    expect(result.address).toBe(GOLDEN.avianAccount0);
  });

  it('is deterministic across calls', async () => {
    const first = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
    const second = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, 'another-password');
    expect(first.address).toBe(second.address);
  });

  it('encrypts both the private key and the mnemonic at rest', async () => {
    const result = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

    expect(result.privateKey).not.toContain(GOLDEN.avianAccount0Wif);
    expect(result.mnemonic).not.toContain('abandon');

    expect((await decryptData(result.privateKey, TEST_PASSWORD)).decrypted).toBe(
      GOLDEN.avianAccount0Wif,
    );
    expect((await decryptData(result.mnemonic!, TEST_PASSWORD)).decrypted).toBe(TEST_MNEMONIC);
  });

  it('stores the encrypted mnemonic on the active wallet so it can be recovered later', async () => {
    // The legacy single-wallet accessors write through to whichever wallet is active.
    await StorageService.createWallet({
      name: 'Active',
      address: GOLDEN.avianAccount0,
      privateKey: 'placeholder',
      isEncrypted: true,
    });

    await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

    const stored = await StorageService.getMnemonic();
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('abandon');
    expect((await decryptData(stored, TEST_PASSWORD)).decrypted).toBe(TEST_MNEMONIC);
  });

  it('silently discards the mnemonic when there is no active wallet to attach it to', async () => {
    // Documents a sharp edge: StorageService.setMnemonic is a no-op without an active wallet,
    // so generateWalletFromMnemonic succeeds while persisting nothing.
    const result = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

    expect(result.mnemonic).toBeTruthy();
    expect(await StorageService.getMnemonic()).toBe('');
    expect(await StorageService.hasMnemonic()).toBe(false);
  });

  it('produces a different wallet when a BIP39 passphrase is supplied', async () => {
    const result = await wallet.generateWalletFromMnemonic(
      TEST_MNEMONIC,
      TEST_PASSWORD,
      'trezor',
    );

    expect(result.address).toBe(GOLDEN.withPassphrase);
    expect(result.address).not.toBe(GOLDEN.avianAccount0);
  });

  it('treats an empty passphrase as no passphrase', async () => {
    const withEmpty = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD, '');
    expect(withEmpty.address).toBe(GOLDEN.avianAccount0);
  });

  it('rejects a password under eight characters', async () => {
    await expect(wallet.generateWalletFromMnemonic(TEST_MNEMONIC, 'short')).rejects.toThrow(
      /at least 8 characters/,
    );
    await expect(wallet.generateWalletFromMnemonic(TEST_MNEMONIC, '')).rejects.toThrow(
      /at least 8 characters/,
    );
  });

  it('rejects a mnemonic that fails the BIP39 checksum', async () => {
    const badChecksum = TEST_MNEMONIC.replace(/about$/, 'abandon');
    await expect(wallet.generateWalletFromMnemonic(badChecksum, TEST_PASSWORD)).rejects.toThrow();
  });

  it('rejects a mnemonic with a word outside the wordlist', async () => {
    const notAWord = TEST_MNEMONIC.replace(/about$/, 'zzzzzz');
    await expect(wallet.generateWalletFromMnemonic(notAWord, TEST_PASSWORD)).rejects.toThrow();
  });
});

describe('generateWallet', () => {
  it('creates a fresh, encrypted, mnemonic-backed wallet', async () => {
    const result = await wallet.generateWallet(TEST_PASSWORD);

    expect(result.address.startsWith('R')).toBe(true);
    expect(result.mnemonic).toBeTruthy();

    const mnemonic = (await decryptData(result.mnemonic!, TEST_PASSWORD)).decrypted;
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(await wallet.validateMnemonic(mnemonic)).toBe(true);
  });

  it('creates a different wallet every time', async () => {
    const first = await wallet.generateWallet(TEST_PASSWORD);
    const second = await wallet.generateWallet(TEST_PASSWORD);
    expect(first.address).not.toBe(second.address);
  });

  it('can create a keypair-only wallet with no mnemonic', async () => {
    const result = await wallet.generateWallet(TEST_PASSWORD, false);

    expect(result.address.startsWith('R')).toBe(true);
    expect(result.mnemonic).toBeUndefined();
  });

  it('requires a password of at least eight characters', async () => {
    await expect(wallet.generateWallet('1234567')).rejects.toThrow(/at least 8 characters/);
  });
});

describe('restoreWallet', () => {
  it('recovers the address from a plain WIF key', async () => {
    const restored = await wallet.restoreWallet(GOLDEN.avianAccount0Wif);
    expect(restored.address).toBe(GOLDEN.avianAccount0);
  });

  it('recovers the address from an encrypted key plus password', async () => {
    const generated = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

    const restored = await wallet.restoreWallet(generated.privateKey, TEST_PASSWORD);
    expect(restored.address).toBe(GOLDEN.avianAccount0);
  });

  it('fails on the wrong password rather than returning a wrong address', async () => {
    const generated = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
    await expect(wallet.restoreWallet(generated.privateKey, 'wrong-password')).rejects.toThrow();
  });

  it('rejects a malformed key', async () => {
    await expect(wallet.restoreWallet('not-a-wif')).rejects.toThrow();
  });
});

describe('key validation helpers', () => {
  it('accepts a valid Avian WIF and rejects anything else', async () => {
    expect(await wallet.validatePrivateKey(GOLDEN.avianAccount0Wif)).toBe(true);
    expect(await wallet.validatePrivateKey('not-a-wif')).toBe(false);
    expect(await wallet.validatePrivateKey('')).toBe(false);
    // Valid base58 but the wrong network version byte.
    expect(
      await wallet.validatePrivateKey('cVjzvdHGfQDtBEq7oGDsJUgqhCJ5rF2gPGjJzYQ9y2eqKcJyEyQz'),
    ).toBe(false);
  });

  it('round-trips a WIF through encode and decode', () => {
    const result = WalletService.testWIFCompatibility(GOLDEN.avianAccount0Wif);
    expect(result.success).toBe(true);
    expect(result.address).toBe(GOLDEN.avianAccount0);
  });

  it('reports failure with a reason for an invalid WIF', () => {
    const result = WalletService.testWIFCompatibility('nonsense');
    expect(result.success).toBe(false);
    expect(result.address).toBe('');
    expect(result.error).toBeTruthy();
  });

  it('validates mnemonics', async () => {
    expect(await wallet.validateMnemonic(TEST_MNEMONIC)).toBe(true);
    expect(await wallet.validateMnemonic('not a real mnemonic phrase at all')).toBe(false);
    expect(await wallet.validateMnemonic('')).toBe(false);
  });
});

describe('deriveAddressesWithBalances', () => {
  it('derives the default BIP44 Avian chain', async () => {
    const derived = await WalletService.deriveAddressesWithBalances(TEST_MNEMONIC, '', 0, 2);

    expect(derived).toHaveLength(2);
    expect(derived[0]).toMatchObject({
      path: "m/44'/921'/0'/0/0",
      address: GOLDEN.avianAccount0,
    });
    expect(derived[1]).toMatchObject({
      path: "m/44'/921'/0'/0/1",
      address: GOLDEN.index1,
    });
  });

  it('derives the Ravencoin-legacy coin type when asked', async () => {
    const derived = await WalletService.deriveAddressesWithBalances(
      TEST_MNEMONIC,
      '',
      0,
      1,
      'p2pkh',
      0,
      175,
    );

    expect(derived[0].path).toBe("m/44'/175'/0'/0/0");
    expect(derived[0].address).toBe(GOLDEN.ravencoinAccount0);
  });

  it('uses the right BIP purpose for each script type', async () => {
    const [native] = await WalletService.deriveAddressesWithBalances(
      TEST_MNEMONIC,
      '',
      0,
      1,
      'p2wpkh',
    );
    expect(native.path).toBe("m/84'/921'/0'/0/0");
    expect(native.address).toBe(GOLDEN.nativeSegwit);

    const [wrapped] = await WalletService.deriveAddressesWithBalances(
      TEST_MNEMONIC,
      '',
      0,
      1,
      'p2sh-p2wpkh',
    );
    expect(wrapped.path).toBe("m/49'/921'/0'/0/0");
    expect(wrapped.address).toBe(GOLDEN.wrappedSegwit);
  });

  it('falls back to legacy P2PKH for an unrecognised address type', async () => {
    const [derived] = await WalletService.deriveAddressesWithBalances(
      TEST_MNEMONIC,
      '',
      0,
      1,
      'p2tr-not-supported',
    );

    expect(derived.path).toBe("m/44'/921'/0'/0/0");
    expect(derived.address).toBe(GOLDEN.avianAccount0);
  });

  it('derives the change chain separately from the receive chain', async () => {
    const [change] = await WalletService.deriveAddressesWithBalances(
      TEST_MNEMONIC,
      '',
      0,
      1,
      'p2pkh',
      1,
    );

    expect(change.path).toBe("m/44'/921'/0'/1/0");
    expect(change.address).toBe(GOLDEN.change0);
    expect(change.address).not.toBe(GOLDEN.avianAccount0);
  });

  it('derives a second account independently', async () => {
    const [account1] = await WalletService.deriveAddressesWithBalances(TEST_MNEMONIC, '', 1, 1);

    expect(account1.path).toBe("m/44'/921'/1'/0/0");
    expect(account1.address).toBe(GOLDEN.account1);
  });

  it('applies the BIP39 passphrase', async () => {
    const [derived] = await WalletService.deriveAddressesWithBalances(TEST_MNEMONIC, 'trezor', 0, 1);
    expect(derived.address).toBe(GOLDEN.withPassphrase);
  });

  it('reports the balance and history flags from the network layer', async () => {
    const [derived] = await WalletService.deriveAddressesWithBalances(TEST_MNEMONIC, '', 0, 1);
    expect(derived.balance).toBe(0);
    expect(derived.hasTransactions).toBe(false);
  });

  it('refuses an invalid mnemonic before touching the network', async () => {
    await expect(
      WalletService.deriveAddressesWithBalances('not a mnemonic', '', 0, 1),
    ).rejects.toThrow(/Invalid BIP39 mnemonic/);
  });

  it('produces unique addresses across an index range', async () => {
    const derived = await WalletService.deriveAddressesWithBalances(TEST_MNEMONIC, '', 0, 10);
    expect(new Set(derived.map((entry) => entry.address)).size).toBe(10);
  });
});

describe('validateWalletPassword', () => {
  /** Sets up an encrypted active wallet holding a mnemonic, which is what the app does. */
  const setUpEncryptedWallet = async () => {
    await StorageService.createWallet({
      name: 'Active',
      address: GOLDEN.avianAccount0,
      privateKey: 'placeholder',
      isEncrypted: true,
    });
    const generated = await wallet.generateWalletFromMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
    await StorageService.setPrivateKey(generated.privateKey);
    return generated;
  };

  it('accepts the password that encrypted the stored mnemonic', async () => {
    await setUpEncryptedWallet();
    expect(await wallet.validateWalletPassword(TEST_PASSWORD)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    await setUpEncryptedWallet();
    expect(await wallet.validateWalletPassword('wrong-password')).toBe(false);
  });

  it('accepts any password when the wallet is not encrypted', async () => {
    await StorageService.createWallet({
      name: 'Plain',
      address: GOLDEN.avianAccount0,
      privateKey: GOLDEN.avianAccount0Wif,
      isEncrypted: false,
    });

    expect(await wallet.validateWalletPassword('anything at all')).toBe(true);
  });

  it('refuses any password when there is no wallet to check it against', async () => {
    // Regression cover: this used to answer true for any password, because with no active
    // wallet the encryption check read false and short-circuited to "valid".
    expect(await wallet.validateWalletPassword('anything at all')).toBe(false);
    expect(await wallet.validateWalletPassword('')).toBe(false);
  });
});
