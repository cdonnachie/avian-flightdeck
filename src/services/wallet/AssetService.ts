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
 * Format an on-chain asset amount as a decimal string. Avian assets (Ravencoin model) store every
 * quantity scaled by 10^8 (COIN), exactly like AVN — a quantity of "1" is on-chain `100000000`.
 * `divisions` (0–8) only says how many of those decimal places are meaningful, so we always divide
 * by 10^8 and then show `divisions` decimals (0 → a whole number). BigInt keeps large supplies exact.
 */
export function formatAssetAmount(sats: number, divisions: number): string {
  const units = Math.min(Math.max(divisions | 0, 0), 8);
  const value = BigInt(Math.trunc(sats));
  const COIN = 100_000_000n; // asset amounts are scaled by 10^8, like AVN — not by 10^divisions
  const whole = value / COIN;
  if (units === 0) return whole.toString();
  const frac8 = (value % COIN).toString().padStart(8, '0');
  return `${whole.toString()}.${frac8.slice(0, units)}`;
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
