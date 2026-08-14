// Asset transaction history: turn a raw transaction into a human label like "Received 5 SMAUG",
// "Issued FLIGHTDECK#desktop" or "Reissued CRAIG_KINGDOM". This is read-only display logic — it
// decodes a transaction's outputs and classifies the asset movement from the wallet's point of
// view. It never touches the sync pipeline or storage; the transaction history stores only the AVN
// side, so we re-derive the asset side on demand from the raw hex.

import * as bitcoin from 'bitcoinjs-lib';
import { parseAssetScript, type AssetScriptInfo } from './assetScript';

/** One asset touched by a transaction, with the amount involved (null for an owner token). */
export interface AssetTxEntry {
  name: string;
  /** Integer units, scaled by 10^8 (like AVN); null for an owner token, which carries no amount. */
  amount: bigint | null;
}

export interface AssetTxLabel {
  /** issue = minted new, reissue = minted more / updated, send/receive = a transfer. */
  action: 'issue' | 'reissue' | 'send' | 'receive';
  entries: AssetTxEntry[];
}

/**
 * Decode every asset-carrying output of a raw transaction. bitcoinjs parses the outputs generically
 * (the asset bytes are just part of each scriptPubKey), so this works regardless of how a given
 * ElectrumX server renders assets in its verbose decode. Non-asset outputs are skipped.
 */
export function decodeAssetOutputs(txHex: string): AssetScriptInfo[] {
  const tx = bitcoin.Transaction.fromHex(txHex);
  const infos: AssetScriptInfo[] = [];
  for (const out of tx.outs) {
    const info = parseAssetScript(out.script);
    if (info) infos.push(info);
  }
  return infos;
}

/** Sum output amounts by asset name, preserving first-seen order. */
function aggregate(outs: AssetScriptInfo[]): AssetTxEntry[] {
  const order: string[] = [];
  const totals = new Map<string, bigint>();
  for (const o of outs) {
    if (!totals.has(o.name)) order.push(o.name);
    // An owner token carries no amount but represents a single unit (scaled by 10^8 like any asset).
    const amt = o.amount ?? (o.type === 'owner' ? 100_000_000n : 0n);
    totals.set(o.name, (totals.get(o.name) ?? 0n) + amt);
  }
  return order.map((name) => ({ name, amount: totals.get(name) ?? 0n }));
}

/**
 * Classify a transaction's asset movement from the wallet's perspective. `rowType` is the history
 * row's existing AVN-side classification (send/receive), which we trust to pick direction without
 * fetching input ownership.
 *
 * A wallet only ever issues or reissues on a send (it pays the burn), so the mint labels are gated
 * to send rows. On a receive we describe purely what landed in the wallet — even when the whole
 * transaction is an issuance done by someone else, from here it is simply an inbound asset. Sent
 * transfers are attributed to outputs paying other addresses, so change back to the wallet is
 * naturally excluded.
 */
export function describeAssetTx(
  outputs: AssetScriptInfo[],
  walletAddress: string,
  rowType: 'send' | 'receive',
): AssetTxLabel | null {
  if (outputs.length === 0) return null;

  if (rowType === 'send') {
    const issue = outputs.filter((o) => o.type === 'issue');
    if (issue.length) return { action: 'issue', entries: aggregate(issue) };

    const reissue = outputs.filter((o) => o.type === 'reissue');
    if (reissue.length) return { action: 'reissue', entries: aggregate(reissue) };

    const transfers = outputs.filter((o) => o.type === 'transfer');
    if (transfers.length === 0) return null; // e.g. an owner token moving alongside a sub-asset issue
    const toOthers = transfers.filter((o) => o.address !== walletAddress);
    return { action: 'send', entries: aggregate(toOthers.length ? toOthers : transfers) };
  }

  // rowType === 'receive': whatever the wallet received, regardless of the transaction's overall
  // purpose. Issue/reissue outputs paying the wallet are received amounts too.
  const received = outputs.filter(
    (o) =>
      o.address === walletAddress &&
      (o.type === 'transfer' || o.type === 'issue' || o.type === 'reissue' || o.type === 'owner'),
  );
  if (received.length) return { action: 'receive', entries: aggregate(received) };
  return null;
}

/**
 * Format an asset amount (integer units scaled by 10^8) as a trimmed decimal string, e.g.
 * 100000000 → "1", 550000000 → "5.5". Divisions don't need to be known here: trailing zeros are
 * dropped, which yields the same result the asset's divisions would.
 */
export function formatAssetQty(sats: bigint): string {
  const COIN = 100_000_000n;
  const neg = sats < 0n;
  const v = neg ? -sats : sats;
  const whole = v / COIN;
  const frac = (v % COIN).toString().padStart(8, '0').replace(/0+$/, '');
  const s = frac ? `${whole.toString()}.${frac}` : whole.toString();
  return neg ? `-${s}` : s;
}
