// Avian asset script build/parse. This is the byte-exact, security-critical core of asset transfers:
// a wrong marker or a mis-sized field builds an invalid — and unrecoverable — asset output. Grounded
// in Avian Core (`src/assets/assettypes.h`, `assets.cpp`):
//
//   asset output = <25-byte P2PKH> OP_AVN_ASSET(0xc0) <push: marker ‖ type ‖ payload> OP_DROP(0x75)
//
// The marker is "rvn" (0x72 0x76 0x6e) — a retained Ravencoin-compatibility artifact, NOT "avn".
// Type byte: 't' transfer · 'r' issue/reissue · 'o' owner · 'q' qualifier. A plain transfer payload
// (no message/expiry) is: compactSize(nameLen) ‖ name(ASCII) ‖ int64LE(amount).
//
// This module only builds *transfers* (the Phase-2 scope: root, sub and unique assets — the transfer
// script is identical for all three, only the name differs). It parses transfer and owner outputs so
// history and PSBT review can label them. Issue/reissue are recognised but not built here.

import * as bitcoin from 'bitcoinjs-lib';

import { avianNetwork } from './WalletService';
import { OP_AVN_ASSET, isAssetScript } from './psbt';

/** The on-chain asset marker: "rvn" (0x72 0x76 0x6e). NOT "avn" — see the file header. */
export const ASSET_MARKER = Buffer.from('rvn', 'ascii');

// Type byte after the "rvn" marker. Confirmed against a real mainnet Core issuance tx: 'q' is a new
// asset, 'r' is a reissue (they are NOT the other way round), 't' a transfer, 'o' an owner token.
export const ASSET_TYPE = {
  transfer: 0x74, // 't'
  issue: 0x71, // 'q' — new asset issuance
  reissue: 0x72, // 'r'
  owner: 0x6f, // 'o'
} as const;

export interface AssetScriptInfo {
  type: 'transfer' | 'issue' | 'reissue' | 'owner' | 'unknown';
  /** Address the P2PKH part pays to (null if it isn't a standard address). */
  address: string | null;
  name: string;
  /** Amount in integer units (scaled by 10^8); null for an owner token, which carries no amount. */
  amount: bigint | null;
}

function encodeCompactSize(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = 0xfe;
  b.writeUInt32LE(n, 1);
  return b;
}

function readCompactSize(buf: Buffer, offset: number): { value: number; size: number } {
  const first = buf[offset];
  if (first < 0xfd) return { value: first, size: 1 };
  if (first === 0xfd) return { value: buf.readUInt16LE(offset + 1), size: 3 };
  if (first === 0xfe) return { value: buf.readUInt32LE(offset + 1), size: 5 };
  // 0xff (8-byte) — asset names are short, so this never occurs in practice.
  return { value: Number(buf.readBigUInt64LE(offset + 1)), size: 9 };
}

/**
 * Build a transfer output that pays `amount` (integer units) of `name` to `address`. The address
 * must be a legacy P2PKH (`R…`) — assets never live on bech32. Throws on a non-P2PKH address or a
 * non-positive amount.
 */
export function buildAssetTransferScript(address: string, name: string, amount: bigint): Buffer {
  if (amount <= 0n) throw new Error('Asset transfer amount must be positive');
  const p2pkh = bitcoin.address.toOutputScript(address, avianNetwork);
  if (p2pkh.length !== 25 || p2pkh[0] !== bitcoin.opcodes.OP_DUP) {
    throw new Error('Asset transfers require a legacy P2PKH (R…) address');
  }
  const nameBuf = Buffer.from(name, 'ascii');
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigInt64LE(amount);

  const payload = Buffer.concat([
    ASSET_MARKER,
    Buffer.from([ASSET_TYPE.transfer]),
    encodeCompactSize(nameBuf.length),
    nameBuf,
    amountBuf,
  ]);

  const tag = bitcoin.script.compile([OP_AVN_ASSET, payload, bitcoin.opcodes.OP_DROP]);
  return Buffer.concat([p2pkh, tag]);
}

/** Decode an asset output script into its type, address, name and amount (null if not an asset). */
export function parseAssetScript(script: Buffer): AssetScriptInfo | null {
  if (!isAssetScript(script)) return null;

  const chunks = bitcoin.script.decompile(script);
  if (!chunks) return null;
  const tagIndex = chunks.findIndex((c) => c === OP_AVN_ASSET);
  if (tagIndex < 0) return null;
  const payload = chunks[tagIndex + 1];
  if (!Buffer.isBuffer(payload) || payload.length < 5) return null;
  if (!payload.subarray(0, 3).equals(ASSET_MARKER)) return null;

  const typeByte = payload[3];
  let address: string | null = null;
  try {
    address = bitcoin.address.fromOutputScript(script.subarray(0, 25), avianNetwork);
  } catch {
    address = null;
  }

  let offset = 4;
  const { value: nameLen, size } = readCompactSize(payload, offset);
  offset += size;
  if (offset + nameLen > payload.length) return null;
  const name = payload.subarray(offset, offset + nameLen).toString('ascii');
  offset += nameLen;

  let type: AssetScriptInfo['type'] = 'unknown';
  let amount: bigint | null = null;
  // transfer / new-asset issue / reissue all carry an int64 amount right after the name; an owner
  // token carries none.
  if (typeByte === ASSET_TYPE.transfer) type = 'transfer';
  else if (typeByte === ASSET_TYPE.issue) type = 'issue';
  else if (typeByte === ASSET_TYPE.reissue) type = 'reissue';
  else if (typeByte === ASSET_TYPE.owner) type = 'owner';
  if (type !== 'owner' && type !== 'unknown' && offset + 8 <= payload.length) {
    amount = payload.readBigInt64LE(offset);
  }

  return { type, address, name, amount };
}
