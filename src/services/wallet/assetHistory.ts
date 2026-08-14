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
    totals.set(o.name, (totals.get(o.name) ?? 0n) + (o.amount ?? 0n));
  }
  return order.map((name) => ({ name, amount: totals.get(name) ?? 0n }));
}

/**
 * Classify a transaction's asset movement from the wallet's perspective. `rowType` is the history
 * row's existing AVN-side classification (send/receive), which we use to pick the transfer direction
 * without having to fetch input ownership.
 *
 * Issuance and reissue are recognised by their output type. Transfers are attributed by address:
 * outputs paying the wallet are "received", outputs paying elsewhere are "sent" (change back to the
 * wallet is naturally excluded from the sent side). Owner-token-only movements produce no label.
 */
export function describeAssetTx(
  outputs: AssetScriptInfo[],
  walletAddress: string,
  rowType: 'send' | 'receive',
): AssetTxLabel | null {
  if (outputs.length === 0) return null;

  const issue = outputs.filter((o) => o.type === 'issue');
  if (issue.length) return { action: 'issue', entries: aggregate(issue) };

  const reissue = outputs.filter((o) => o.type === 'reissue');
  if (reissue.length) return { action: 'reissue', entries: aggregate(reissue) };

  const transfers = outputs.filter((o) => o.type === 'transfer');
  if (transfers.length === 0) return null; // e.g. an owner token moving alongside a sub-asset issue

  const toUs = transfers.filter((o) => o.address === walletAddress);
  const toOthers = transfers.filter((o) => o.address !== walletAddress);

  // Trust the row's own send/receive classification first; fall back to whichever side has outputs.
  if (rowType === 'receive' && toUs.length) return { action: 'receive', entries: aggregate(toUs) };
  if (toOthers.length) return { action: 'send', entries: aggregate(toOthers) };
  if (toUs.length) return { action: 'receive', entries: aggregate(toUs) };
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
