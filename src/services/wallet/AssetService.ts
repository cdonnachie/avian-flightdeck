// Avian asset reads: compose held-asset balances with their metadata into a display-ready list.
// Assets are Ravencoin-style: an integer amount scaled by the asset's `divisions` (0–8). All the
// formatting lives here so the UI never does raw scaling. Sending assets is a separate, higher-risk
// concern (see docs/proposals/avian-assets.md) and is not in this module.

import type { ElectrumService, AssetMeta } from '@/services/core/ElectrumService';

export interface HeldAsset {
  name: string;
  /** Confirmed + unconfirmed, formatted with the asset's divisions. */
  amount: string;
  confirmedSats: number;
  unconfirmedSats: number;
  divisions: number;
  meta: AssetMeta | null;
}

/**
 * Format an integer asset amount (scaled by `10^divisions`) as a decimal string. A 0-division asset
 * is whole-number only; otherwise the fractional part is shown to the full `divisions` width, the
 * way Core displays asset quantities. Uses BigInt so large supplies never lose precision.
 */
export function formatAssetAmount(sats: number, divisions: number): string {
  const units = Math.min(Math.max(divisions | 0, 0), 8);
  const value = BigInt(Math.trunc(sats));
  if (units === 0) return value.toString();
  const divisor = 10n ** BigInt(units);
  const whole = value / divisor;
  const frac = (value % divisor).toString().padStart(units, '0');
  return `${whole.toString()}.${frac}`;
}

/**
 * Every asset held at `address`, sorted by name, each with its metadata (divisions, reissuable,
 * IPFS) and a formatted quantity. The base coin (AVN) is excluded — it is the ordinary balance.
 */
export async function getHeldAssets(electrum: ElectrumService, address: string): Promise<HeldAsset[]> {
  const balances = await electrum.getAssetBalances(address);
  const names = Object.keys(balances).sort((a, b) => a.localeCompare(b));

  const metas = await Promise.all(names.map((name) => electrum.getAssetMeta(name)));

  return names.map((name, i) => {
    const meta = metas[i];
    const divisions = meta?.divisions ?? 0;
    const { confirmed, unconfirmed } = balances[name];
    return {
      name,
      confirmedSats: confirmed,
      unconfirmedSats: unconfirmed,
      divisions,
      meta,
      amount: formatAssetAmount(confirmed + unconfirmed, divisions),
    };
  });
}
