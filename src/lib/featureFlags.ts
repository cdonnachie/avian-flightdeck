// Runtime feature gates.

/**
 * Asset ISSUANCE (create + reissue) switch. ON by default; build with
 * `NEXT_PUBLIC_ASSET_ISSUANCE=off` to disable it.
 *
 * This began as a kill-switch during the network consensus incident: a unique-asset issuance that
 * also created a `NAME#unique!` owner token was accepted by Core 5.0.0–5.0.2 but rejected by 4.2.0,
 * which split the chain. That is resolved — the builders no longer emit an owner token for uniques
 * (see WalletService.issueChildAsset), a shape every Core version accepts, and the network has
 * reunified on 5.0.3. The switch is kept as an emergency lever rather than removed.
 *
 * Read via a function so it is evaluated per call: `process.env.NEXT_PUBLIC_*` is inlined into the
 * browser bundle at build time, while tests can toggle it at runtime.
 */
export function isAssetIssuanceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ASSET_ISSUANCE !== 'off';
}

/** User-facing explanation shown where issuance controls would otherwise be. */
export const ASSET_ISSUANCE_DISABLED_MESSAGE =
  'Asset creation and reissue are disabled in this build. Sending existing assets is unaffected.';
