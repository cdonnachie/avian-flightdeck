// Runtime feature gates.

/**
 * Asset ISSUANCE (create + reissue) kill-switch. OFF by default while an Avian network consensus
 * issue is resolved: a unique-asset issuance that also creates a `NAME#unique!` owner token is
 * accepted by Core 5.0.x but rejected by 4.2.0, which split the chain. Until Core is patched, the
 * network reunified, and the issuance builders corrected, the wallet must not build any new
 * issuance/reissue transactions. Sending existing assets is unaffected.
 *
 * Read via a function so it is evaluated per call: `process.env.NEXT_PUBLIC_*` is inlined into the
 * browser bundle at build time (so production is off unless the flag is set), while tests can toggle
 * it at runtime. Re-enable by building with `NEXT_PUBLIC_ASSET_ISSUANCE=on` once it is safe.
 */
export function isAssetIssuanceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ASSET_ISSUANCE === 'on';
}

/** User-facing explanation shown where issuance controls used to be. */
export const ASSET_ISSUANCE_PAUSED_MESSAGE =
  'Asset creation and reissue are temporarily paused while an Avian network issue is resolved. Sending existing assets is unaffected.';
