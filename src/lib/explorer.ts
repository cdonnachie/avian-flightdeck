/**
 * Block-explorer URL helpers.
 *
 * These are plain string/URL utilities with no crypto dependency. They live here rather than on
 * WalletService so a read-only view — transaction history, for instance — can link to the
 * explorer without importing the ~1.7 MB secp256k1 build that WalletService binds at load.
 */

const EXPLORER_BASE = 'https://flightpath.avn.network';

export function getExplorerUrl(txid: string): string {
  return `${EXPLORER_BASE}/tx/${txid}`;
}

export function openTransactionInExplorer(txid: string): void {
  window.open(getExplorerUrl(txid), '_blank', 'noopener,noreferrer');
}
