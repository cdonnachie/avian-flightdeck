import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import { WalletService, avianNetwork, deriveAddress, secureEncrypt } from './WalletService';
import { CoinSelectionStrategy } from './UTXOSelectionService';
import { StorageService } from '@/services/core/StorageService';
import { TEST_PASSWORD, resetStorage } from '@/test/helpers';

/**
 * Transaction building against a stubbed network layer. Nothing is broadcast: the fake Electrum
 * captures the raw hex, which is then decoded and asserted on. Signature *validity* under Avian's
 * FORKID rules is deliberately out of scope (bitcoinjs-lib has no FORKID digest) — what these
 * tests protect is input selection, output construction, change handling and fee arithmetic.
 */

const ECPair = ECPairFactory(ecc);

const SIGHASH_ALL_FORKID = 0x41;
const RECIPIENT = 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF';

interface FakeUTXO {
  txid: string;
  vout: number;
  value: number;
  height: number;
}

/** A previous transaction paying `value` to `address`, so the wallet has something to spend. */
function fundingTx(address: string, value: number, seed: number) {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  tx.addOutput(bitcoin.address.toOutputScript(address, avianNetwork), value);
  return { hex: tx.toHex(), txid: tx.getId() };
}

function createFakeElectrum(address: string, values: number[], blockHeight = 1000) {
  const transactions = new Map<string, string>();
  const utxos: FakeUTXO[] = values.map((value, index) => {
    const { hex, txid } = fundingTx(address, value, index + 1);
    transactions.set(txid, hex);
    return { txid, vout: 0, value, height: blockHeight - 10 };
  });

  const broadcast = vi.fn(async (hex: string) => bitcoin.Transaction.fromHex(hex).getId());

  return {
    utxos,
    broadcast,
    electrum: {
      getUTXOs: vi.fn(async () => utxos),
      getCurrentBlockHeight: vi.fn(async () => blockHeight),
      getTransaction: vi.fn(async (txid: string) => transactions.get(txid)),
      broadcastTransaction: broadcast,
      // Touched by other WalletService paths but irrelevant here.
      getBalance: vi.fn(async () => values.reduce((sum, value) => sum + value, 0)),
      getTransactionHistory: vi.fn(async () => []),
      isConnectedToServer: vi.fn(() => true),
      connect: vi.fn(async () => {}),
      subscribeToAddress: vi.fn(async () => {}),
      unsubscribeFromAddress: vi.fn(async () => {}),
    },
  };
}

/** Registers an encrypted active wallet and returns its address. */
async function createActiveWallet(addressType: 'p2pkh' | 'p2wpkh' = 'p2pkh') {
  const keyPair = ECPair.makeRandom({ network: avianNetwork });
  const address = deriveAddress(Buffer.from(keyPair.publicKey), addressType);
  const encryptedKey = await secureEncrypt(keyPair.toWIF(), TEST_PASSWORD);

  await StorageService.createWallet({
    name: 'Spending',
    address,
    privateKey: encryptedKey,
    isEncrypted: true,
    addressType,
  });

  return { address, keyPair };
}

/** Decodes the hex handed to broadcastTransaction. */
const broadcastTx = (broadcast: ReturnType<typeof vi.fn>) =>
  bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);

const outputsOf = (tx: bitcoin.Transaction) =>
  tx.outs.map((out) => ({
    value: out.value,
    address: bitcoin.address.fromOutputScript(out.script, avianNetwork),
  }));

beforeEach(() => {
  resetStorage();
});

describe('sendTransaction', () => {
  const FEE = 10_000;

  it('builds, signs and broadcasts a transaction that pays the recipient', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    const txid = await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD);

    expect(broadcast).toHaveBeenCalledTimes(1);
    const tx = broadcastTx(broadcast);
    expect(txid).toBe(tx.getId());

    const outputs = outputsOf(tx);
    expect(outputs).toContainEqual({ address: RECIPIENT, value: 100_000 });
  });

  it('returns the change to the sending address', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD);

    const outputs = outputsOf(broadcastTx(broadcast));
    expect(outputs).toContainEqual({ address, value: 500_000 - 100_000 - FEE });
  });

  it('accounts for exactly the fee: inputs minus outputs is the fee rate', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD);

    const tx = broadcastTx(broadcast);
    const totalOut = tx.outs.reduce((sum, out) => sum + out.value, 0);
    expect(500_000 - totalOut).toBe(FEE);
  });

  it('honours a custom fee rate', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD, { feeRate: 25_000 });

    const tx = broadcastTx(broadcast);
    const totalOut = tx.outs.reduce((sum, out) => sum + out.value, 0);
    expect(500_000 - totalOut).toBe(25_000);
  });

  it('omits the change output when there is nothing left over', async () => {
    const { address } = await createActiveWallet();
    // Exactly amount + fee, so change is zero.
    const { electrum, broadcast } = createFakeElectrum(address, [110_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD);

    const tx = broadcastTx(broadcast);
    expect(tx.outs).toHaveLength(1);
    expect(outputsOf(tx)[0]).toEqual({ address: RECIPIENT, value: 100_000 });
  });

  it('sends change to a custom change address when one is given', async () => {
    const { address } = await createActiveWallet();
    const changeAddress = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD, { changeAddress });

    const outputs = outputsOf(broadcastTx(broadcast));
    expect(outputs).toContainEqual({ address: changeAddress, value: 390_000 });
    expect(outputs.map((out) => out.address)).not.toContain(address);
  });

  it('ignores a blank custom change address and falls back to the sender', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD, { changeAddress: '   ' });

    const outputs = outputsOf(broadcastTx(broadcast));
    expect(outputs.map((out) => out.address)).toContain(address);
  });

  it('spends several UTXOs when one is not enough', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [60_000, 70_000, 80_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 150_000, TEST_PASSWORD, {
      strategy: CoinSelectionStrategy.LARGEST_FIRST,
    });

    const tx = broadcastTx(broadcast);
    expect(tx.ins.length).toBeGreaterThan(1);
  });

  it('signs every input it spends', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [60_000, 70_000, 80_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 150_000, TEST_PASSWORD, {
      strategy: CoinSelectionStrategy.LARGEST_FIRST,
    });

    const tx = broadcastTx(broadcast);
    for (const input of tx.ins) {
      expect(input.script.length + (input.witness?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it('stamps the Avian FORKID sighash byte onto legacy signatures', async () => {
    const { address, keyPair } = await createActiveWallet('p2pkh');
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD);

    const tx = broadcastTx(broadcast);
    const [signature, pubkey] = bitcoin.script.decompile(tx.ins[0].script) as Buffer[];

    // Last byte of a scriptSig signature is the sighash flag: SIGHASH_ALL | SIGHASH_FORKID.
    expect(signature[signature.length - 1]).toBe(SIGHASH_ALL_FORKID);
    expect(Buffer.from(pubkey).toString('hex')).toBe(
      Buffer.from(keyPair.publicKey).toString('hex'),
    );
  });

  it('records the send in local history, in AVN rather than satoshis', async () => {
    const { address } = await createActiveWallet();
    const { electrum } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    const txid = await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD);

    const history = await StorageService.getTransactionHistory(address);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      txid,
      type: 'send',
      address: RECIPIENT,
      fromAddress: address,
      walletAddress: address,
      amount: 0.001,
      confirmations: 0,
    });
  });

  it('builds a spendable-looking transaction for a native SegWit wallet', async () => {
    const { address } = await createActiveWallet('p2wpkh');
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD);

    const tx = broadcastTx(broadcast);
    expect(tx.ins[0].witness.length).toBeGreaterThan(0);
    expect(outputsOf(tx)).toContainEqual({ address: RECIPIENT, value: 100_000 });
  });
});

describe('sendTransaction failures', () => {
  it('refuses when there is no active wallet', async () => {
    const { electrum } = createFakeElectrum(RECIPIENT, [500_000]);
    const wallet = new WalletService(electrum as never);

    await expect(wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD)).rejects.toThrow(
      /No active wallet/,
    );
  });

  it('refuses to spend from an encrypted wallet without a password', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await expect(wallet.sendTransaction(RECIPIENT, 100_000)).rejects.toThrow(/Password required/);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('refuses the wrong password and broadcasts nothing', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await expect(wallet.sendTransaction(RECIPIENT, 100_000, 'wrong-password')).rejects.toThrow(
      /Invalid password/,
    );
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('refuses when the wallet has no UTXOs', async () => {
    const { address } = await createActiveWallet();
    const { electrum } = createFakeElectrum(address, []);
    const wallet = new WalletService(electrum as never);

    await expect(wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD)).rejects.toThrow(
      /No unspent transaction outputs/,
    );
  });

  it('refuses when the balance cannot cover the amount plus the fee', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [105_000]);
    const wallet = new WalletService(electrum as never);

    await expect(wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD)).rejects.toThrow(
      /Insufficient funds/,
    );
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('refuses an address that is not valid on the Avian network', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createFakeElectrum(address, [500_000]);
    const wallet = new WalletService(electrum as never);

    await expect(
      wallet.sendTransaction('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 100_000, TEST_PASSWORD),
    ).rejects.toThrow();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('does not record history when the broadcast is rejected', async () => {
    const { address } = await createActiveWallet();
    const { electrum } = createFakeElectrum(address, [500_000]);
    electrum.broadcastTransaction.mockRejectedValueOnce(new Error('node rejected the transaction'));
    const wallet = new WalletService(electrum as never);

    await expect(wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD)).rejects.toThrow();
    expect(await StorageService.getTransactionHistory(address)).toEqual([]);
  });

  it('does not record history when the broadcast returns nothing usable', async () => {
    const { address } = await createActiveWallet();
    const { electrum } = createFakeElectrum(address, [500_000]);
    electrum.broadcastTransaction.mockResolvedValueOnce(undefined as never);
    const wallet = new WalletService(electrum as never);

    await expect(wallet.sendTransaction(RECIPIENT, 100_000, TEST_PASSWORD)).rejects.toThrow(
      /broadcast failed/,
    );
    expect(await StorageService.getTransactionHistory(address)).toEqual([]);
  });
});

describe('sendTransactionWithManualUTXOs', () => {
  it('spends exactly the UTXOs it was handed', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast, utxos } = createFakeElectrum(address, [
      200_000, 300_000, 400_000,
    ]);
    const wallet = new WalletService(electrum as never);

    const chosen = [utxos[0], utxos[2]].map((utxo) => ({ ...utxo, address }));

    await wallet.sendTransactionWithManualUTXOs(RECIPIENT, 100_000, chosen, TEST_PASSWORD);

    const tx = broadcastTx(broadcast);
    expect(tx.ins).toHaveLength(2);

    const spent = tx.ins.map((input) =>
      Buffer.from(input.hash).reverse().toString('hex'),
    );
    expect(spent.sort()).toEqual([utxos[0].txid, utxos[2].txid].sort());
  });

  it('refuses a manual selection that cannot cover the spend', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast, utxos } = createFakeElectrum(address, [50_000]);
    const wallet = new WalletService(electrum as never);

    await expect(
      wallet.sendTransactionWithManualUTXOs(
        RECIPIENT,
        100_000,
        [{ ...utxos[0], address }],
        TEST_PASSWORD,
      ),
    ).rejects.toThrow();
    expect(broadcast).not.toHaveBeenCalled();
  });
});
