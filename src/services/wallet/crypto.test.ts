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
  isValidWIF,
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

  it('round-trips a secret and writes the current Argon2id format', async () => {
    const encrypted = await secureEncrypt('super secret mnemonic words', password);
    const { decrypted, wasLegacy, format } = await decryptData(encrypted, password);

    expect(decrypted).toBe('super secret mnemonic words');
    expect(wasLegacy).toBe(false);
    expect(format).toBe('argon2id');
    // The v2 header is self-describing and records the KDF used.
    const header = JSON.parse(Buffer.from(encrypted.split('.')[1], 'base64').toString('utf-8'));
    expect(header.kdf).toBe('argon2id');
  });

  it('still decrypts a pre-hardening v1 ciphertext, so existing wallets keep opening', async () => {
    // A real blob produced by the original N=16384 (v1) hex format. Generated once with the old
    // parameters; existing wallets are sealed exactly like this and must never be stranded.
    const v1Blob =
      '7519b19070904c1411d9b13e1cf346081b8c9214501fd8a4278eae2685834ad09ec3731e2dd16448524d5a365319fa341037670e21c00595269dd356ac36af991465e08826a87069335f48e227f00ec3888fa2551702e9840e991a449c5ded107b6f12ad5b56086a6f98468c844084f4d8038b57f38ad5';
    const { decrypted, wasLegacy, format } = await decryptData(v1Blob, 'golden-test-password');

    expect(decrypted).toBe('golden v1 secret phrase');
    expect(wasLegacy).toBe(false);
    expect(format).toBe('scrypt');
  });

  it('still decrypts a scrypt v2 blob (wallets deployed before the Argon2id switch)', async () => {
    // A real versioned scrypt blob (kdf:'scrypt'); wallets sealed between the scrypt hardening and
    // the move to Argon2id look exactly like this and must keep opening.
    const scryptV2Blob =
      'v2.eyJrZGYiOiJzY3J5cHQiLCJOIjoxNjM4NCwiciI6OCwicCI6MSwiZGtMZW4iOjMyfQ==.RdYnkfB8LnYg74SIohSK3Dc/PZM8JcDwD9taYVX9ALekeIkdW+2iJidL8VgsbWL3cqrMI+yrpy1yqAfhRqAEPLzZQAAqLPDWlcHMqDFKenRMoQLDZNH016KuRlNKJomXNxlq17DMR7GrBtvJL4jc4KymqkdF0qo=';
    const { decrypted, wasLegacy, format } = await decryptData(scryptV2Blob, 'golden-scrypt2-pw');

    expect(decrypted).toBe('golden scrypt v2 secret');
    expect(wasLegacy).toBe(false);
    expect(format).toBe('scrypt');
  });

  it('decrypts an Argon2id blob and reports it as argon2id', async () => {
    // A fixed Argon2id vector (small params) — proves the argon2id read path and pins the format.
    const argon2Blob =
      'v2.eyJrZGYiOiJhcmdvbjJpZCIsIm0iOjgxOTIsInQiOjIsInAiOjEsImRrTGVuIjozMiwidiI6MTl9.noirpGLBQRyVWFgQeGt4iHtJ1JCPc1Jc7R4EcqyY3dnTz1d5EuVOYJ32TW9lUCM7Z0OuVumS2W16FJ8GTqOhoi08PwTN1vqauL5AZRv6MMGwQSujZK14zm7Zc5DgxllrvPKJDMtuth1sBFuMvwyL7JTJRwfAUw==';
    const { decrypted, wasLegacy, format } = await decryptData(argon2Blob, 'golden-argon2-pw');

    expect(decrypted).toBe('golden argon2id secret');
    expect(wasLegacy).toBe(false);
    expect(format).toBe('argon2id');
  });

  it('never emits the plaintext', async () => {
    const secret = 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ';
    const encrypted = await secureEncrypt(secret, password);
    expect(encrypted).not.toContain(secret);
    // The current format is versioned and self-describing: v2.<base64 header>.<base64 body>.
    expect(encrypted).toMatch(/^v2\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  });

  it('produces a different ciphertext every time, so salt and IV are not reused', async () => {
    const first = await secureEncrypt('same input', password);
    const second = await secureEncrypt('same input', password);

    expect(first).not.toBe(second);
    // The v2 header is deterministic (same KDF params); the salt and IV live in the body, which
    // must differ every time or the RNG is broken.
    expect(first.split('.')[2]).not.toBe(second.split('.')[2]);
  });

  it('refuses the wrong password', async () => {
    const encrypted = await secureEncrypt('secret', password);
    await expect(decryptData(encrypted, 'not-the-password')).rejects.toThrow(
      /Invalid password or corrupted data/,
    );
  });

  it('refuses tampered ciphertext, because the payload is authenticated', async () => {
    const encrypted = await secureEncrypt('secret', password);
    // Corrupt a character in the base64 body (past the `v2.` prefix and the header).
    const dot = encrypted.lastIndexOf('.');
    const body = encrypted.slice(dot + 1);
    const at = Math.floor(body.length / 2);
    const tampered =
      encrypted.slice(0, dot + 1) + body.slice(0, at) + (body[at] === 'A' ? 'B' : 'A') + body.slice(at + 1);

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

  it('never returns the real plaintext for a wrong password', async () => {
    // The legacy format is unauthenticated AES-CBC, so a wrong password cannot be detected
    // reliably: usually the garbage is invalid UTF-8 and this throws, but sometimes it decodes
    // and is returned. Both outcomes are acceptable; returning the *correct* plaintext is not.
    // Each attempt uses a fresh random salt, so this exercises many different ciphertexts.
    for (let attempt = 0; attempt < 40; attempt++) {
      const legacyBlob = CryptoJS.AES.encrypt('legacy mnemonic', password).toString();

      let result: string | null = null;
      try {
        result = (await decryptData(legacyBlob, 'wrong')).decrypted;
      } catch {
        // Rejecting is the good case.
      }

      expect(result).not.toBe('legacy mnemonic');
    }
  });

  it('throws rather than returning an empty string when legacy decryption fails', () => {
    // Deterministic: this ciphertext is fixed, so the wrong password always yields
    // undecodable bytes rather than sometimes-valid UTF-8.
    const legacyBlob = 'U2FsdGVkX1+Nl1rL3dxJ8fZ9pQmKcVhVYqRz3mYQz3E=';
    expect(() => legacyDecrypt(legacyBlob, 'definitely-the-wrong-password')).toThrow(
      /Legacy decryption failed/,
    );
  });

  it('is documented as unauthenticated, so callers must validate what they get back', async () => {
    // Pins the contract the upgrade paths depend on: a legacy result carries no proof of
    // correctness, which is why isValidWIF / validateMnemonic guard every write-back.
    const legacyBlob = CryptoJS.AES.encrypt('not-a-wif', password).toString();

    const { decrypted, wasLegacy } = await decryptData(legacyBlob, password);

    expect(wasLegacy).toBe(true);
    expect(decrypted).toBe('not-a-wif');
    // decryptData happily returns it; only the caller can tell it is not a key.
    expect(isValidWIF(decrypted)).toBe(false);
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
