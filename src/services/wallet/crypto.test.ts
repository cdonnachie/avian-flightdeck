import { describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoinMessage from 'bitcoinjs-message';
import * as CryptoJS from 'crypto-js';

import {
  ADDRESS_TYPE_INFO,
  avianNetwork,
  decryptData,
  deriveAddress,
  legacyDecrypt,
  purposeForAddressType,
  recoverPubKey,
  secureEncrypt,
  generateMLDSA44Address,
} from './WalletService';

const ECPair = ECPairFactory(ecc);

/** A fixed key so address expectations are stable across runs. */
const FIXED_PRIVATE_KEY = Buffer.from(
  '0000000000000000000000000000000000000000000000000000000000000001',
  'hex',
);

const fixedPair = ECPair.fromPrivateKey(FIXED_PRIVATE_KEY, { network: avianNetwork });
const fixedPubkey = Buffer.from(fixedPair.publicKey);

describe('avianNetwork', () => {
  it('carries the Avian mainnet parameters the whole wallet depends on', () => {
    // These bytes decide what every address in the wallet looks like; a change here would
    // silently move users onto a different chain's address space.
    expect(avianNetwork.pubKeyHash).toBe(0x3c);
    expect(avianNetwork.scriptHash).toBe(0x7a);
    expect(avianNetwork.wif).toBe(0x80);
    expect(avianNetwork.bech32).toBe('avn');
    expect(avianNetwork.messagePrefix).toBe('\x16Raven Signed Message:\n');
    expect(avianNetwork.bip32).toEqual({ public: 0x0488b21e, private: 0x0488ade4 });
  });
});

describe('deriveAddress', () => {
  it('produces a legacy P2PKH address starting with R', () => {
    const address = deriveAddress(fixedPubkey, 'p2pkh');
    expect(address.startsWith('R')).toBe(true);
    expect(address).toBe(
      bitcoin.payments.p2pkh({ pubkey: fixedPubkey, network: avianNetwork }).address,
    );
  });

  it('produces a native SegWit address in the avn1 human-readable part', () => {
    const address = deriveAddress(fixedPubkey, 'p2wpkh');
    expect(address.startsWith('avn1')).toBe(true);
  });

  it('produces a wrapped SegWit address starting with r', () => {
    const address = deriveAddress(fixedPubkey, 'p2sh-p2wpkh');
    expect(address.startsWith('r')).toBe(true);
    expect(address.startsWith('R')).toBe(false);
  });

  it('defaults to P2PKH, which is what asset operations require', () => {
    expect(deriveAddress(fixedPubkey)).toBe(deriveAddress(fixedPubkey, 'p2pkh'));
  });

  it('gives every address type a different address for the same key', () => {
    const addresses = new Set([
      deriveAddress(fixedPubkey, 'p2pkh'),
      deriveAddress(fixedPubkey, 'p2wpkh'),
      deriveAddress(fixedPubkey, 'p2sh-p2wpkh'),
    ]);
    expect(addresses.size).toBe(3);
  });

  it('round-trips through bitcoinjs address decoding on the Avian network', () => {
    for (const type of ['p2pkh', 'p2wpkh', 'p2sh-p2wpkh'] as const) {
      const address = deriveAddress(fixedPubkey, type);
      expect(() => bitcoin.address.toOutputScript(address, avianNetwork)).not.toThrow();
    }
  });

  it('rejects a public key that is not a point on the curve', () => {
    expect(() => deriveAddress(Buffer.alloc(33, 7), 'p2pkh')).toThrow();
  });
});

describe('purposeForAddressType', () => {
  it('maps each script type to its BIP purpose level', () => {
    expect(purposeForAddressType('p2pkh')).toBe(44);
    expect(purposeForAddressType('p2sh-p2wpkh')).toBe(49);
    expect(purposeForAddressType('p2wpkh')).toBe(84);
  });

  it('keeps the label table in step with the purpose numbers', () => {
    expect(ADDRESS_TYPE_INFO.p2pkh.bipLabel).toBe('BIP44');
    expect(ADDRESS_TYPE_INFO['p2sh-p2wpkh'].bipLabel).toBe('BIP49');
    expect(ADDRESS_TYPE_INFO.p2wpkh.bipLabel).toBe('BIP84');
  });
});

describe('secureEncrypt / decryptData', () => {
  const password = 'a-sufficiently-long-password';

  it('round-trips a secret', async () => {
    const encrypted = await secureEncrypt('super secret mnemonic words', password);
    const { decrypted, wasLegacy } = await decryptData(encrypted, password);

    expect(decrypted).toBe('super secret mnemonic words');
    expect(wasLegacy).toBe(false);
  });

  it('never emits the plaintext', async () => {
    const encrypted = await secureEncrypt('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ', password);
    expect(encrypted).not.toContain('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
    expect(encrypted).toMatch(/^[0-9a-f]+$/);
  });

  it('produces a different ciphertext every time, so salt and IV are not reused', async () => {
    const first = await secureEncrypt('same input', password);
    const second = await secureEncrypt('same input', password);

    expect(first).not.toBe(second);
    // Salt is the leading 16 bytes; identical salts would mean a broken RNG.
    expect(first.slice(0, 32)).not.toBe(second.slice(0, 32));
  });

  it('refuses the wrong password', async () => {
    const encrypted = await secureEncrypt('secret', password);
    await expect(decryptData(encrypted, 'not-the-password')).rejects.toThrow(
      /Invalid password or corrupted data/,
    );
  });

  it('refuses tampered ciphertext, because the payload is authenticated', async () => {
    const encrypted = await secureEncrypt('secret', password);
    // Flip a byte in the ciphertext body, past salt, IV and tag.
    const tampered =
      encrypted.slice(0, encrypted.length - 2) +
      (encrypted.slice(-2) === 'ff' ? '00' : 'ff');

    await expect(decryptData(tampered, password)).rejects.toThrow(
      /Invalid password or corrupted data/,
    );
  });

  it('refuses a truncated payload', async () => {
    const encrypted = await secureEncrypt('secret', password);
    await expect(decryptData(encrypted.slice(0, 40), password)).rejects.toThrow();
  });

  it('handles unicode and long inputs', async () => {
    const payload = `${'字'.repeat(500)} — ✓`;
    const encrypted = await secureEncrypt(payload, password);
    expect((await decryptData(encrypted, password)).decrypted).toBe(payload);
  });

  it('handles an empty string as a distinct value from a failure', async () => {
    const encrypted = await secureEncrypt('', password);
    expect((await decryptData(encrypted, password)).decrypted).toBe('');
  });
});

describe('legacy decryption path', () => {
  // Wallets encrypted before the scrypt migration must still open, or their owners lose funds.
  const password = 'legacy-password';

  it('reads a CryptoJS payload and flags it as legacy', async () => {
    const legacyBlob = CryptoJS.AES.encrypt('legacy mnemonic', password).toString();

    const { decrypted, wasLegacy } = await decryptData(legacyBlob, password);

    expect(decrypted).toBe('legacy mnemonic');
    expect(wasLegacy).toBe(true);
  });

  it('rejects a legacy payload opened with the wrong password', async () => {
    const legacyBlob = CryptoJS.AES.encrypt('legacy mnemonic', password).toString();

    await expect(decryptData(legacyBlob, 'wrong')).rejects.toThrow(
      /Invalid password or corrupted data/,
    );
  });

  it('throws rather than returning an empty string when legacy decryption fails', () => {
    const legacyBlob = CryptoJS.AES.encrypt('x', password).toString();
    expect(() => legacyDecrypt(legacyBlob, 'wrong')).toThrow(/Legacy decryption failed/);
  });
});

describe('recoverPubKey', () => {
  const message = 'prove you own this address';

  const sign = (compressed: boolean) => {
    const pair = ECPair.fromPrivateKey(FIXED_PRIVATE_KEY, {
      network: avianNetwork,
      compressed,
    });
    return bitcoinMessage
      .sign(message, Buffer.from(pair.privateKey!), compressed, avianNetwork.messagePrefix)
      .toString('base64');
  };

  it('recovers the compressed public key that signed a message', () => {
    const recovered = Buffer.from(recoverPubKey(message, sign(true)));
    expect(recovered.toString('hex')).toBe(fixedPubkey.toString('hex'));
    expect(recovered).toHaveLength(33);
  });

  it('recovers an uncompressed key and reports it as 65 bytes', () => {
    const recovered = Buffer.from(recoverPubKey(message, sign(false)));
    expect(recovered).toHaveLength(65);
  });

  it('recovers a key that hashes back to the signing address', () => {
    const signature = sign(true);
    const recovered = Buffer.from(recoverPubKey(message, signature));

    expect(deriveAddress(recovered, 'p2pkh')).toBe(deriveAddress(fixedPubkey, 'p2pkh'));
  });

  it('does not recover the signing key from a different message', () => {
    const recovered = Buffer.from(recoverPubKey('a different message', sign(true)));
    expect(recovered.toString('hex')).not.toBe(fixedPubkey.toString('hex'));
  });

  it('rejects a signature whose header byte is out of range', () => {
    const bad = Buffer.concat([Buffer.from([0x02]), Buffer.alloc(64, 1)]).toString('base64');
    expect(() => recoverPubKey(message, bad)).toThrow(/Invalid signature flag/);
  });
});

describe('post-quantum stub', () => {
  it('refuses to pretend RIP-25 addresses work on mainnet', () => {
    expect(() => generateMLDSA44Address()).toThrow(/testnet\/regtest/);
  });
});
