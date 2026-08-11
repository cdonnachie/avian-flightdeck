import { describe, expect, it } from 'vitest';

import {
  CoinSelectionStrategy,
  EnhancedUTXO,
  UTXOSelectionService,
} from './UTXOSelectionService';
import { makeUTXO } from '@/test/helpers';

const FEE = 10_000;
const DUST = 1_000;

/** Confirmed, non-dust UTXOs of the given values, in the order supplied. */
const pool = (...values: number[]): EnhancedUTXO[] =>
  values.map((value, index) => makeUTXO({ value, vout: index, confirmations: 10 }));

const select = (utxos: EnhancedUTXO[], options: Parameters<typeof UTXOSelectionService.selectUTXOs>[1]) =>
  UTXOSelectionService.selectUTXOs(utxos, options);

const totalOf = (utxos: EnhancedUTXO[]) => utxos.reduce((sum, utxo) => sum + utxo.value, 0);

describe('filtering', () => {
  it('returns null when there is nothing to spend', () => {
    expect(select([], { targetAmount: 1000 })).toBeNull();
  });

  it('excludes dust by default and includes it on request', () => {
    const utxos = pool(500, 800); // both at or under the 1000 sat dust threshold

    expect(select(utxos, { targetAmount: 100, feeRate: 100 })).toBeNull();

    const withDust = select(utxos, {
      targetAmount: 100,
      feeRate: 100,
      includeDust: true,
      strategy: CoinSelectionStrategy.LARGEST_FIRST,
    });
    expect(withDust).not.toBeNull();
  });

  it('treats a UTXO exactly on the dust threshold as dust', () => {
    const utxos = pool(DUST);
    expect(select(utxos, { targetAmount: 1, feeRate: 1, dustThreshold: DUST })).toBeNull();
  });

  it('excludes unconfirmed UTXOs unless they are explicitly allowed', () => {
    const utxos = [makeUTXO({ value: 500_000, confirmations: 0 })];

    expect(select(utxos, { targetAmount: 100_000 })).toBeNull();

    const allowed = select(utxos, {
      targetAmount: 100_000,
      allowUnconfirmed: true,
      minConfirmations: 0,
    });
    expect(allowed?.selectedUTXOs).toHaveLength(1);
  });

  it('honours a minimum confirmation depth', () => {
    const utxos = [makeUTXO({ value: 500_000, confirmations: 3 })];

    expect(select(utxos, { targetAmount: 100_000, minConfirmations: 6 })).toBeNull();
    expect(select(utxos, { targetAmount: 100_000, minConfirmations: 3 })).not.toBeNull();
  });

  it('returns null when the balance cannot cover amount plus fee', () => {
    const utxos = pool(50_000);
    expect(
      select(utxos, {
        targetAmount: 45_000,
        feeRate: FEE,
        strategy: CoinSelectionStrategy.LARGEST_FIRST,
      }),
    ).toBeNull();
  });
});

describe('smallest first', () => {
  it('spends the smallest UTXOs it can, to keep change small', () => {
    const utxos = pool(10_000, 20_000, 500_000);

    const result = select(utxos, {
      targetAmount: 15_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.SMALLEST_FIRST,
    })!;

    expect(result.selectedUTXOs.map((utxo) => utxo.value)).toEqual([10_000, 20_000]);
    expect(result.strategyUsed).toBe(CoinSelectionStrategy.SMALLEST_FIRST);
  });

  it('accounts for the fee in what it must cover', () => {
    const utxos = pool(10_000, 20_000);

    const result = select(utxos, {
      targetAmount: 15_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.SMALLEST_FIRST,
    })!;

    expect(result.totalInput).toBe(30_000);
    expect(result.change).toBe(30_000 - 15_000 - FEE);
    expect(result.estimatedFee).toBe(FEE);
  });

  it('gives up rather than exceeding the input cap', () => {
    const utxos = pool(...Array(10).fill(5_000));

    const result = select(utxos, {
      targetAmount: 40_000,
      feeRate: FEE,
      maxInputs: 3,
      strategy: CoinSelectionStrategy.SMALLEST_FIRST,
    });

    expect(result).toBeNull();
  });
});

describe('largest first', () => {
  it('spends the fewest inputs it can', () => {
    const utxos = pool(10_000, 20_000, 500_000);

    const result = select(utxos, {
      targetAmount: 15_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.LARGEST_FIRST,
    })!;

    expect(result.selectedUTXOs).toHaveLength(1);
    expect(result.selectedUTXOs[0].value).toBe(500_000);
  });

  it('adds inputs in descending order until the target is met', () => {
    const utxos = pool(30_000, 40_000, 50_000);

    const result = select(utxos, {
      targetAmount: 80_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.LARGEST_FIRST,
    })!;

    expect(result.selectedUTXOs.map((utxo) => utxo.value)).toEqual([50_000, 40_000]);
  });
});

describe('best fit', () => {
  it('takes a single exact match with no change', () => {
    const utxos = pool(25_000, 110_000, 500_000);

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.BEST_FIT,
    })!;

    expect(result.selectedUTXOs).toHaveLength(1);
    expect(result.selectedUTXOs[0].value).toBe(110_000);
    expect(result.change).toBe(0);
    expect(result.efficiency).toBe(1);
  });

  it('takes a two-input exact match when no single UTXO fits', () => {
    const utxos = pool(60_000, 50_000, 900_000);

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.BEST_FIT,
    })!;

    expect(totalOf(result.selectedUTXOs)).toBe(110_000);
    expect(result.change).toBe(0);
  });

  it('minimises change when no exact match exists', () => {
    const utxos = pool(115_000, 400_000, 900_000);

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.BEST_FIT,
    })!;

    expect(result.selectedUTXOs[0].value).toBe(115_000);
    expect(result.change).toBe(5_000);
  });

  it('is the default strategy', () => {
    const utxos = pool(110_000, 900_000);
    const result = select(utxos, { targetAmount: 100_000, feeRate: FEE })!;
    expect(result.strategyUsed).toBe(CoinSelectionStrategy.BEST_FIT);
  });

  it('falls back to a workable selection when no combination is tidy', () => {
    const utxos = pool(...Array(8).fill(20_000));

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.BEST_FIT,
    })!;

    expect(totalOf(result.selectedUTXOs)).toBeGreaterThanOrEqual(110_000);
  });
});

describe('dust consolidation', () => {
  const withDust = (...dustValues: number[]) => [
    ...pool(200_000),
    ...dustValues.map((value) => makeUTXO({ value, confirmations: 10 })),
  ];

  it('sweeps dust in alongside the amount being sent', () => {
    // Dust is only swept when it is worth more than the marginal fee of an extra input,
    // which the strategy estimates as 10% of the fee rate.
    const utxos = withDust(900, 800);

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: 5_000, // marginal cost 500, so 900 and 800 are both worth sweeping
      includeDust: true,
      strategy: CoinSelectionStrategy.CONSOLIDATE_DUST,
    })!;

    expect(result.selectedUTXOs).toHaveLength(3);
    expect(result.selectedUTXOs.some((utxo) => utxo.value === 900)).toBe(true);
    expect(result.selectedUTXOs.some((utxo) => utxo.value === 800)).toBe(true);
    expect(result.strategyUsed).toBe(CoinSelectionStrategy.CONSOLIDATE_DUST);
  });

  it('leaves dust worth less than the marginal fee alone', () => {
    const utxos = withDust(400);

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: 5_000, // marginal cost 500, so 400 is not worth spending
      includeDust: true,
      strategy: CoinSelectionStrategy.CONSOLIDATE_DUST,
    })!;

    expect(result.selectedUTXOs.some((utxo) => utxo.value === 400)).toBe(false);
  });

  it('sweeps nothing at the default fee rate, because the two thresholds cancel out', () => {
    // DEFECT, pinned deliberately. Dust is `value <= dustThreshold` (1000 by default) while the
    // sweep gate is `value > feeRate * 0.1` (also 1000 at the default fee rate of 10000). The
    // conditions are exactly complementary, so at default settings CONSOLIDATE_DUST degrades to
    // an ordinary largest-first selection and never consolidates anything. Change this test
    // together with the fix — do not "correct" it on its own.
    const utxos = withDust(900, 800, 1_000);

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: FEE,
      includeDust: true,
      strategy: CoinSelectionStrategy.CONSOLIDATE_DUST,
    })!;

    expect(result.selectedUTXOs).toHaveLength(1);
    expect(result.selectedUTXOs[0].value).toBe(200_000);
  });

  it('returns null when even the dust cannot cover the target', () => {
    const utxos = [makeUTXO({ value: 900, confirmations: 10 })];

    expect(
      select(utxos, {
        targetAmount: 100_000,
        feeRate: FEE,
        includeDust: true,
        strategy: CoinSelectionStrategy.CONSOLIDATE_DUST,
      }),
    ).toBeNull();
  });
});

describe('privacy focused', () => {
  it('spreads the spend across several inputs', () => {
    const utxos = pool(100_000, 90_000, 80_000, 70_000, 60_000, 50_000, 40_000, 30_000);

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.PRIVACY_FOCUSED,
    })!;

    expect(result.selectedUTXOs.length).toBeGreaterThanOrEqual(3);
    expect(result.strategyUsed).toBe(CoinSelectionStrategy.PRIVACY_FOCUSED);
  });

  it('never exceeds the input cap', () => {
    const utxos = pool(...Array(30).fill(50_000));

    const result = select(utxos, {
      targetAmount: 200_000,
      feeRate: FEE,
      maxInputs: 5,
      strategy: CoinSelectionStrategy.PRIVACY_FOCUSED,
    })!;

    expect(result.selectedUTXOs.length).toBeLessThanOrEqual(5);
  });

  it('gives up rather than breaching the cap to reach the target', () => {
    const utxos = pool(...Array(30).fill(50_000));

    // 5 inputs of 50_000 cannot cover 400_000 plus fee, and the cap wins.
    expect(
      select(utxos, {
        targetAmount: 400_000,
        feeRate: FEE,
        maxInputs: 5,
        strategy: CoinSelectionStrategy.PRIVACY_FOCUSED,
      }),
    ).toBeNull();
  });

  it('never selects the same UTXO twice', () => {
    const utxos = pool(100_000, 90_000, 80_000, 70_000, 60_000);

    const result = select(utxos, {
      targetAmount: 250_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.PRIVACY_FOCUSED,
    })!;

    const keys = result.selectedUTXOs.map((utxo) => `${utxo.txid}:${utxo.vout}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('manual selection', () => {
  it('uses exactly what the user picked', () => {
    const utxos = pool(200_000, 300_000, 400_000);
    const chosen = [utxos[0], utxos[2]];

    const result = select(utxos, {
      targetAmount: 100_000,
      feeRate: FEE,
      strategy: CoinSelectionStrategy.MANUAL,
      manualSelection: chosen,
    })!;

    expect(result.selectedUTXOs).toEqual(chosen);
    expect(result.totalInput).toBe(600_000);
    expect(result.change).toBe(600_000 - 100_000 - FEE);
    expect(result.strategyUsed).toBe(CoinSelectionStrategy.MANUAL);
  });

  it('refuses a manual selection that does not cover amount plus fee', () => {
    const utxos = pool(50_000);

    expect(
      select(utxos, {
        targetAmount: 100_000,
        feeRate: FEE,
        strategy: CoinSelectionStrategy.MANUAL,
        manualSelection: utxos,
      }),
    ).toBeNull();
  });

  it('honours a manual pick of dust, which the automatic strategies would skip', () => {
    const dust = [makeUTXO({ value: 900, confirmations: 10 })];
    const utxos = [...pool(500_000), ...dust];

    const result = select(utxos, {
      targetAmount: 100,
      feeRate: 100,
      includeDust: true,
      strategy: CoinSelectionStrategy.MANUAL,
      manualSelection: dust,
    })!;

    expect(result.selectedUTXOs).toEqual(dust);
  });
});

describe('result invariants', () => {
  const strategies = [
    CoinSelectionStrategy.SMALLEST_FIRST,
    CoinSelectionStrategy.LARGEST_FIRST,
    CoinSelectionStrategy.BEST_FIT,
    CoinSelectionStrategy.PRIVACY_FOCUSED,
  ];

  it.each(strategies)('%s covers the spend and reports a consistent total', (strategy) => {
    const utxos = pool(30_000, 70_000, 120_000, 250_000, 500_000);
    const targetAmount = 200_000;

    const result = select(utxos, { targetAmount, feeRate: FEE, strategy })!;

    expect(result).not.toBeNull();
    expect(result.totalInput).toBe(totalOf(result.selectedUTXOs));
    expect(result.totalInput).toBeGreaterThanOrEqual(targetAmount + FEE);
    expect(result.change).toBeGreaterThanOrEqual(0);
    expect(result.totalInput - result.change).toBe(targetAmount + FEE);
    expect(UTXOSelectionService.validateSelection(result, targetAmount)).toBe(true);
  });

  it.each(strategies)('%s only ever returns UTXOs it was given', (strategy) => {
    const utxos = pool(30_000, 70_000, 120_000, 250_000, 500_000);
    const available = new Set(utxos.map((utxo) => `${utxo.txid}:${utxo.vout}`));

    const result = select(utxos, { targetAmount: 200_000, feeRate: FEE, strategy })!;

    // Selection returns enriched copies rather than the original objects, so compare by outpoint.
    for (const selected of result.selectedUTXOs) {
      expect(available.has(`${selected.txid}:${selected.vout}`)).toBe(true);
    }
  });

  it.each(strategies)('%s never selects the same outpoint twice', (strategy) => {
    const utxos = pool(30_000, 70_000, 120_000, 250_000, 500_000);

    const result = select(utxos, { targetAmount: 200_000, feeRate: FEE, strategy })!;

    const outpoints = result.selectedUTXOs.map((utxo) => `${utxo.txid}:${utxo.vout}`);
    expect(new Set(outpoints).size).toBe(outpoints.length);
  });
});

describe('validateSelection', () => {
  it('accepts a coherent result', () => {
    const utxos = pool(500_000);
    const result = select(utxos, { targetAmount: 100_000, feeRate: FEE })!;

    expect(UTXOSelectionService.validateSelection(result, 100_000)).toBe(true);
  });

  it('rejects a result whose totalInput disagrees with its inputs', () => {
    const utxos = pool(500_000);
    const result = select(utxos, { targetAmount: 100_000, feeRate: FEE })!;

    expect(
      UTXOSelectionService.validateSelection({ ...result, totalInput: result.totalInput + 1 }, 100_000),
    ).toBe(false);
  });

  it('rejects a result that does not cover the target plus its own fee', () => {
    const utxos = pool(500_000);
    const result = select(utxos, { targetAmount: 100_000, feeRate: FEE })!;

    expect(UTXOSelectionService.validateSelection(result, 10_000_000)).toBe(false);
  });
});

describe('getRecommendedStrategy', () => {
  const utxos = pool(100_000, 200_000, 300_000);

  it('recommends dust consolidation, and a self-send, when dust has piled up', () => {
    const dusty = Array.from({ length: 6 }, () =>
      makeUTXO({ value: 500, confirmations: 10, isDust: true }),
    );

    const recommendation = UTXOSelectionService.getRecommendedStrategy(10_000, dusty, {
      consolidateDust: true,
    });

    expect(recommendation.strategy).toBe(CoinSelectionStrategy.CONSOLIDATE_DUST);
    expect(recommendation.recommendSelfAddress).toBe(true);
  });

  it('does not recommend consolidation for a handful of dust', () => {
    const barelyDusty = Array.from({ length: 2 }, () =>
      makeUTXO({ value: 500, confirmations: 10, isDust: true }),
    );

    expect(
      UTXOSelectionService.getRecommendedStrategy(10_000, barelyDusty, { consolidateDust: true })
        .strategy,
    ).not.toBe(CoinSelectionStrategy.CONSOLIDATE_DUST);
  });

  it('honours an explicit privacy preference', () => {
    expect(
      UTXOSelectionService.getRecommendedStrategy(10_000, utxos, { prioritizePrivacy: true })
        .strategy,
    ).toBe(CoinSelectionStrategy.PRIVACY_FOCUSED);
  });

  it('prefers smallest-first when fees matter or the spend is nearly the whole balance', () => {
    expect(
      UTXOSelectionService.getRecommendedStrategy(10_000, utxos, { prioritizeFees: true }).strategy,
    ).toBe(CoinSelectionStrategy.SMALLEST_FIRST);

    // 550_000 of a 600_000 balance is over the 80% threshold.
    expect(UTXOSelectionService.getRecommendedStrategy(550_000, utxos).strategy).toBe(
      CoinSelectionStrategy.SMALLEST_FIRST,
    );
  });

  it('defaults to best fit for an ordinary payment', () => {
    expect(UTXOSelectionService.getRecommendedStrategy(50_000, utxos).strategy).toBe(
      CoinSelectionStrategy.BEST_FIT,
    );
  });
});
