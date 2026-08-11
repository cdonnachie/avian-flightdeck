import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Watch addresses — read-only monitoring of addresses the user does not control. Records live in
 * the settings blob keyed by owning wallet, so the property that matters most is that one
 * wallet's watch list never bleeds into another's.
 *
 * The ElectrumX bridge is stubbed: these tests are about bookkeeping, not networking.
 */

const bridge = {
  addressToScriptHash: vi.fn((address: string) => `scripthash-of-${address}`),
  getAddressBalance: vi.fn(async () => 0),
  subscribeToAddress: vi.fn(async () => {}),
  unsubscribeFromAddress: vi.fn(() => {}),
};

vi.mock('@/lib/electrum-bridge', () => ({
  default: { getInstance: () => bridge },
  ElectrumBridge: { getInstance: () => bridge },
}));

import WatchAddressService from './WatchAddressService';
import { StorageService } from '@/services/core/StorageService';
import { resetStorage } from '@/test/helpers';

const OWNER = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
const OTHER_OWNER = 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF';
const WATCHED = 'RDjNvZL1TJQ7R8L23jDutdEioQG4eTC38V';
const WATCHED_2 = 'RUqbuDKvv8x31EVVmNfmdb31BQ7xG6HDmU';

beforeEach(() => {
  resetStorage();
  bridge.getAddressBalance.mockResolvedValue(0);
  bridge.addressToScriptHash.mockClear();
  bridge.subscribeToAddress.mockClear();
  bridge.unsubscribeFromAddress.mockClear();
});

describe('adding', () => {
  it('stores a watched address against its owning wallet', async () => {
    expect(await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange')).toBe(true);

    const watched = await WatchAddressService.getWatchedAddresses(OWNER);
    expect(watched).toHaveLength(1);
    expect(watched[0]).toMatchObject({
      user_wallet_address: OWNER,
      watch_address: WATCHED,
      label: 'Exchange',
    });
  });

  it('records the script hash needed for an ElectrumX subscription', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange');

    const [watched] = await WatchAddressService.getWatchedAddresses(OWNER);
    expect(watched.script_hash).toBe(`scripthash-of-${WATCHED}`);
    expect(bridge.subscribeToAddress).toHaveBeenCalledWith(WATCHED, expect.any(Function));
  });

  it('captures the balance at the time it was added', async () => {
    bridge.getAddressBalance.mockResolvedValue(12_345);

    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange');

    expect((await WatchAddressService.getWatchedAddresses(OWNER))[0].balance).toBe(12_345);
  });

  it('still adds the address when the balance lookup fails', async () => {
    bridge.getAddressBalance.mockRejectedValue(new Error('server down'));

    expect(await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange')).toBe(true);
    expect(await WatchAddressService.getWatchedAddresses(OWNER)).toHaveLength(1);
  });

  it('invents a label when none is given', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, '');

    const [watched] = await WatchAddressService.getWatchedAddresses(OWNER);
    expect(watched.label).toContain(WATCHED.substring(0, 6));
  });

  it('updates the label instead of adding a duplicate', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Old name');
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'New name');

    const watched = await WatchAddressService.getWatchedAddresses(OWNER);
    expect(watched).toHaveLength(1);
    expect(watched[0].label).toBe('New name');
  });

  it('holds several addresses for one wallet', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'One');
    await WatchAddressService.addWatchAddress(OWNER, WATCHED_2, 'Two');

    expect(await WatchAddressService.getWatchedAddresses(OWNER)).toHaveLength(2);
  });

  it('refuses empty addresses', async () => {
    expect(await WatchAddressService.addWatchAddress(OWNER, '', 'Nothing')).toBe(false);
    expect(await WatchAddressService.addWatchAddress('', WATCHED, 'Nothing')).toBe(false);
    expect(await WatchAddressService.getWatchedAddresses(OWNER)).toEqual([]);
  });
});

describe('isolation between wallets', () => {
  it('keeps each wallet’s watch list to itself', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Mine');
    await WatchAddressService.addWatchAddress(OTHER_OWNER, WATCHED_2, 'Theirs');

    const mine = await WatchAddressService.getWatchedAddresses(OWNER);
    const theirs = await WatchAddressService.getWatchedAddresses(OTHER_OWNER);

    expect(mine.map((entry) => entry.watch_address)).toEqual([WATCHED]);
    expect(theirs.map((entry) => entry.watch_address)).toEqual([WATCHED_2]);
  });

  it('returns an empty list for a wallet that watches nothing', async () => {
    expect(await WatchAddressService.getWatchedAddresses(OWNER)).toEqual([]);
  });

  it('lets two wallets watch the same address independently', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Mine');
    await WatchAddressService.addWatchAddress(OTHER_OWNER, WATCHED, 'Theirs');

    expect((await WatchAddressService.getWatchedAddresses(OWNER))[0].label).toBe('Mine');
    expect((await WatchAddressService.getWatchedAddresses(OTHER_OWNER))[0].label).toBe('Theirs');
  });
});

describe('removing', () => {
  it('removes one address and unsubscribes from it', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'One');
    await WatchAddressService.addWatchAddress(OWNER, WATCHED_2, 'Two');

    expect(await WatchAddressService.removeWatchAddress(OWNER, WATCHED)).toBe(true);

    const remaining = await WatchAddressService.getWatchedAddresses(OWNER);
    expect(remaining.map((entry) => entry.watch_address)).toEqual([WATCHED_2]);
    expect(bridge.unsubscribeFromAddress).toHaveBeenCalledWith(WATCHED);
  });

  it('is harmless for an address that was never watched', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'One');

    expect(await WatchAddressService.removeWatchAddress(OWNER, WATCHED_2)).toBe(true);
    expect(await WatchAddressService.getWatchedAddresses(OWNER)).toHaveLength(1);
  });

  it('clears the whole list for one wallet without touching another', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'One');
    await WatchAddressService.addWatchAddress(OWNER, WATCHED_2, 'Two');
    await WatchAddressService.addWatchAddress(OTHER_OWNER, WATCHED, 'Theirs');

    expect(await WatchAddressService.removeAllWatchAddresses(OWNER)).toBe(true);

    expect(await WatchAddressService.getWatchedAddresses(OWNER)).toEqual([]);
    expect(await WatchAddressService.getWatchedAddresses(OTHER_OWNER)).toHaveLength(1);
  });
});

describe('updating', () => {
  it('stores the notification types the user chose', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange');

    expect(
      await WatchAddressService.updateWatchAddressNotifications(OWNER, WATCHED, ['balance']),
    ).toBe(true);

    const [watched] = await WatchAddressService.getWatchedAddresses(OWNER);
    expect(watched.notification_types).toEqual(['balance']);
  });

  it('updates a stored balance', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange');

    expect(await WatchAddressService.updateWatchAddressBalance(OWNER, WATCHED, 500)).toBe(true);

    // getWatchedAddresses re-syncs from the network on every read, so the server has to agree
    // for the change to still be visible.
    bridge.getAddressBalance.mockResolvedValue(500);
    expect((await WatchAddressService.getWatchedAddresses(OWNER))[0].balance).toBe(500);
  });

  it('has its locally-set balance overwritten by the next read, because reads re-sync', async () => {
    // Documents a subtlety worth knowing: getWatchedAddresses is not a plain getter. It refetches
    // every balance from ElectrumX and writes the result back, so updateWatchAddressBalance only
    // sticks until the next read.
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange');
    await WatchAddressService.updateWatchAddressBalance(OWNER, WATCHED, 500);

    bridge.getAddressBalance.mockResolvedValue(7);

    expect((await WatchAddressService.getWatchedAddresses(OWNER))[0].balance).toBe(7);
  });

  it('refuses to update an address that is not being watched', async () => {
    expect(await WatchAddressService.updateWatchAddressBalance(OWNER, WATCHED, 500)).toBe(false);
  });

  it('refreshes balances from the network', async () => {
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Exchange');
    bridge.getAddressBalance.mockResolvedValue(9_999);

    await WatchAddressService.refreshWatchAddressBalances(OWNER);

    expect((await WatchAddressService.getWatchedAddresses(OWNER))[0].balance).toBe(9_999);
  });

  it('reports success with nothing to refresh', async () => {
    expect(await WatchAddressService.refreshWatchAddressBalances(OWNER)).toBe(true);
  });
});

describe('across all wallets', () => {
  it('gathers every watched address the user owns', async () => {
    const owners = [OWNER, OTHER_OWNER];
    for (let index = 0; index < owners.length; index++) {
      await StorageService.createWallet({
        name: `Wallet ${index}`,
        address: owners[index],
        privateKey: 'encrypted',
        isEncrypted: true,
        makeActive: index === 0,
      });
    }
    await WatchAddressService.addWatchAddress(OWNER, WATCHED, 'Mine');
    await WatchAddressService.addWatchAddress(OTHER_OWNER, WATCHED_2, 'Theirs');

    const all = await WatchAddressService.getAllWatchedAddresses();

    expect(all.map((entry) => entry.watch_address).sort()).toEqual([WATCHED, WATCHED_2].sort());
  });

  it('returns nothing when the user has no wallets', async () => {
    expect(await WatchAddressService.getAllWatchedAddresses()).toEqual([]);
  });
});
