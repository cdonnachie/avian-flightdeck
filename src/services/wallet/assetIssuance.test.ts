import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import { WalletService, avianNetwork, deriveAddress, secureEncrypt } from './WalletService';
import { buildOwnerScript, parseAssetScript, ISSUE_BURN } from './assetScript';
import { StorageService } from '@/services/core/StorageService';
import { TEST_PASSWORD, resetStorage } from '@/test/helpers';

/**
 * Root asset issuance against a stubbed network. Invariants (regtest/mainnet golden-vector confirmed
 * separately): 500 AVN is burned to the issuance burn address, the new-asset output is LAST and the
 * owner token second-to-last (Core requires that order), AVN conservation holds, and every input is
 * FORKID-signed. Nothing is broadcast for real.
 */

const ECPair = ECPairFactory(ecc);
const SIGHASH_ALL_FORKID = 0x41;
const COIN = 100_000_000;
const BURN_ADDRESS = ISSUE_BURN.root.address;

function avnFundingTx(owner: string, value: number, seed: number) {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  tx.addOutput(bitcoin.address.toOutputScript(owner, avianNetwork), value);
  return { hex: tx.toHex(), txid: tx.getId() };
}

function createElectrum(owner: string, avnValues: number[]) {
  const txs = new Map<string, string>();
  const avnUtxos = avnValues.map((value, i) => {
    const f = avnFundingTx(owner, value, i + 1);
    txs.set(f.txid, f.hex);
    return { txid: f.txid, vout: 0, value, height: 100 };
  });
  const broadcast = vi.fn(async (hex: string) => bitcoin.Transaction.fromHex(hex).getId());
  return {
    broadcast,
    electrum: {
      getUTXOs: vi.fn(async () => avnUtxos),
      getTransaction: vi.fn(async (txid: string) => txs.get(txid)),
      broadcastTransaction: broadcast,
      getFeeRateSatPerVByte: vi.fn(async () => 0),
      isConnectedToServer: vi.fn(() => true),
    },
  };
}

async function createActiveWallet() {
  const keyPair = ECPair.makeRandom({ network: avianNetwork });
  const address = deriveAddress(Buffer.from(keyPair.publicKey), 'p2pkh');
  await StorageService.createWallet({
    name: 'Issuer',
    address,
    privateKey: await secureEncrypt(keyPair.toWIF(), TEST_PASSWORD),
    isEncrypted: true,
    addressType: 'p2pkh',
  });
  return { address, keyPair };
}

// These tests exercise the issuance builders, which are gated behind the asset-issuance kill-switch
// (off by default during the network incident). Enable it for this suite; a dedicated test below
// covers the disabled path.
beforeAll(() => {
  process.env.NEXT_PUBLIC_ASSET_ISSUANCE = 'on';
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_ASSET_ISSUANCE;
});

beforeEach(() => {
  resetStorage();
});

describe('asset issuance kill-switch', () => {
  it('refuses to build an issuance while issuance is disabled', async () => {
    const prev = process.env.NEXT_PUBLIC_ASSET_ISSUANCE;
    delete process.env.NEXT_PUBLIC_ASSET_ISSUANCE;
    try {
      const { address } = await createActiveWallet();
      const { electrum } = createElectrum(address, [600 * COIN]);
      const wallet = new WalletService(electrum as never);
      await expect(
        wallet.issueAsset('PAUSEDASSET', { amount: 1n * BigInt(COIN), units: 0, reissuable: true }, TEST_PASSWORD),
      ).rejects.toThrow(/temporarily paused/);
    } finally {
      process.env.NEXT_PUBLIC_ASSET_ISSUANCE = prev;
    }
  });
});

describe('issueAsset (root)', () => {
  it('burns 500 AVN and lays out owner (2nd-last) then new asset (last)', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createElectrum(address, [600 * COIN]);
    const wallet = new WalletService(electrum as never);

    await wallet.issueAsset(
      'MYASSET',
      { amount: 1000n * BigInt(COIN), units: 0, reissuable: true },
      TEST_PASSWORD,
      { feeRate: 1 },
    );

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    const outs = tx.outs;

    // Last output is the new asset; second-to-last is the owner token.
    const assetOut = parseAssetScript(outs[outs.length - 1].script as Buffer);
    const ownerOut = parseAssetScript(outs[outs.length - 2].script as Buffer);
    expect(assetOut).toMatchObject({ type: 'issue', name: 'MYASSET', amount: 1000n * BigInt(COIN) });
    expect(outs[outs.length - 1].value).toBe(0);
    expect(ownerOut).toMatchObject({ type: 'owner', name: 'MYASSET!', amount: null });
    expect(outs[outs.length - 2].value).toBe(0);

    // A 500-AVN burn to the issuance burn address exists.
    const burn = outs.find(
      (o) => o.value === 500 * COIN &&
        (() => {
          try {
            return bitcoin.address.fromOutputScript(o.script, avianNetwork) === BURN_ADDRESS;
          } catch {
            return false;
          }
        })(),
    );
    expect(burn).toBeDefined();
  });

  it('conserves AVN: input = burn + change + fee, never underpaying', async () => {
    const { address } = await createActiveWallet();
    const avnValue = 600 * COIN;
    const { electrum, broadcast } = createElectrum(address, [avnValue]);
    const wallet = new WalletService(electrum as never);

    await wallet.issueAsset(
      'MYASSET',
      { amount: 1n * BigInt(COIN), units: 0, reissuable: false },
      TEST_PASSWORD,
      { feeRate: 1 },
    );

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    // AVN out = burn + change (asset/owner outputs are 0).
    const avnOut = tx.outs.reduce((s, o) => s + o.value, 0);
    const fee = avnValue - avnOut;
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBeGreaterThanOrEqual(tx.virtualSize());
  });

  it('signs every input with the FORKID sighash', async () => {
    const { address, keyPair } = await createActiveWallet();
    const { electrum, broadcast } = createElectrum(address, [600 * COIN]);
    const wallet = new WalletService(electrum as never);

    await wallet.issueAsset(
      'MYASSET',
      { amount: 1n * BigInt(COIN), units: 0, reissuable: true },
      TEST_PASSWORD,
      { feeRate: 1 },
    );

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    for (const input of tx.ins) {
      const [signature, pubkey] = bitcoin.script.decompile(input.script) as Buffer[];
      expect(signature[signature.length - 1]).toBe(SIGHASH_ALL_FORKID);
      expect(Buffer.from(pubkey).toString('hex')).toBe(Buffer.from(keyPair.publicKey).toString('hex'));
    }
  });

  it('refuses an invalid asset name', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createElectrum(address, [600 * COIN]);
    const wallet = new WalletService(electrum as never);

    await expect(
      wallet.issueAsset('my asset!', { amount: 1n * BigInt(COIN), units: 0, reissuable: true }, TEST_PASSWORD),
    ).rejects.toThrow(/Invalid asset name/);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('refuses when AVN cannot cover the 500-AVN burn plus fee', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createElectrum(address, [100 * COIN]); // < 500 AVN
    const wallet = new WalletService(electrum as never);

    await expect(
      wallet.issueAsset('MYASSET', { amount: 1n * BigInt(COIN), units: 0, reissuable: true }, TEST_PASSWORD, {
        feeRate: 1,
      }),
    ).rejects.toThrow(/burns 500 AVN/);
    expect(broadcast).not.toHaveBeenCalled();
  });
});

/** A prevtx whose output[0] is the `PARENT!` owner token (an asset script) paying the owner. */
function ownerFundingTx(owner: string, parentName: string, seed: number) {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  tx.addOutput(buildOwnerScript(owner, parentName), 0);
  return { hex: tx.toHex(), txid: tx.getId() };
}

/** Electrum stub with a parent owner-token UTXO plus AVN UTXOs. */
function createChildElectrum(owner: string, parentName: string, avnValues: number[], hasOwner = true) {
  const txs = new Map<string, string>();
  const ownerName = `${parentName}!`;
  const ownerUtxos: { txid: string; vout: number; value: number; height: number; asset: string }[] = [];
  if (hasOwner) {
    const f = ownerFundingTx(owner, parentName, 200);
    txs.set(f.txid, f.hex);
    ownerUtxos.push({ txid: f.txid, vout: 0, value: COIN, height: 100, asset: ownerName });
  }
  const avnUtxos = avnValues.map((value, i) => {
    const f = avnFundingTx(owner, value, i + 1);
    txs.set(f.txid, f.hex);
    return { txid: f.txid, vout: 0, value, height: 100 };
  });
  const broadcast = vi.fn(async (hex: string) => bitcoin.Transaction.fromHex(hex).getId());
  return {
    broadcast,
    electrum: {
      getAssetUTXOs: vi.fn(async (_a: string, name: string) => (name === ownerName ? ownerUtxos : [])),
      getUTXOs: vi.fn(async () => avnUtxos),
      getTransaction: vi.fn(async (txid: string) => txs.get(txid)),
      broadcastTransaction: broadcast,
      getFeeRateSatPerVByte: vi.fn(async () => 0),
      isConnectedToServer: vi.fn(() => true),
    },
  };
}

describe('issueUniqueAsset', () => {
  it('spends the parent owner token, burns 5 AVN, and lays out the unique correctly', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createChildElectrum(address, 'MYASSET', [10 * COIN]);
    const wallet = new WalletService(electrum as never);

    await wallet.issueUniqueAsset('MYASSET#001', undefined, TEST_PASSWORD, { feeRate: 1 });

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    const outs = tx.outs;
    // 5-AVN burn to the unique burn address.
    expect(
      outs.some(
        (o) => o.value === 5 * COIN &&
          (() => {
            try {
              return bitcoin.address.fromOutputScript(o.script, avianNetwork) === ISSUE_BURN.unique.address;
            } catch {
              return false;
            }
          })(),
      ),
    ).toBe(true);
    // A unique has NO owner token of its own: parent owner returned (2nd-last), unique asset (last).
    expect(parseAssetScript(outs[outs.length - 2].script as Buffer)).toMatchObject({
      type: 'transfer',
      name: 'MYASSET!',
    });
    expect(parseAssetScript(outs[outs.length - 1].script as Buffer)).toMatchObject({
      type: 'issue',
      name: 'MYASSET#001',
      amount: 1n * BigInt(COIN),
    });
    // A NAME#unique! owner-creation output is rejected by Avian consensus (it split the chain versus
    // 4.2.0), so unique issuance must never emit one.
    expect(outs.some((o) => parseAssetScript(o.script as Buffer)?.type === 'owner')).toBe(false);
    // First input is the parent owner token.
    expect(tx.ins.length).toBe(2); // owner + one AVN
  });

  it('refuses when the parent owner token is not held', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createChildElectrum(address, 'MYASSET', [10 * COIN], false);
    const wallet = new WalletService(electrum as never);

    await expect(wallet.issueUniqueAsset('MYASSET#001', undefined, TEST_PASSWORD, { feeRate: 1 })).rejects.toThrow(
      /MYASSET! owner token/,
    );
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('issueSubAsset', () => {
  it('spends the parent owner token, burns 100 AVN, and creates the sub + its owner', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createChildElectrum(address, 'MYASSET', [200 * COIN]);
    const wallet = new WalletService(electrum as never);

    await wallet.issueSubAsset(
      'MYASSET/SUB',
      { amount: 1000n * BigInt(COIN), units: 2, reissuable: true },
      TEST_PASSWORD,
      { feeRate: 1 },
    );

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    const outs = tx.outs;
    expect(
      outs.some(
        (o) => o.value === 100 * COIN &&
          (() => {
            try {
              return bitcoin.address.fromOutputScript(o.script, avianNetwork) === ISSUE_BURN.sub.address;
            } catch {
              return false;
            }
          })(),
      ),
    ).toBe(true);
    expect(parseAssetScript(outs[outs.length - 2].script as Buffer)).toMatchObject({
      type: 'owner',
      name: 'MYASSET/SUB!',
    });
    expect(parseAssetScript(outs[outs.length - 1].script as Buffer)).toMatchObject({
      type: 'issue',
      name: 'MYASSET/SUB',
      amount: 1000n * BigInt(COIN),
    });
  });
});

describe('reissueAsset', () => {
  it('spends the owner token, burns 100 AVN, and lays out owner (2nd-last) then reissue (last)', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createChildElectrum(address, 'MYASSET', [200 * COIN]);
    const wallet = new WalletService(electrum as never);

    await wallet.reissueAsset(
      'MYASSET',
      { amount: 500n * BigInt(COIN), units: -1, reissuable: true },
      TEST_PASSWORD,
      { feeRate: 1 },
    );

    const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0] as string);
    const outs = tx.outs;
    // 100-AVN burn to the reissue burn address.
    expect(
      outs.some(
        (o) => o.value === 100 * COIN &&
          (() => {
            try {
              return bitcoin.address.fromOutputScript(o.script, avianNetwork) === ISSUE_BURN.reissue.address;
            } catch {
              return false;
            }
          })(),
      ),
    ).toBe(true);
    // Owner returned (2nd-last), reissue output (last) — no new owner token.
    expect(parseAssetScript(outs[outs.length - 2].script as Buffer)).toMatchObject({
      type: 'transfer',
      name: 'MYASSET!',
    });
    expect(parseAssetScript(outs[outs.length - 1].script as Buffer)).toMatchObject({
      type: 'reissue',
      name: 'MYASSET',
      amount: 500n * BigInt(COIN),
    });
    // Two inputs: the owner token + one AVN.
    expect(tx.ins.length).toBe(2);
  });

  it('refuses when the owner token is not held', async () => {
    const { address } = await createActiveWallet();
    const { electrum, broadcast } = createChildElectrum(address, 'MYASSET', [200 * COIN], false);
    const wallet = new WalletService(electrum as never);

    await expect(
      wallet.reissueAsset('MYASSET', { amount: 1n * BigInt(COIN), units: -1, reissuable: true }, TEST_PASSWORD, {
        feeRate: 1,
      }),
    ).rejects.toThrow(/MYASSET! owner token/);
    expect(broadcast).not.toHaveBeenCalled();
  });
});
