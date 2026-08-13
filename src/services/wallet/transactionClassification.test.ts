import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletService } from './WalletService';
import { StorageService } from '@/services/core/StorageService';
import { resetStorage } from '@/test/helpers';

/**
 * Transaction classification — how a raw transaction becomes a row of history.
 *
 * This decides send vs receive, the amount shown, and the counterparty. Getting it wrong shows
 * users money that moved in the wrong direction. classifyTransaction is private, so these tests
 * drive it through processTransactionHistory and assert on what lands in storage.
 *
 * Two cases below are pinned defects, marked DEFECT: transfers between two wallets the user owns
 * are misreported. The code carries a matching `TODO: Implement special handling for self
 * transfers and transfers between owned wallets`.
 */

const WALLET_A = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
const WALLET_B = 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF';
const EXTERNAL = 'RDjNvZL1TJQ7R8L23jDutdEioQG4eTC38V';
const EXTERNAL_2 = 'RUqbuDKvv8x31EVVmNfmdb31BQ7xG6HDmU';

const TX_HASH = 'a'.repeat(64);
const CURRENT_HEIGHT = 1_000;

/** An output paying `value` AVN to `address`, in the verbose shape ElectrumX returns. */
const out = (address: string, value: number) => ({
  value,
  scriptPubKey: { addresses: [address] },
});

/** An input already carrying its address, which is what modern ElectrumX servers provide. */
const from = (address: string, value?: number) => ({ address, ...(value ? { value } : {}) });

interface TxDetails {
  txid?: string;
  time?: number;
  vin?: unknown[];
  vout?: unknown[];
}

function createElectrum(transactions: Record<string, TxDetails>, history?: { tx_hash: string; height: number }[]) {
  return {
    getTransactionHistory: vi.fn(
      async () => history ?? Object.keys(transactions).map((tx_hash) => ({ tx_hash, height: 990 })),
    ),
    getTransaction: vi.fn(async (hash: string) => transactions[hash]),
    getCurrentBlockHeight: vi.fn(async () => CURRENT_HEIGHT),
    getBalance: vi.fn(async () => 0),
    getUTXOs: vi.fn(async () => []),
    broadcastTransaction: vi.fn(),
    isConnectedToServer: vi.fn(() => true),
    connect: vi.fn(async () => {}),
  };
}

/** Registers the wallets the user owns, which is how `isOurAddress` answers. */
const ownWallets = async (...addresses: string[]) => {
  for (let index = 0; index < addresses.length; index++) {
    await StorageService.createWallet({
      name: `Wallet ${index}`,
      address: addresses[index],
      privateKey: 'encrypted',
      isEncrypted: true,
      makeActive: index === 0,
    });
  }
};

const historyFor = (address: string) => StorageService.getTransactionHistory(address);

beforeEach(() => {
  resetStorage();
});

describe('receiving', () => {
  it('records an incoming payment from an external address', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        time: 1_700_000_000,
        vin: [from(EXTERNAL)],
        vout: [out(WALLET_A, 5)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const history = await historyFor(WALLET_A);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      type: 'receive',
      amount: 5,
      address: WALLET_A,
      fromAddress: EXTERNAL,
      walletAddress: WALLET_A,
    });
  });

  it('counts only the outputs that came to us, not the sender’s change', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(EXTERNAL)],
        vout: [out(WALLET_A, 2), out(EXTERNAL, 97)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect((await historyFor(WALLET_A))[0].amount).toBe(2);
  });

  it('sums multiple outputs to the same address', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(EXTERNAL)],
        vout: [out(WALLET_A, 1.5), out(WALLET_A, 2.5)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect((await historyFor(WALLET_A))[0].amount).toBe(4);
  });

  it('labels a coinbase payout as coming from Coinbase', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [{ coinbase: '03a1b2c3' }],
        vout: [out(WALLET_A, 5_000)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const [entry] = await historyFor(WALLET_A);
    expect(entry.type).toBe('receive');
    expect(entry.fromAddress).toBe('Coinbase');
  });

  it('resolves the sender by looking up the previous transaction when the input has no address', async () => {
    await ownWallets(WALLET_A);
    const PREV = 'b'.repeat(64);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [{ txid: PREV, vout: 0 }],
        vout: [out(WALLET_A, 3)],
      },
      [PREV]: {
        vout: [out(EXTERNAL, 3.1)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect((await historyFor(WALLET_A))[0].fromAddress).toBe(EXTERNAL);
  });
});

describe('sending', () => {
  it('records an outgoing payment and excludes the change from the amount', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(EXTERNAL, 4), out(WALLET_A, 5.9)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const history = await historyFor(WALLET_A);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      type: 'send',
      amount: 4,
      address: EXTERNAL,
      fromAddress: WALLET_A,
    });
  });

  it('reports the total sent and the largest recipient for a multi-recipient payment', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(EXTERNAL, 1), out(EXTERNAL_2, 3), out(WALLET_A, 5.9)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const [entry] = await historyFor(WALLET_A);
    expect(entry.type).toBe('send');
    expect(entry.amount).toBe(4);
    expect(entry.address).toBe(EXTERNAL_2);
  });

  it('treats a consolidation back to the same address as a receive of the consolidated amount', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(WALLET_A, 9.9)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const [entry] = await historyFor(WALLET_A);
    expect(entry.type).toBe('receive');
    expect(entry.amount).toBe(9.9);
    expect(entry.fromAddress).toBe(WALLET_A);
    expect(entry.address).toBe(WALLET_A);
  });

  it('records a fee-only transaction with no outputs as a burn', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 2)],
        vout: [],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const [entry] = await historyFor(WALLET_A);
    expect(entry.type).toBe('send');
    expect(entry.address).toBe('Fee/Burn');
    expect(entry.amount).toBe(2);
  });
});

describe('transfers between two wallets the user owns', () => {
  it('shows up correctly as a receive on the destination wallet', async () => {
    await ownWallets(WALLET_A, WALLET_B);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(WALLET_B, 5), out(WALLET_A, 4.9)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_B);

    const [entry] = await historyFor(WALLET_B);
    expect(entry.type).toBe('receive');
    expect(entry.amount).toBe(5);
    expect(entry.fromAddress).toBe(WALLET_A);
  });

  it('records a send on the source wallet, excluding the change that came back', async () => {
    // Wallet A sends 5 AVN to wallet B and takes 4.9 back as change. From A's point of view the
    // 5 left the address, so it is a send of 5 — not a receive of the change.
    await ownWallets(WALLET_A, WALLET_B);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(WALLET_B, 5), out(WALLET_A, 4.9)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const [entry] = await historyFor(WALLET_A);
    expect(entry.type).toBe('send');
    expect(entry.amount).toBe(5);
    expect(entry.fromAddress).toBe(WALLET_A);
    expect(entry.address).toBe(WALLET_B);
  });

  it('records a send on the source wallet when the whole balance moves across', async () => {
    await ownWallets(WALLET_A, WALLET_B);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(WALLET_B, 9.9)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const [entry] = await historyFor(WALLET_A);
    expect(entry.type).toBe('send');
    expect(entry.amount).toBe(9.9);
    expect(entry.address).toBe(WALLET_B);
  });

  it('shows one transfer as a send on the source and a receive on the destination', async () => {
    await ownWallets(WALLET_A, WALLET_B);
    const details = {
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(WALLET_B, 5), out(WALLET_A, 4.9)],
      },
    };
    const wallet = new WalletService(createElectrum(details) as never);

    await wallet.processTransactionHistory(WALLET_A);
    await wallet.processTransactionHistory(WALLET_B);

    expect(await historyFor(WALLET_A)).toMatchObject([{ type: 'send', amount: 5 }]);
    expect(await historyFor(WALLET_B)).toMatchObject([{ type: 'receive', amount: 5 }]);
  });

  it('counts an external payment and an internal one together as a single send', async () => {
    await ownWallets(WALLET_A, WALLET_B);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(WALLET_A, 10)],
        vout: [out(EXTERNAL, 2), out(WALLET_B, 3), out(WALLET_A, 4.9)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const [entry] = await historyFor(WALLET_A);
    expect(entry.type).toBe('send');
    expect(entry.amount).toBe(5);
    // The largest recipient is reported as the primary one.
    expect(entry.address).toBe(WALLET_B);
  });

  it('clears a stale receive left behind by the old classification', async () => {
    // Users who synced before the fix have a bogus "receive" row for the change output.
    // Reprocessing writes the correct send, and the cleanup pass removes the stale receive.
    await ownWallets(WALLET_A, WALLET_B);
    await StorageService.saveTransaction({
      txid: TX_HASH,
      amount: 4.9,
      address: WALLET_A,
      fromAddress: WALLET_A,
      walletAddress: WALLET_A,
      type: 'receive',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      confirmations: 6,
    });

    const wallet = new WalletService(
      createElectrum({
        [TX_HASH]: {
          vin: [from(WALLET_A, 10)],
          vout: [out(WALLET_B, 5), out(WALLET_A, 4.9)],
        },
      }) as never,
    );

    await wallet.processTransactionHistory(WALLET_A);
    const removed = await wallet.cleanupMisclassifiedTransactions(WALLET_A);

    expect(removed).toBe(1);
    expect(await historyFor(WALLET_A)).toMatchObject([{ type: 'send', amount: 5 }]);
  });
});

describe('transactions that are none of our business', () => {
  it('stores nothing for a transaction between two strangers', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(EXTERNAL)],
        vout: [out(EXTERNAL_2, 7)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect(await historyFor(WALLET_A)).toEqual([]);
  });

  it('skips outputs whose script it cannot turn into an address', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: {
        vin: [from(EXTERNAL)],
        vout: [{ value: 1, scriptPubKey: { hex: '6a0548656c6c6f' } }, out(WALLET_A, 2)],
      },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect((await historyFor(WALLET_A))[0].amount).toBe(2);
  });
});

describe('bookkeeping', () => {
  it('converts satoshi amounts to AVN', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 0.00012345)] },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect((await historyFor(WALLET_A))[0].amount).toBe(0.00012345);
  });

  it('derives confirmations from the block height', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum(
      { [TX_HASH]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] } },
      [{ tx_hash: TX_HASH, height: 995 }],
    );

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    // 1000 - 995 + 1
    expect((await historyFor(WALLET_A))[0].confirmations).toBe(6);
    expect((await historyFor(WALLET_A))[0].blockHeight).toBe(995);
  });

  it('treats a transaction with no height as unconfirmed', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum(
      { [TX_HASH]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] } },
      [{ tx_hash: TX_HASH, height: 0 }],
    );

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect((await historyFor(WALLET_A))[0].confirmations).toBe(0);
  });

  it('uses the transaction time when the server supplies it', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: { time: 1_700_000_000, vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] },
    });

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect((await historyFor(WALLET_A))[0].timestamp).toEqual(new Date(1_700_000_000_000));
  });

  it('reports progress from zero through to the total', async () => {
    await ownWallets(WALLET_A);
    const hashes = ['a', 'b', 'c'].map((char) => char.repeat(64));
    const transactions = Object.fromEntries(
      hashes.map((hash) => [hash, { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] }]),
    );
    const electrum = createElectrum(transactions);
    const onProgress = vi.fn();

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A, onProgress);

    expect(onProgress).toHaveBeenCalledWith(0, 3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });

  it('does nothing when the address has no history', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({}, []);

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect(await historyFor(WALLET_A)).toEqual([]);
    expect(electrum.getTransaction).not.toHaveBeenCalled();
  });

  it('does not fetch details again for known transactions when asked for new ones only', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] },
    });
    const wallet = new WalletService(electrum as never);

    await wallet.processTransactionHistory(WALLET_A);
    electrum.getTransaction.mockClear();

    await wallet.processTransactionHistory(WALLET_A, undefined, true);

    expect(electrum.getTransaction).not.toHaveBeenCalled();
    expect(await historyFor(WALLET_A)).toHaveLength(1);
  });

  it('does not duplicate a transaction when the history is processed twice', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({
      [TX_HASH]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] },
    });
    const wallet = new WalletService(electrum as never);

    await wallet.processTransactionHistory(WALLET_A);
    await wallet.processTransactionHistory(WALLET_A);

    expect(await historyFor(WALLET_A)).toHaveLength(1);
  });

  it('updates the confirmation count as a transaction matures', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum(
      { [TX_HASH]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] } },
      [{ tx_hash: TX_HASH, height: 999 }],
    );
    const wallet = new WalletService(electrum as never);

    await wallet.processTransactionHistory(WALLET_A);
    expect((await historyFor(WALLET_A))[0].confirmations).toBe(2);

    electrum.getCurrentBlockHeight.mockResolvedValue(1_010);
    await wallet.processTransactionHistory(WALLET_A);

    const history = await historyFor(WALLET_A);
    expect(history).toHaveLength(1);
    expect(history[0].confirmations).toBe(12);
  });

  it('keeps going when one transaction cannot be fetched', async () => {
    await ownWallets(WALLET_A);
    const good = 'c'.repeat(64);
    const electrum = createElectrum(
      { [good]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] } },
      [
        { tx_hash: 'd'.repeat(64), height: 990 },
        { tx_hash: good, height: 990 },
      ],
    );

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const history = await historyFor(WALLET_A);
    expect(history).toHaveLength(1);
    expect(history[0].txid).toBe(good);
  });

  it('survives the history call failing outright', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum({});
    electrum.getTransactionHistory.mockRejectedValueOnce(new Error('server unreachable'));

    await expect(
      new WalletService(electrum as never).processTransactionHistory(WALLET_A),
    ).resolves.toBeUndefined();
  });
});

describe('sync efficiency', () => {
  it('fetches a shared parent transaction only once across the whole sync', async () => {
    await ownWallets(WALLET_A);
    const PARENT = 'p'.repeat(64);
    const SEND_1 = '1'.repeat(64);
    const SEND_2 = '2'.repeat(64);
    const SEND_3 = '3'.repeat(64);
    // Three sends that each spend an output of the same funding tx. The inputs carry no address, so
    // classification must resolve them from the parent — which the per-sync cache should pull once.
    const spendParent = { vin: [{ txid: PARENT, vout: 0 }], vout: [out(EXTERNAL, 1)] };
    const electrum = createElectrum(
      {
        [PARENT]: { vout: [out(WALLET_A, 100)] },
        [SEND_1]: spendParent,
        [SEND_2]: spendParent,
        [SEND_3]: spendParent,
      },
      [
        { tx_hash: SEND_1, height: 990 },
        { tx_hash: SEND_2, height: 990 },
        { tx_hash: SEND_3, height: 990 },
      ],
    );

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const parentCalls = electrum.getTransaction.mock.calls.filter(([hash]) => hash === PARENT);
    expect(parentCalls).toHaveLength(1);
    // 3 history txs + 1 shared parent = 4 (not 3 + 3 without the cache).
    expect(electrum.getTransaction).toHaveBeenCalledTimes(4);
    expect(await historyFor(WALLET_A)).toHaveLength(3);
  });

  it('records every transaction in a history larger than the concurrency limit', async () => {
    await ownWallets(WALLET_A);
    const COUNT = 30; // comfortably above HISTORY_SYNC_CONCURRENCY
    const transactions: Record<string, TxDetails> = {};
    const history: { tx_hash: string; height: number }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const hash = i.toString(16).padStart(64, '0');
      transactions[hash] = { time: 1_700_000_000 + i, vin: [from(EXTERNAL)], vout: [out(WALLET_A, i + 1)] };
      history.push({ tx_hash: hash, height: 900 + i });
    }
    const electrum = createElectrum(transactions, history);

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect(await historyFor(WALLET_A)).toHaveLength(COUNT);
  });

  it('fetches newest-first: unconfirmed, then highest block height', async () => {
    await ownWallets(WALLET_A);
    const A = 'a'.repeat(64); // height 100 (oldest)
    const B = 'b'.repeat(64); // height 300 (newest confirmed)
    const C = 'c'.repeat(64); // height 0   (unconfirmed / mempool)
    const D = 'd'.repeat(64); // height 200
    const received = { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] };
    const electrum = createElectrum(
      { [A]: received, [B]: received, [C]: received, [D]: received },
      [
        { tx_hash: A, height: 100 },
        { tx_hash: B, height: 300 },
        { tx_hash: C, height: 0 },
        { tx_hash: D, height: 200 },
      ],
    );

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    const fetchOrder = electrum.getTransaction.mock.calls.map(([hash]) => hash);
    expect(fetchOrder).toEqual([C, B, D, A]); // mempool, then 300 → 200 → 100
  });

  it('reads the chain tip once for the whole sync, not per transaction', async () => {
    await ownWallets(WALLET_A);
    const electrum = createElectrum(
      {
        ['1'.repeat(64)]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 1)] },
        ['2'.repeat(64)]: { vin: [from(EXTERNAL)], vout: [out(WALLET_A, 2)] },
      },
      [
        { tx_hash: '1'.repeat(64), height: 990 },
        { tx_hash: '2'.repeat(64), height: 991 },
      ],
    );

    await new WalletService(electrum as never).processTransactionHistory(WALLET_A);

    expect(electrum.getCurrentBlockHeight).toHaveBeenCalledTimes(1);
  });
});
