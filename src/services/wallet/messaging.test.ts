import { beforeEach, describe, expect, it } from 'vitest';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import { WalletService, avianNetwork, secureEncrypt } from './WalletService';
import { TEST_PASSWORD } from '@/test/helpers';

/**
 * ECIES message encryption — a hand-rolled envelope: `BIE1` magic, an ephemeral public key,
 * AES-128-CBC ciphertext and an HMAC-SHA256 tag, keyed by SHA-512 of the ECDH shared point.
 *
 * The properties that matter are that only the intended recipient can read a message, and that a
 * modified envelope is rejected rather than silently decrypted to something else.
 */

const ECPair = ECPairFactory(ecc);
const wallet = new WalletService();

const keyPair = (seed: number) =>
  ECPair.fromPrivateKey(Buffer.alloc(32, seed), { network: avianNetwork });

let recipient: ReturnType<typeof keyPair>;
let recipientPublicKey: string;
let recipientWIF: string;

beforeEach(() => {
  recipient = keyPair(1);
  recipientPublicKey = Buffer.from(recipient.publicKey).toString('hex');
  recipientWIF = recipient.toWIF();
});

describe('round trip', () => {
  it('lets the holder of the private key read the message', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'meet me at the usual place');

    expect(await wallet.decryptMessage(recipientWIF, encrypted)).toBe(
      'meet me at the usual place',
    );
  });

  it('preserves unicode and newlines exactly', async () => {
    const message = 'line one\nline two\t— ✓ 日本語 🕊';
    const encrypted = await wallet.encryptMessage(recipientPublicKey, message);

    expect(await wallet.decryptMessage(recipientWIF, encrypted)).toBe(message);
  });

  it('handles an empty message', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, '');
    expect(await wallet.decryptMessage(recipientWIF, encrypted)).toBe('');
  });

  it('handles a long message', async () => {
    const message = 'x'.repeat(10_000);
    const encrypted = await wallet.encryptMessage(recipientPublicKey, message);

    expect(await wallet.decryptMessage(recipientWIF, encrypted)).toBe(message);
  });

  it('decrypts with a password-protected private key', async () => {
    const encryptedKey = await secureEncrypt(recipientWIF, TEST_PASSWORD);
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'secret');

    expect(await wallet.decryptMessage(encryptedKey, encrypted, TEST_PASSWORD)).toBe('secret');
  });
});

describe('envelope shape', () => {
  it('is base64 carrying the BIE1 magic bytes', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'hello');
    const raw = Buffer.from(encrypted, 'base64');

    expect(raw.subarray(0, 4).toString()).toBe('BIE1');
    // magic + ephemeral pubkey + at least one AES block + MAC
    expect(raw.length).toBeGreaterThanOrEqual(4 + 33 + 16 + 32);
  });

  it('never contains the plaintext', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'TOPSECRETPHRASE');

    expect(encrypted).not.toContain('TOPSECRETPHRASE');
    expect(Buffer.from(encrypted, 'base64').toString('utf8')).not.toContain('TOPSECRETPHRASE');
  });

  it('produces a different envelope every time, because the ephemeral key is fresh', async () => {
    const first = await wallet.encryptMessage(recipientPublicKey, 'same message');
    const second = await wallet.encryptMessage(recipientPublicKey, 'same message');

    expect(first).not.toBe(second);
    expect(await wallet.decryptMessage(recipientWIF, first)).toBe('same message');
    expect(await wallet.decryptMessage(recipientWIF, second)).toBe('same message');
  });
});

describe('confidentiality', () => {
  it('cannot be read with a different private key', async () => {
    const stranger = keyPair(2);
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'not for you');

    await expect(wallet.decryptMessage(stranger.toWIF(), encrypted)).rejects.toThrow();
  });

  it('refuses the wrong password on an encrypted private key', async () => {
    const encryptedKey = await secureEncrypt(recipientWIF, TEST_PASSWORD);
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'secret');

    await expect(wallet.decryptMessage(encryptedKey, encrypted, 'wrong-password')).rejects.toThrow(
      /Invalid password or corrupted private key/,
    );
  });

  it('refuses an encrypted private key with no password at all', async () => {
    const encryptedKey = await secureEncrypt(recipientWIF, TEST_PASSWORD);
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'secret');

    await expect(wallet.decryptMessage(encryptedKey, encrypted)).rejects.toThrow();
  });
});

describe('integrity', () => {
  /** Flips one bit at `offset` in the base64 envelope. */
  const tamper = (encrypted: string, offset: number) => {
    const raw = Buffer.from(encrypted, 'base64');
    raw[offset] ^= 0x01;
    return raw.toString('base64');
  };

  it('rejects a modified ciphertext instead of decrypting to nonsense', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'transfer 10 to alice');
    const raw = Buffer.from(encrypted, 'base64');
    // A byte inside the ciphertext body: past magic and ephemeral key, before the MAC.
    const tampered = tamper(encrypted, raw.length - 40);

    await expect(wallet.decryptMessage(recipientWIF, tampered)).rejects.toThrow(/MAC mismatch/);
  });

  it('rejects a modified MAC', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'hello');
    const raw = Buffer.from(encrypted, 'base64');

    await expect(wallet.decryptMessage(recipientWIF, tamper(encrypted, raw.length - 1))).rejects.toThrow(
      /MAC mismatch/,
    );
  });

  it('rejects a swapped ephemeral public key', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'hello');
    const raw = Buffer.from(encrypted, 'base64');
    const other = Buffer.from(keyPair(3).publicKey);
    other.copy(raw, 4);

    await expect(wallet.decryptMessage(recipientWIF, raw.toString('base64'))).rejects.toThrow();
  });

  it('rejects an envelope with the wrong magic bytes', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'hello');

    await expect(wallet.decryptMessage(recipientWIF, tamper(encrypted, 0))).rejects.toThrow(
      /Bad prefix/,
    );
  });

  it('rejects a truncated envelope', async () => {
    const encrypted = await wallet.encryptMessage(recipientPublicKey, 'hello');
    const raw = Buffer.from(encrypted, 'base64');

    await expect(
      wallet.decryptMessage(recipientWIF, raw.subarray(0, 50).toString('base64')),
    ).rejects.toThrow(/too short/i);
  });

  it('rejects something that is not an envelope at all', async () => {
    await expect(wallet.decryptMessage(recipientWIF, 'hello world')).rejects.toThrow();
    await expect(wallet.decryptMessage(recipientWIF, '')).rejects.toThrow();
  });
});

describe('bad inputs to encryption', () => {
  it('refuses a public key that is not a curve point', async () => {
    await expect(wallet.encryptMessage('00'.repeat(33), 'hello')).rejects.toThrow();
  });

  it('refuses a malformed public key', async () => {
    await expect(wallet.encryptMessage('not-hex', 'hello')).rejects.toThrow();
    await expect(wallet.encryptMessage('', 'hello')).rejects.toThrow();
  });
});

describe('interoperability with signature-recovered keys', () => {
  it('encrypts to a public key recovered from a signed message', async () => {
    // This is the flow the Message Utilities tab offers: verify a signature, extract the public
    // key, then encrypt a reply to it.
    const message = 'prove it is you';
    const signature = await wallet.signMessage(recipient.toWIF(), message);
    const verified = await wallet.verifyMessage(
      (await wallet.restoreWallet(recipient.toWIF())).address,
      message,
      signature,
      true,
    );

    const publicKey = typeof verified === 'object' ? verified.publicKey : undefined;
    expect(publicKey).toBeTruthy();

    const encrypted = await wallet.encryptMessage(publicKey!, 'reply for your eyes only');
    expect(await wallet.decryptMessage(recipientWIF, encrypted)).toBe('reply for your eyes only');
  });
});
