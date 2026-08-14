import { beforeEach, describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import { WalletService, avianNetwork, deriveAddress, secureEncrypt } from './WalletService';
import { isAssetScript, OP_AVN_ASSET, SIGHASH_ALL_FORKID } from './psbt';
import { StorageService } from '@/services/core/StorageService';
import { TEST_PASSWORD, resetStorage } from '@/test/helpers';

/**
 * PSBT engine. Avian uses stock BIP174 with a 0x41 (ALL|FORKID) sighash; these tests prove the
 * engine parses/summarises a PSBT, signs our inputs with that sighash, finalises to a valid
 * transaction, and refuses to touch asset inputs. Nothing is broadcast.
 */

const ECPair = ECPairFactory(ecc);
const RECIPIENT = 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF';

/** A previous P2PKH transaction paying `value` to `address`. */
function fundingTx(address: string, value: number, seed: number) {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  tx.addOutput(bitcoin.address.toOutputScript(address, avianNetwork), value);
  return { hex: tx.toHex(), txid: tx.getId() };
}

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

/** An unsigned single-input, single-output PSBT spending `funding` to RECIPIENT. */
function buildPsbt(fundingHex: string, fundingTxid: string, sendValue: number) {
  const psbt = new bitcoin.Psbt({ network: avianNetwork });
  psbt.addInput({
    hash: fundingTxid,
    index: 0,
    nonWitnessUtxo: Buffer.from(fundingHex, 'hex'),
  });
  psbt.addOutput({ address: RECIPIENT, value: sendValue });
  return psbt.toBase64();
}

beforeEach(() => {
  resetStorage();
});

describe('isAssetScript', () => {
  it('is false for a bare 25-byte P2PKH', () => {
    const script = bitcoin.address.toOutputScript(RECIPIENT, avianNetwork);
    expect(script.length).toBe(25);
    expect(isAssetScript(script)).toBe(false);
  });

  it('is true for a P2PKH with an OP_AVN_ASSET tail', () => {
    const p2pkh = bitcoin.address.toOutputScript(RECIPIENT, avianNetwork);
    const assetScript = Buffer.concat([p2pkh, Buffer.from([OP_AVN_ASSET, 0x04, 1, 2, 3, 4, 0x75])]);
    expect(isAssetScript(assetScript)).toBe(true);
  });
});

describe('summarizePsbt', () => {
  it('describes inputs, outputs, fee and what we can sign', async () => {
    const { address } = await createActiveWallet();
    const { hex, txid } = fundingTx(address, 500_000, 1);
    const psbtB64 = buildPsbt(hex, txid, 100_000);

    const summary = await new WalletService({} as never).summarizePsbt(psbtB64, address);

    expect(summary.inputs).toHaveLength(1);
    expect(summary.inputs[0]).toMatchObject({
      txid,
      vout: 0,
      value: 500_000,
      address,
      isMine: true,
      isAsset: false,
      signed: false,
    });
    expect(summary.outputs).toHaveLength(1);
    expect(summary.outputs[0]).toMatchObject({ address: RECIPIENT, value: 100_000, isMine: false });
    expect(summary.totalIn).toBe(500_000);
    expect(summary.totalOut).toBe(100_000);
    expect(summary.fee).toBe(400_000);
    expect(summary.signableByUs).toBe(1);
    expect(summary.complete).toBe(false);
    expect(summary.hasAsset).toBe(false);
  });
});

describe('signPsbt / finalizePsbt', () => {
  it('signs our input with the FORKID sighash and finalises to a valid transaction', async () => {
    const { address, keyPair } = await createActiveWallet('p2pkh');
    const { hex, txid } = fundingTx(address, 500_000, 2);
    const psbtB64 = buildPsbt(hex, txid, 100_000);
    const wallet = new WalletService({} as never);

    const signed = await wallet.signPsbt(psbtB64, TEST_PASSWORD);
    expect(signed.signedInputs).toBe(1);
    expect(signed.complete).toBe(true);

    // Avian Core cannot decode a FORKID partial_sig, so signPsbt must finalize: the input carries
    // finalScriptSig and NO lingering partialSig, otherwise Core rejects the PSBT on import.
    const parsed = bitcoin.Psbt.fromBase64(signed.psbt, { network: avianNetwork });
    expect(parsed.data.inputs[0].finalScriptSig).toBeDefined();
    expect(parsed.data.inputs[0].partialSig).toBeUndefined();

    const { hex: rawHex, txid: finalTxid } = wallet.finalizePsbt(signed.psbt);
    const tx = bitcoin.Transaction.fromHex(rawHex);
    expect(tx.getId()).toBe(finalTxid);

    // Legacy scriptSig = [signature, pubkey]; the signature's last byte is the sighash flag.
    const [signature, pubkey] = bitcoin.script.decompile(tx.ins[0].script) as Buffer[];
    expect(signature[signature.length - 1]).toBe(SIGHASH_ALL_FORKID); // 0x41
    expect(Buffer.from(pubkey).toString('hex')).toBe(Buffer.from(keyPair.publicKey).toString('hex'));

    // Output is preserved.
    expect(tx.outs[0].value).toBe(100_000);
  });

  it('signs a native SegWit (P2WPKH) input via BIP143 and finalises to a witness', async () => {
    const { address, keyPair } = await createActiveWallet('p2wpkh');
    const { hex, txid } = fundingTx(address, 500_000, 6);
    const psbtB64 = buildPsbt(hex, txid, 100_000);
    const wallet = new WalletService({} as never);

    const signed = await wallet.signPsbt(psbtB64, TEST_PASSWORD);
    expect(signed.signedInputs).toBe(1);
    expect(signed.complete).toBe(true);

    // Finalized inline (see the P2PKH case): witness input carries finalScriptWitness, no partialSig.
    const parsed = bitcoin.Psbt.fromBase64(signed.psbt, { network: avianNetwork });
    expect(parsed.data.inputs[0].finalScriptWitness).toBeDefined();
    expect(parsed.data.inputs[0].partialSig).toBeUndefined();

    const { hex: rawHex } = wallet.finalizePsbt(signed.psbt);
    const tx = bitcoin.Transaction.fromHex(rawHex);

    // Native SegWit: scriptSig is empty, the [signature, pubkey] live in the witness.
    expect(tx.ins[0].script).toHaveLength(0);
    expect(tx.ins[0].witness).toHaveLength(2);
    const [signature, pubkey] = tx.ins[0].witness;
    expect(signature[signature.length - 1]).toBe(SIGHASH_ALL_FORKID); // 0x41
    expect(Buffer.from(pubkey).toString('hex')).toBe(Buffer.from(keyPair.publicKey).toString('hex'));
  });

  it('is a no-op on inputs that are not ours', async () => {
    await createActiveWallet();
    // Funding pays a different address, so our key cannot sign it.
    const stranger = ECPair.makeRandom({ network: avianNetwork });
    const strangerAddr = deriveAddress(Buffer.from(stranger.publicKey), 'p2pkh');
    const { hex, txid } = fundingTx(strangerAddr, 500_000, 3);
    const psbtB64 = buildPsbt(hex, txid, 100_000);

    const signed = await new WalletService({} as never).signPsbt(psbtB64, TEST_PASSWORD);
    expect(signed.signedInputs).toBe(0);
    expect(signed.complete).toBe(false);
  });

  it('refuses to sign an asset input (never burns an asset)', async () => {
    const { address } = await createActiveWallet();
    // A prevout paying our P2PKH but with an OP_AVN_ASSET tail — an asset UTXO.
    const p2pkh = bitcoin.address.toOutputScript(address, avianNetwork);
    const assetScript = Buffer.concat([p2pkh, Buffer.from([OP_AVN_ASSET, 0x03, 9, 9, 9, 0x75])]);
    const prev = new bitcoin.Transaction();
    prev.version = 2;
    prev.addInput(Buffer.alloc(32, 4), 0);
    prev.addOutput(assetScript, 500_000);

    const psbt = new bitcoin.Psbt({ network: avianNetwork });
    psbt.addInput({ hash: prev.getId(), index: 0, nonWitnessUtxo: prev.toBuffer() });
    psbt.addOutput({ address: RECIPIENT, value: 100_000 });

    const summary = await new WalletService({} as never).summarizePsbt(psbt.toBase64(), address);
    expect(summary.inputs[0].isAsset).toBe(true);
    expect(summary.signableByUs).toBe(0);

    const signed = await new WalletService({} as never).signPsbt(psbt.toBase64(), TEST_PASSWORD);
    expect(signed.signedInputs).toBe(0);
  });

  it('round-trips an unsigned PSBT through base64 unchanged', async () => {
    const { address } = await createActiveWallet();
    const { hex, txid } = fundingTx(address, 500_000, 5);
    const psbtB64 = buildPsbt(hex, txid, 100_000);

    const reparsed = bitcoin.Psbt.fromBase64(psbtB64, { network: avianNetwork });
    expect(reparsed.toBase64()).toBe(psbtB64);
  });
});
