import { beforeEach, describe, expect, it } from 'vitest';

import { StorageService } from './StorageService';
import { resetStorage } from '@/test/helpers';

const ADDRESS_A = 'RAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDRESS_B = 'RBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const createWallet = (overrides: Record<string, unknown> = {}) =>
  StorageService.createWallet({
    name: 'Main',
    address: ADDRESS_A,
    privateKey: 'encrypted-key-blob',
    isEncrypted: true,
    ...overrides,
  });

beforeEach(() => {
  resetStorage();
});

describe('creating wallets', () => {
  it('round-trips a wallet through IndexedDB', async () => {
    const created = await createWallet();

    expect(created.id).toBeTypeOf('number');
    const all = await StorageService.getAllWallets();
    expect(all).toHaveLength(1);
    expect(all[0].address).toBe(ADDRESS_A);
    expect(all[0].isEncrypted).toBe(true);
  });

  it('rejects a duplicate name', async () => {
    await createWallet();
    await expect(createWallet({ address: ADDRESS_B })).rejects.toThrow(/already exists/);
    expect(await StorageService.getWalletCount()).toBe(1);
  });

  it('rejects a duplicate address', async () => {
    await createWallet();
    await expect(createWallet({ name: 'Other' })).rejects.toThrow(/already exists/);
    expect(await StorageService.getWalletCount()).toBe(1);
  });

  it('stores the optional HD fields only when supplied', async () => {
    await createWallet({ coinType: 175, addressType: 'p2wpkh', descriptor: 'wpkh(xpub…)' });

    const stored = await StorageService.getWalletByAddress(ADDRESS_A);
    expect(stored?.coinType).toBe(175);
    expect(stored?.addressType).toBe('p2wpkh');

    resetStorage();
    await createWallet();
    const plain = await StorageService.getWalletByAddress(ADDRESS_A);
    expect(plain).not.toHaveProperty('coinType');
    expect(plain).not.toHaveProperty('descriptor');
  });

  it('makes the first wallet active by default', async () => {
    await createWallet();
    expect((await StorageService.getActiveWallet())?.name).toBe('Main');
  });

  it('honours makeActive: false', async () => {
    await createWallet();
    await createWallet({ name: 'Second', address: ADDRESS_B, makeActive: false });

    expect((await StorageService.getActiveWallet())?.name).toBe('Main');
  });
});

describe('lookups', () => {
  it('finds a wallet by address, name and id', async () => {
    const created = await createWallet();

    expect((await StorageService.getWalletByAddress(ADDRESS_A))?.name).toBe('Main');
    expect((await StorageService.getWalletByName('Main'))?.address).toBe(ADDRESS_A);
    expect((await StorageService.getWalletById(created.id!))?.address).toBe(ADDRESS_A);
  });

  it('returns null rather than throwing for unknown records', async () => {
    expect(await StorageService.getWalletByAddress('RNope')).toBeNull();
    expect(await StorageService.getWalletByName('Nope')).toBeNull();
    expect(await StorageService.getWalletById(4242)).toBeNull();
    expect(await StorageService.getActiveWallet()).toBeNull();
  });

  it('reports emptiness consistently', async () => {
    expect(await StorageService.hasWallet()).toBe(false);
    expect(await StorageService.getWalletCount()).toBe(0);
    expect(await StorageService.getAllWallets()).toEqual([]);
    expect(await StorageService.walletExists(ADDRESS_A)).toBe(false);
  });
});

describe('switching wallets', () => {
  const twoWallets = async () => {
    const one = await createWallet({ name: 'One' });
    const two = await createWallet({ name: 'Two', address: ADDRESS_B, makeActive: false });
    return { one, two };
  };

  it('leaves exactly one wallet active', async () => {
    const { two } = await twoWallets();

    expect(await StorageService.switchToWallet(two.id!)).toBe(true);

    const all = await StorageService.getAllWallets();
    expect(all.filter((entry) => entry.isActive)).toHaveLength(1);
    expect((await StorageService.getActiveWallet())?.name).toBe('Two');
  });

  it('refuses to switch to a wallet that does not exist and leaves the active one alone', async () => {
    await twoWallets();

    expect(await StorageService.switchToWallet(9999)).toBe(false);
    expect((await StorageService.getActiveWallet())?.name).toBe('One');
  });

  it('is a no-op when the target is already active', async () => {
    const { one } = await twoWallets();

    expect(await StorageService.switchToWallet(one.id!)).toBe(true);
    expect((await StorageService.getActiveWallet())?.name).toBe('One');
  });
});

describe('mutating wallets', () => {
  it('renames a wallet', async () => {
    const created = await createWallet();

    expect(await StorageService.updateWalletName(created.id!, 'Renamed')).toBe(true);
    expect((await StorageService.getWalletById(created.id!))?.name).toBe('Renamed');
  });

  it('replaces the stored private key', async () => {
    const created = await createWallet();

    expect(await StorageService.updateWalletPrivateKey(created.id!, 'new-blob')).toBe(true);
    expect((await StorageService.getWalletById(created.id!))?.privateKey).toBe('new-blob');
  });

  it('deletes a wallet', async () => {
    const created = await createWallet();

    expect(await StorageService.deleteWallet(created.id!)).toBe(true);
    expect(await StorageService.getWalletCount()).toBe(0);
    expect(await StorageService.walletExists(ADDRESS_A)).toBe(false);
  });
});

describe('preferences', () => {
  it('returns documented defaults before anything is written', async () => {
    expect(await StorageService.getCurrency()).toBe('USD');
    expect(await StorageService.getAVNUnits()).toBe('AVN');
    expect(await StorageService.getLastBalance()).toBe(0);
    expect(await StorageService.getExchangeRate()).toBe(0);
    expect(await StorageService.getChangeAddressCount()).toBe(5);
    expect(await StorageService.getSettings()).toEqual({});
  });

  it('overwrites a preference rather than appending a second record', async () => {
    await StorageService.setCurrency('GBP');
    await StorageService.setCurrency('EUR');

    expect(await StorageService.getCurrency()).toBe('EUR');
  });

  it('clamps the change address count to a sane range', async () => {
    await StorageService.setChangeAddressCount(0);
    expect(await StorageService.getChangeAddressCount()).toBe(1);

    await StorageService.setChangeAddressCount(500);
    expect(await StorageService.getChangeAddressCount()).toBe(20);
  });

  it('accepts settings as either an object or a JSON string', async () => {
    await StorageService.setSettings({ theme: 'dark' });
    expect(await StorageService.getSettings()).toEqual({ theme: 'dark' });

    await StorageService.setSettings(JSON.stringify({ theme: 'light' }));
    expect(await StorageService.getSettings()).toEqual({ theme: 'light' });
  });
});

describe('Avian Connect storage', () => {
  it('starts empty', async () => {
    expect(await StorageService.getConnectPermissions()).toEqual([]);
    expect(await StorageService.getKnownPublicKey('RAny')).toBeNull();
    expect(await StorageService.getCachedGenesisHash()).toBeNull();
  });

  it('round-trips permission records', async () => {
    const permissions = [
      { origin: 'https://realm.example', accounts: [ADDRESS_A], grantedAt: 1, lastUsedAt: 2 },
    ];
    await StorageService.setConnectPermissions(permissions);

    expect(await StorageService.getConnectPermissions()).toEqual(permissions);
  });

  it('accumulates public keys per address without dropping earlier ones', async () => {
    await StorageService.setKnownPublicKey(ADDRESS_A, '02aa');
    await StorageService.setKnownPublicKey(ADDRESS_B, '02bb');

    expect(await StorageService.getKnownPublicKey(ADDRESS_A)).toBe('02aa');
    expect(await StorageService.getKnownPublicKey(ADDRESS_B)).toBe('02bb');
  });
});

describe('transaction history', () => {
  const tx = (overrides: Record<string, unknown> = {}) => ({
    txid: 'a'.repeat(64),
    amount: 1.5,
    address: 'RRecipient',
    walletAddress: ADDRESS_A,
    type: 'send' as const,
    timestamp: new Date('2026-01-02T00:00:00Z'),
    confirmations: 3,
    ...overrides,
  });

  it('stores a transaction and reads it back for the wallet', async () => {
    await StorageService.saveTransaction(tx());

    const history = await StorageService.getTransactionHistory(ADDRESS_A);
    expect(history).toHaveLength(1);
    expect(history[0].txid).toBe('a'.repeat(64));
  });

  it('updates rather than duplicates when the same txid and type is saved again', async () => {
    await StorageService.saveTransaction(tx({ confirmations: 1 }));
    await StorageService.saveTransaction(tx({ confirmations: 6 }));

    const history = await StorageService.getTransactionHistory(ADDRESS_A);
    expect(history).toHaveLength(1);
    expect(history[0].confirmations).toBe(6);
  });

  it('keeps the send and receive legs of one txid apart', async () => {
    await StorageService.saveTransaction(tx({ type: 'send' }));
    await StorageService.saveTransaction(tx({ type: 'receive' }));

    expect(await StorageService.getTransactionHistory(ADDRESS_A)).toHaveLength(2);
  });

  it('does not leak one wallet’s transactions into another’s history', async () => {
    await StorageService.saveTransaction(tx());
    await StorageService.saveTransaction(
      tx({ txid: 'b'.repeat(64), walletAddress: ADDRESS_B }),
    );

    const history = await StorageService.getTransactionHistory(ADDRESS_A);
    expect(history).toHaveLength(1);
    expect(history[0].txid).toBe('a'.repeat(64));
  });

  it('clears history for a single address only', async () => {
    await StorageService.saveTransaction(tx());
    await StorageService.saveTransaction(tx({ txid: 'b'.repeat(64), address: 'ROther' }));

    await StorageService.clearTransactionHistoryForAddress('RRecipient');

    const remaining = await StorageService.getTransactionHistory(ADDRESS_A);
    expect(remaining.map((entry) => entry.address)).toEqual(['ROther']);
  });
});

describe('address book', () => {
  const contact = (overrides: Record<string, unknown> = {}) => ({
    id: '',
    name: 'Alice',
    address: ADDRESS_B,
    dateAdded: new Date('2026-01-01T00:00:00Z'),
    useCount: 0,
    ...overrides,
  });

  it('assigns an id on save, writing it back onto the caller’s object', async () => {
    const alice = contact();
    expect(await StorageService.saveAddress(alice)).toBe(true);

    const stored = await StorageService.getSavedAddresses();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBeTruthy();
    // Callers read the generated id straight off the object they passed in.
    expect(alice.id).toBe(stored[0].id);
  });

  it('updates in place and keeps the original id when the same address is saved again', async () => {
    const alice = contact();
    await StorageService.saveAddress(alice);
    const originalId = alice.id;

    await StorageService.saveAddress(contact({ name: 'Alice Renamed' }));

    const stored = await StorageService.getSavedAddresses();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Alice Renamed');
    expect(stored[0].id).toBe(originalId);
  });

  it('updates a contact by id and refuses an unknown one', async () => {
    const alice = contact();
    await StorageService.saveAddress(alice);

    expect(await StorageService.updateAddress({ ...alice, name: 'Alice B' })).toBe(true);
    expect((await StorageService.getSavedAddresses())[0].name).toBe('Alice B');

    expect(await StorageService.updateAddress(contact({ id: 'nope' }))).toBe(false);
  });

  it('deletes a contact by id', async () => {
    const alice = contact();
    await StorageService.saveAddress(alice);

    expect(await StorageService.deleteAddress(alice.id)).toBe(true);
    expect(await StorageService.getSavedAddresses()).toEqual([]);
  });

  it('reports success when deleting an id that is not there, leaving the book intact', async () => {
    // Documents current behaviour: deleteAddress filters and cannot tell "removed" from
    // "was never present", so the return value is not a existence check.
    const alice = contact();
    await StorageService.saveAddress(alice);

    expect(await StorageService.deleteAddress('never-existed')).toBe(true);
    expect(await StorageService.getSavedAddresses()).toHaveLength(1);
  });

  it('tracks usage counts', async () => {
    await StorageService.saveAddress(contact());

    await StorageService.updateAddressUsage(ADDRESS_B);
    await StorageService.updateAddressUsage(ADDRESS_B);

    const [stored] = await StorageService.getSavedAddresses();
    expect(stored.useCount).toBe(2);
    expect(stored.lastUsed).toBeInstanceOf(Date);
  });
});

describe('test isolation', () => {
  it('sees an empty database even though earlier tests wrote to one', async () => {
    expect(await StorageService.getAllWallets()).toEqual([]);
    expect(await StorageService.getConnectPermissions()).toEqual([]);
    expect(await StorageService.getSavedAddresses()).toEqual([]);
  });
});
