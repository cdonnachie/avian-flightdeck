import { describe, expect, it } from 'vitest';

import { formatAssetAmount } from './AssetService';

describe('formatAssetAmount', () => {
  it('shows a 0-division asset as a whole number', () => {
    expect(formatAssetAmount(1, 0)).toBe('1');
    expect(formatAssetAmount(1500, 0)).toBe('1500');
  });

  it('scales by divisions and pads the fraction to full width', () => {
    // 100000000 sats at 8 divisions = 1.00000000
    expect(formatAssetAmount(100_000_000, 8)).toBe('1.00000000');
    // 150000000 at 8 = 1.50000000
    expect(formatAssetAmount(150_000_000, 8)).toBe('1.50000000');
    // 1 sat at 8 divisions = 0.00000001
    expect(formatAssetAmount(1, 8)).toBe('0.00000001');
  });

  it('handles other division counts', () => {
    expect(formatAssetAmount(12345, 2)).toBe('123.45');
    expect(formatAssetAmount(5, 3)).toBe('0.005');
    expect(formatAssetAmount(1000, 3)).toBe('1.000');
  });

  it('formats a large (but JS-safe) amount without float drift', () => {
    // 1,000,000 whole units at 8 divisions = 1e14 sats, well under Number.MAX_SAFE_INTEGER.
    expect(formatAssetAmount(100_000_000_000_000, 8)).toBe('1000000.00000000');
  });

  it('clamps out-of-range divisions to 0..8', () => {
    expect(formatAssetAmount(100_000_000, 8)).toBe('1.00000000');
    expect(formatAssetAmount(5, -1)).toBe('5');
  });
});
