import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import { WalletService, avianNetwork, deriveAddress, secureEncrypt } from './WalletService';
import { buildAssetTransferScript, parseAssetScript } from './assetScript';
import { StorageService } from '@/services/core/StorageService';
import { TEST_PASSWORD, resetStorage } from '@/test/helpers';

/**
 * Asset transfers against a stubbed network. The invariants that matter (and that regtest will
 * confirm end-to-end against Core): the asset ledger is conserved (asset in == transfer + change),
 * asset outputs carry 0 AVN, the fee is paid only by AVN inputs, and every input is signed with the
 * FORKID sighash. Nothing is broadcast for real.
 */

const ECPair = ECPairFactory(ecc);
const SIGHASH_ALL_FORKID = 0x41;
const RECIPIENT = 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF';
const ASSET = 'SMAUG';
const COIN = 100_000_000n; // 1 whole unit

/** A prevtx whose output[0] is an asset script paying `amount` of `ASSET` to `owner` (0 AVN value). */
function assetFundingTx(owner: string, amount: bigint, seed: number) {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  tx.addOutput(buildAssetTransferScript(owner, ASSET, amount), 0);
  return { hex: tx.toHex(), txid: tx.getId() };
}

/** A prevtx whose output[0] is a plain P2PKH paying `value` AVN sats to `owner`. */
function avnFundingTx(owner: string, value: number, seed: number) {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  tx.addOutput(bitcoin.address.toOutputScript(owner, avianNetwork), value);
  return { hex: tx.toHex(), txid: tx.getId() };
}

function createAssetElectrum(owner: string, assetAmounts: bigint[], avnValues: number[]) {
  const txs = new Map<string, string>();
  const assetUtxos = assetAmounts.map((amount, i) => {
    const f = assetFundingTx(owner, amount, i + 1);
    txs.set(f.txid, f.hex);
    return { txid: f.txid, vout: 0, value: Number(amount), height: 100, asset: ASSET };
  });
  const avnUtxos = avnValues.map((value, i) => {
    const f = avnFundingTx(owner, value, i + 50);
    txs.set(f.txid, f.hex);
    return { txid: f.txid, vout: 0, value, height: 100 };
  });
  const broadcast = vi.fn(async (hex: string) => bitcoin.Transaction.fromHex(hex).getId());
  return {
    assetUtxos,
    avnUtxos,
    broadcast,
    electrum: {
      getAssetUTXOs: vi.fn(async (_addr: string, name: string) => (name === ASSET ? assetUtxos : [])),
      getUTXOs: vi.fn(async () => avnUtxos),
      getTransaction: vi.fn(async (txid: string) => txs.get(txid)),
      broadcastTransaction: broadcast,
      getCurrentBlockHeight: vi.fn(async () => 100),
      getFeeRateSatPerVByte: vi.fn(async () => 0), // fall back to the explicit feeRate the test passes
      isConnectedToServer: vi.fn(() => true),
    },
  };
}

async function createActiveWallet() {
  const keyPair = ECPair.makeRandom({ network: avianNetwork });
  const address = deriveAddress(Buffer.from(keyPair.publicKey), 'p2pkh');
  await StorageService.createWallet({
    name: 'Assets',
    address,
    privateKey: await secureEncrypt(keyPair.toWIF(), TEST_PASSWORD),
    isEncrypted: true,
    addressType: 'p2pkh',
  });
  return { address, keyPair };
}

/** Classify a broadcast tx's outputs into asset entries and plain AVN outputs. */
function classifyOutputs(tx: bitcoin.Transaction) {
  const assets: { address: string | null; name: string; amount: bigint | null; value: number }[] = [];
  const avn: { address: string; value: number }[] = [];
  for (const out of tx.outs) {
    const info = parseAssetScript(out.script as Buffer);
    if (info) {
      assets.push({ address: info.address, name: info.name, amount: info.amount, value: out.value });
    } else {
      avn.push({ address: bitcoin.address.fromOutputScript(out.script, avianNetwork), value: out.value });
    }
  }
  return { assets, avn };
}

beforeEach(() => {
  resetStorage();
});

describe('sendAssetTransfer', () => {
  it('moves the asset to the recipient with asset change back to the sender', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createAssetElectrum(address, [3n * COIN], [1 * Number(COIN)]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendAssetTransfer(ASSET, 1n * COIN, RECIPIENT, TEST_PASSWORD, { feeRate: 1 });

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    const { assets, avn } = classifyOutputs(tx);

    // Transfer output: 1 unit to the recipient, 0 AVN value.
    expect(assets).toContainEqual({ address: RECIPIENT, name: ASSET, amount: 1n * COIN, value: 0 });
    // Asset change: 2 units back to us, 0 AVN value.
    expect(assets).toContainEqual({ address, name: ASSET, amount: 2n * COIN, value: 0 });
    // Asset ledger is conserved.
    expect(assets.reduce((s, a) => s + (a.amount ?? 0n), 0n)).toBe(3n * COIN);
    // A single AVN change output back to us.
    expect(avn).toHaveLength(1);
    expect(avn[0].address).toBe(address);
  });

  it('emits no asset-change output when the amount matches the asset input exactly', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createAssetElectrum(address, [1n * COIN], [1 * Number(COIN)]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendAssetTransfer(ASSET, 1n * COIN, RECIPIENT, TEST_PASSWORD, { feeRate: 1 });

    const { assets } = classifyOutputs(bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string));
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ address: RECIPIENT, amount: 1n * COIN, value: 0 });
  });

  it('spends several asset UTXOs when one is not enough', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createAssetElectrum(address, [1n * COIN, 1n * COIN], [1 * Number(COIN)]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendAssetTransfer(ASSET, 3n * (COIN / 2n), RECIPIENT, TEST_PASSWORD, { feeRate: 1 });

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    const { assets } = classifyOutputs(tx);
    // Two asset inputs spent; ledger conserved at 2 units (1.5 sent + 0.5 change).
    expect(assets.reduce((s, a) => s + (a.amount ?? 0n), 0n)).toBe(2n * COIN);
    expect(assets).toContainEqual({ address: RECIPIENT, name: ASSET, amount: 3n * (COIN / 2n), value: 0 });
    expect(assets).toContainEqual({ address, name: ASSET, amount: COIN / 2n, value: 0 });
  });

  it('pays the fee from AVN inputs only, never underpaying', async () => {
    const { address } = await createActiveWallet();
    const avnValue = 1 * Number(COIN);
    const { electrum, broadcast } = createAssetElectrum(address, [1n * COIN], [avnValue]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendAssetTransfer(ASSET, 1n * COIN, RECIPIENT, TEST_PASSWORD, { feeRate: 1 });

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    const { avn } = classifyOutputs(tx);
    const avnChange = avn.reduce((s, o) => s + o.value, 0);
    const fee = avnValue - avnChange; // the only AVN input funds fee + change
    expect(fee).toBeGreaterThan(0);
    // Never underpay: fee at 1 sat/vByte must cover the actual virtual size.
    expect(fee).toBeGreaterThanOrEqual(tx.virtualSize());
    // Two inputs: one asset, one AVN.
    expect(tx.ins).toHaveLength(2);
  });

  it('signs every input with the FORKID sighash', async () => {
    const { address, keyPair } = await createActiveWallet();
    const { electrum, broadcast } = createAssetElectrum(address, [2n * COIN], [1 * Number(COIN)]);
    const wallet = new WalletService(electrum as never);

    await wallet.sendAssetTransfer(ASSET, 1n * COIN, RECIPIENT, TEST_PASSWORD, { feeRate: 1 });

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    for (const input of tx.ins) {
      const [signature, pubkey] = bitcoin.script.decompile(input.script) as Buffer[];
      expect(signature[signature.length - 1]).toBe(SIGHASH_ALL_FORKID);
      expect(Buffer.from(pubkey).toString('hex')).toBe(Buffer.from(keyPair.publicKey).toString('hex'));
    }
  });

  it('refuses when the wallet lacks enough of the asset', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createAssetElectrum(address, [1n * COIN], [1 * Number(COIN)]);
    const wallet = new WalletService(electrum as never);

    await expect(
      wallet.sendAssetTransfer(ASSET, 5n * COIN, RECIPIENT, TEST_PASSWORD, { feeRate: 1 }),
    ).rejects.toThrow(/Insufficient SMAUG/);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('refuses when there is no AVN to pay the fee', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createAssetElectrum(address, [1n * COIN], []); // no AVN UTXOs
    const wallet = new WalletService(electrum as never);

    await expect(
      wallet.sendAssetTransfer(ASSET, 1n * COIN, RECIPIENT, TEST_PASSWORD, { feeRate: 1 }),
    ).rejects.toThrow(/AVN for the network fee/);
    expect(broadcast).not.toHaveBeenCalled();
  });
});
