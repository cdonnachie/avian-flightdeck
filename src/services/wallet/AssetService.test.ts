import { describe, expect, it } from 'vitest';

import { formatAssetAmount } from './AssetService';

describe('formatAssetAmount', () => {
  // Asset amounts are always scaled by 10^8 (COIN); a quantity of 1 is on-chain 100000000.
  it('shows a whole quantity of a 0-division asset as an integer', () => {
    expect(formatAssetAmount(100_000_000, 0)).toBe('1'); // qty 1 — the reported bug
    expect(formatAssetAmount(1_500_000_000, 0)).toBe('15'); // qty 15
    expect(formatAssetAmount(100, 0)).toBe('0'); // sub-unit dust on a 0-division asset
  });

  it('shows `divisions` decimal places for a divisible asset', () => {
    expect(formatAssetAmount(100_000_000, 8)).toBe('1.00000000'); // qty 1, 8 divisions
    expect(formatAssetAmount(150_000_000, 8)).toBe('1.50000000'); // qty 1.5
    expect(formatAssetAmount(1, 8)).toBe('0.00000001'); // smallest unit at 8 divisions
    expect(formatAssetAmount(150_000_000, 2)).toBe('1.50'); // qty 1.5 shown to 2 places
    expect(formatAssetAmount(5_000_000, 3)).toBe('0.050'); // 0.05
  });

  it('formats a large (but JS-safe) quantity without float drift', () => {
    // 1,000,000 whole units at 8 divisions = 1e14 on-chain, under Number.MAX_SAFE_INTEGER.
    expect(formatAssetAmount(100_000_000_000_000, 8)).toBe('1000000.00000000');
  });

  it('clamps out-of-range divisions to 0..8', () => {
    expect(formatAssetAmount(100_000_000, 8)).toBe('1.00000000');
    expect(formatAssetAmount(100_000_000, -1)).toBe('1');
  });
});
