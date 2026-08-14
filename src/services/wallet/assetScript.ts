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

/** The 25-byte P2PKH output script for a legacy R-address. Throws on bech32 — assets are legacy-only. */
function legacyP2PKHScript(address: string): Buffer {
  const p2pkh = bitcoin.address.toOutputScript(address, avianNetwork);
  if (p2pkh.length !== 25 || p2pkh[0] !== bitcoin.opcodes.OP_DUP) {
    throw new Error('Assets require a legacy P2PKH (R…) address — not a bech32 (avn1…) address');
  }
  return p2pkh;
}

/** Wrap an asset payload as `<P2PKH> OP_AVN_ASSET <push payload> OP_DROP`. */
function wrapAssetScript(p2pkh: Buffer, payload: Buffer): Buffer {
  return Buffer.concat([p2pkh, bitcoin.script.compile([OP_AVN_ASSET, payload, bitcoin.opcodes.OP_DROP])]);
}

function int64LE(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(value);
  return b;
}

/**
 * Build a transfer output that pays `amount` (integer units) of `name` to `address`. The address
 * must be a legacy P2PKH (`R…`) — assets never live on bech32. Throws on a non-P2PKH address or a
 * non-positive amount.
 */
export function buildAssetTransferScript(address: string, name: string, amount: bigint): Buffer {
  if (amount <= 0n) throw new Error('Asset transfer amount must be positive');
  const nameBuf = Buffer.from(name, 'ascii');
  const payload = Buffer.concat([
    ASSET_MARKER,
    Buffer.from([ASSET_TYPE.transfer]),
    encodeCompactSize(nameBuf.length),
    nameBuf,
    int64LE(amount),
  ]);
  return wrapAssetScript(legacyP2PKHScript(address), payload);
}

// Issuance burn cost + mainnet burn address per type (Avian Core assets.cpp). Creating an asset
// sends this AVN to an unspendable burn address — it is permanently destroyed.
export const ISSUE_BURN = {
  root: { amount: 500n * 100_000_000n, address: 'RXissueAssetXXXXXXXXXXXXXXXXXhhZGt' },
  sub: { amount: 100n * 100_000_000n, address: 'RXissueSubAssetXXXXXXXXXXXXXWcwhwL' },
  unique: { amount: 5n * 100_000_000n, address: 'RXissueUniqueAssetXXXXXXXXXXWEAe58' },
  reissue: { amount: 100n * 100_000_000n, address: 'RXReissueAssetXXXXXXXXXXXXXXVEFAWu' },
} as const;

/** Sentinel for a reissue that leaves the asset's divisions unchanged (Core: nUnits == -1). */
export const REISSUE_UNITS_UNCHANGED = -1;

/**
 * Whether `name` is a valid root asset name (a friendly pre-flight; consensus is authoritative).
 * Core: 3–30 of A–Z 0–9 `_` `.`, no leading/trailing or doubled punctuation.
 */
export function isValidRootAssetName(name: string): boolean {
  if (name.length < 3 || name.length > 30) return false;
  if (!/^[A-Z0-9._]+$/.test(name)) return false;
  if (/^[._]|[._]$/.test(name)) return false;
  if (/[._]{2}/.test(name)) return false;
  return true;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Plain base58 (btc alphabet, no checksum) decode — for IPFS `Qm…` hashes. */
function base58Decode(input: string): Buffer {
  const bytes = [0];
  for (const ch of input) {
    const value = BASE58_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('Invalid base58 character');
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; k < input.length && input[k] === '1'; k++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

/**
 * Encode an asset's IPFS/TXid reference into the 34-byte on-chain blob Core expects. Avian (like
 * Ravencoin) only accepts **IPFS v0** CIDs — the 46-char base58 `Qm…` sha2-256 hash — which decodes
 * directly to `0x12 0x20 <32-byte sha256>`; a v1 CID (`bafy…`) is rejected. A TXid is 64 hex chars,
 * emitted as `0x54 0x20 <32-byte txid>`. Byte-exact to Avian Core DecodeAssetData + SerializeIPFSHash.
 */
export function encodeAssetData(hashOrTxid: string): Buffer {
  const value = hashOrTxid.trim();
  if (value.length === 46 && value.startsWith('Qm')) {
    const decoded = base58Decode(value);
    if (decoded.length !== 34) throw new Error('Invalid IPFS v0 hash');
    return decoded; // already 0x12 0x20 ‖ 32-byte hash
  }
  if (value.length === 64 && /^[0-9a-fA-F]+$/.test(value)) {
    return Buffer.concat([Buffer.from([TXID_NOTIFIER, 0x20]), Buffer.from(value, 'hex')]);
  }
  throw new Error('Provide an IPFS v0 hash (Qm…, 46 characters) or a 64-character txid');
}

const TXID_NOTIFIER = 0x54;

export interface IssuanceParams {
  name: string;
  /** Total supply in integer units (10^8-scaled), e.g. 1 whole unit = 100000000. */
  amount: bigint;
  /** Divisibility 0–8. */
  units: number;
  reissuable: boolean;
  /** Optional IPFS hash (Qm…) or 64-hex txid to associate with the asset. */
  ipfs?: string;
}

/**
 * Build a new-asset issuance output (`rvn·q · CNewAsset`) paying the created supply to `address`.
 * Carries an optional IPFS/TXid hash; ANS is never carried (flag 0). Byte-exact to Avian Core
 * `CNewAsset` (name, amount, units, reissuable, hasIPFS[, ipfs], hasANS).
 */
export function buildIssuanceScript(address: string, params: IssuanceParams): Buffer {
  const { name, amount, units, reissuable, ipfs } = params;
  if (amount <= 0n) throw new Error('Issuance amount must be positive');
  if (units < 0 || units > 8) throw new Error('Units must be between 0 and 8');
  const nameBuf = Buffer.from(name, 'ascii');
  const ipfsBlob = ipfs ? encodeAssetData(ipfs) : null;
  const payload = Buffer.concat([
    ASSET_MARKER,
    Buffer.from([ASSET_TYPE.issue]),
    encodeCompactSize(nameBuf.length),
    nameBuf,
    int64LE(amount),
    Buffer.from([units & 0xff]),
    Buffer.from([reissuable ? 1 : 0]),
    Buffer.from([ipfsBlob ? 1 : 0]), // hasIPFS
    ...(ipfsBlob ? [ipfsBlob] : []),
    Buffer.from([0]), // hasANS = 0
  ]);
  return wrapAssetScript(legacyP2PKHScript(address), payload);
}

export interface ReissueParams {
  name: string;
  /** Additional supply to mint (10^8-scaled); 0 for a metadata-only reissue. */
  amount: bigint;
  /** New divisions 0–8, or REISSUE_UNITS_UNCHANGED (-1) to leave them as they are. */
  units: number;
  /** Whether the asset stays reissuable afterwards (false locks it permanently). */
  reissuable: boolean;
  /** Optional new IPFS/txid; omit to keep the existing one. */
  ipfs?: string;
}

/**
 * Build a reissue output (`rvn·r · CReissueAsset`) minting `amount` more of an existing asset to
 * `address` and/or updating its units/reissuable/IPFS. `CReissueAsset` has no hasIPFS/hasANS flags:
 * the IPFS blob is present only when given, and an empty ANS id is a trailing 0x00. Byte-exact to
 * Avian Core.
 */
export function buildReissueScript(address: string, params: ReissueParams): Buffer {
  const { name, amount, units, reissuable, ipfs } = params;
  if (amount < 0n) throw new Error('Reissue amount cannot be negative');
  if (units !== REISSUE_UNITS_UNCHANGED && (units < 0 || units > 8)) {
    throw new Error('Units must be 0–8, or -1 to keep them unchanged');
  }
  const nameBuf = Buffer.from(name, 'ascii');
  const ipfsBlob = ipfs ? encodeAssetData(ipfs) : null;
  const payload = Buffer.concat([
    ASSET_MARKER,
    Buffer.from([ASSET_TYPE.reissue]),
    encodeCompactSize(nameBuf.length),
    nameBuf,
    int64LE(amount),
    Buffer.from([units & 0xff]), // -1 → 0xff (no change)
    Buffer.from([reissuable ? 1 : 0]),
    ...(ipfsBlob ? [ipfsBlob] : []), // SerializeIPFSHash writes nothing when absent
    Buffer.from([0]), // empty strANSID
  ]);
  return wrapAssetScript(legacyP2PKHScript(address), payload);
}

/**
 * Build the owner-token output (`rvn·o`) for an issuance. `assetName` is the asset being created
 * (root or sub); the token name carries the trailing `!` and no amount. Byte-exact to Core's
 * ConstructOwnerTransaction.
 */
export function buildOwnerScript(address: string, assetName: string): Buffer {
  const nameBuf = Buffer.from(`${assetName}!`, 'ascii');
  const payload = Buffer.concat([
    ASSET_MARKER,
    Buffer.from([ASSET_TYPE.owner]),
    encodeCompactSize(nameBuf.length),
    nameBuf,
  ]);
  return wrapAssetScript(legacyP2PKHScript(address), payload);
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
