// Pure fee helpers, dependency-free so both WalletService (which builds transactions) and the UI
// (which previews the fee) can share one source of truth — the flat-fee drift across paths is
// exactly how the fee got wrong before.
//
// The miner fee scales with transaction size. We size a legacy P2PKH transaction (SegWit inputs are
// smaller, ~68 vB, so this errs slightly high — safe, it never underpays) and multiply by a
// per-vByte rate.

const TX_OVERHEAD_VBYTES = 10;
const INPUT_VBYTES = 148; // P2PKH input (upper bound; P2WPKH ≈ 68)
const OUTPUT_VBYTES = 34;

/** Approximate virtual size (bytes) of a transaction with the given input/output counts. */
export function estimateTxVBytes(numInputs: number, numOutputs: number): number {
  return TX_OVERHEAD_VBYTES + numInputs * INPUT_VBYTES + numOutputs * OUTPUT_VBYTES;
}

/** Total miner fee (satoshis, rounded up) for a transaction of this shape at `satPerVByte`. */
export function estimateTxFee(numInputs: number, numOutputs: number, satPerVByte: number): number {
  return Math.ceil(estimateTxVBytes(numInputs, numOutputs) * satPerVByte);
}

// Default fee rate. Avian Core's default send fee is 0.01025 AVN/kB and, because the network is
// low-volume, `estimatefee` is effectively unavailable — so match Core's default rather than the
// bare min-relay, so our transactions confirm like the reference wallet.
// 0.01025 AVN/kB = 1,025,000 sat / 1000 vByte = 1025 sat/vByte.
export const DEFAULT_FEE_RATE_SAT_PER_VBYTE = 1025;

// Change (or a recipient output) below this is dust the network rejects; callers fold it into the
// fee instead of emitting it. Matches UTXOSelectionService.DEFAULT_DUST_THRESHOLD.
export const DUST_THRESHOLD_SATS = 1000;
