import { describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';

import { ElectrumService } from './ElectrumService';
import { StorageService } from './StorageService';
import { avianNetwork } from '@/services/wallet/WalletService';
import { resetStorage } from '@/test/helpers';

/**
 * Only the pure, offline part of the Electrum client is covered here: the address-to-scripthash
 * conversion every balance, history and subscription call depends on. Getting it wrong makes the
 * wallet silently report a zero balance for a funded address.
 */

const service = new ElectrumService();

/** The reference computation from the ElectrumX protocol: sha256 of the script, byte-reversed. */
const expectedScriptHash = (address: string) => {
  const script = bitcoin.address.toOutputScript(address, avianNetwork);
  return Buffer.from(bitcoin.crypto.sha256(script)).reverse().toString('hex');
};

const P2PKH = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
const P2WPKH = 'avn1qwq3xtmwmzelhwdtvfc9dslda32mlrngceqk4mr';
const P2SH = 'rPfwFThd2xyfJWYqRMRk5gPihXMMwXdfJT';

describe('addressToScriptHash', () => {
  it.each([
    ['legacy P2PKH', P2PKH],
    ['native SegWit', P2WPKH],
    ['wrapped SegWit', P2SH],
  ])('matches the protocol definition for %s', (_label, address) => {
    expect(service.addressToScriptHash(address)).toBe(expectedScriptHash(address));
  });

  it('returns 32 bytes of lowercase hex', () => {
    const scriptHash = service.addressToScriptHash(P2PKH);
    expect(scriptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(service.addressToScriptHash(P2PKH)).toBe(service.addressToScriptHash(P2PKH));
  });

  it('gives different addresses different script hashes', () => {
    const hashes = new Set([
      service.addressToScriptHash(P2PKH),
      service.addressToScriptHash(P2WPKH),
      service.addressToScriptHash(P2SH),
    ]);
    expect(hashes.size).toBe(3);
  });

  it('falls back to a deterministic value rather than throwing on an unusable address', () => {
    // Documents current behaviour: a malformed address still yields a hash, so callers get an
    // empty balance rather than an error. Worth knowing when debugging a "missing" balance.
    const scriptHash = service.addressToScriptHash('not-an-address');
    expect(scriptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(scriptHash).not.toBe(service.addressToScriptHash(P2PKH));
  });
});

describe('balance provenance while offline', () => {
  it('reports unknown when there is nothing to go on — never a confident zero', async () => {
    resetStorage();
    const fresh = new ElectrumService();

    const detailed = await fresh.getBalanceDetailed(P2PKH);

    expect(detailed).toEqual({ balance: 0, source: 'unknown' });
  });

  it('falls back to a balance a subscription pushed earlier in the session', async () => {
    const fresh = new ElectrumService();
    fresh.updateRealBalance(P2PKH, 123_456);

    const detailed = await fresh.getBalanceDetailed(P2PKH);

    expect(detailed).toEqual({ balance: 123_456, source: 'cache' });
  });

  it('falls back to a balance persisted by a previous session, marked as stored', async () => {
    resetStorage();
    await StorageService.setLastBalance(777_000);
    const fresh = new ElectrumService();

    const detailed = await fresh.getBalanceDetailed(P2PKH);

    expect(detailed).toEqual({ balance: 777_000, source: 'stored' });
  });

  it('treats a stored zero as unknown, since storage cannot tell zero from absent', async () => {
    resetStorage();
    await StorageService.setLastBalance(0);
    const fresh = new ElectrumService();

    const detailed = await fresh.getBalanceDetailed(P2PKH);

    expect(detailed.source).toBe('unknown');
  });

  it('keeps the plain getBalance shape for callers that only want a number', async () => {
    resetStorage();
    const fresh = new ElectrumService();

    await expect(fresh.getBalance(P2PKH)).resolves.toBe(0);
  });
});

describe('connection state', () => {
  it('starts disconnected', () => {
    expect(new ElectrumService().isConnectedToServer()).toBe(false);
  });

  it('refuses requests while disconnected instead of hanging', async () => {
    const fresh = new ElectrumService();
    await expect(fresh.getServerFeatures()).rejects.toThrow(/Not connected/);
  });

  it('reports a zero balance rather than throwing when offline', async () => {
    const fresh = new ElectrumService();
    await expect(fresh.getBalance(P2PKH)).resolves.toBe(0);
  });

  it('reports empty history rather than throwing when offline', async () => {
    const fresh = new ElectrumService();
    await expect(fresh.getTransactionHistory(P2PKH)).resolves.toEqual([]);
  });
});
