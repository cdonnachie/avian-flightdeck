import { describe, expect, it } from 'vitest';

import {
  estimateTxVBytes,
  estimateTxFee,
  DEFAULT_FEE_RATE_SAT_PER_VBYTE,
  DUST_THRESHOLD_SATS,
} from './fees';

describe('fee model', () => {
  it('sizes a legacy transaction as overhead + inputs*148 + outputs*34', () => {
    expect(estimateTxVBytes(1, 2)).toBe(10 + 148 + 68); // 226
    expect(estimateTxVBytes(3, 2)).toBe(10 + 3 * 148 + 68);
  });

  it('scales the fee with size at the given rate, rounded up', () => {
    expect(estimateTxFee(1, 2, 1)).toBe(226);
    expect(estimateTxFee(1, 2, 1025)).toBe(226 * 1025);
    expect(estimateTxFee(3, 2, 1)).toBeGreaterThan(estimateTxFee(1, 2, 1));
    // rounds up
    expect(estimateTxFee(1, 2, 1.5)).toBe(Math.ceil(226 * 1.5));
  });

  it("defaults to Avian Core's send fee (0.01025 AVN/kB = 1025 sat/vByte)", () => {
    expect(DEFAULT_FEE_RATE_SAT_PER_VBYTE).toBe(1025);
    expect((DEFAULT_FEE_RATE_SAT_PER_VBYTE * 1000) / 100_000_000).toBeCloseTo(0.01025, 8);
  });

  it('uses a 1000-sat dust threshold', () => {
    expect(DUST_THRESHOLD_SATS).toBe(1000);
  });
});
