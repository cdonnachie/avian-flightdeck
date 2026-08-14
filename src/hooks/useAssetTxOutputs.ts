'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { decodeAssetOutputs } from '@/services/wallet/assetHistory';
import type { AssetScriptInfo } from '@/services/wallet/assetScript';

/**
 * Lazily decode the asset outputs of the given transactions (typically the visible history page).
 *
 * The transaction history stores only the AVN side, so the asset side is re-derived on demand from
 * each transaction's raw hex. Results are cached by txid across pages and fetched with modest
 * concurrency; labels appear progressively as batches resolve. A transaction with no asset outputs
 * caches as an empty array so it is never re-fetched.
 *
 * Returns a Map of txid → decoded asset outputs (undefined for a txid that hasn't loaded yet).
 */
export function useAssetTxOutputs(txids: string[]): Map<string, AssetScriptInfo[]> {
  const { electrum, address } = useWallet();
  const cache = useRef<Map<string, AssetScriptInfo[]>>(new Map());
  const inflight = useRef<Set<string>>(new Set());
  // Bump to re-render the consumer as cached results fill in; the Map reference stays stable.
  const [, bump] = useState(0);

  const key = txids.join(',');

  useEffect(() => {
    if (!electrum || !address) return;
    // Refs are stable for the component's lifetime; capture them so the cleanup closure is clearly
    // operating on the same instances the effect used.
    const cacheMap = cache.current;
    const inflightSet = inflight.current;

    const toFetch = txids.filter((id) => id && !cacheMap.has(id) && !inflightSet.has(id));
    if (toFetch.length === 0) return;

    let cancelled = false;
    toFetch.forEach((id) => inflightSet.add(id));

    (async () => {
      const CONCURRENCY = 6;
      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        if (cancelled) break;
        const batch = toFetch.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (id) => {
            try {
              const hex: string = await electrum.getTransaction(id, false);
              return [id, decodeAssetOutputs(hex)] as const;
            } catch {
              // A fetch/parse failure caches as "no assets" so the row degrades to a plain AVN entry
              // rather than retrying forever.
              return [id, [] as AssetScriptInfo[]] as const;
            }
          }),
        );
        for (const [id, outs] of results) {
          cacheMap.set(id, outs);
          inflightSet.delete(id);
        }
        if (!cancelled) bump((v) => v + 1);
      }
    })();

    return () => {
      cancelled = true;
      // Release any not-yet-fetched ids so a later render can pick them up again.
      toFetch.forEach((id) => {
        if (!cacheMap.has(id)) inflightSet.delete(id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, electrum, address]);

  return cache.current;
}
