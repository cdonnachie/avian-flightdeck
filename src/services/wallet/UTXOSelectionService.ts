/**
 * UTXO Selection Service
 *
 * Provides intelligent UTXO selection algorithms for optimal transaction building.
 * Supports multiple selection strategies for different use cases:
 * - Fee optimization
 * - Privacy enhancement
 * - Dust consolidation
 * - Manual selection
 */

export interface EnhancedUTXO {
  txid: string;
  vout: number;
  value: number;
  height?: number;
  confirmations?: number;
  isConfirmed?: boolean;
  ageInBlocks?: number;
  isDust?: boolean;
  scriptPubKey?: string;
  address?: string;
}

export interface UTXOSelectionResult {
  selectedUTXOs: EnhancedUTXO[];
  totalInput: number;
  change: number;
  estimatedFee: number;
  strategyUsed: CoinSelectionStrategy;
  efficiency: number; // Ratio of output to input
}

export enum CoinSelectionStrategy {
  SMALLEST_FIRST = 'smallest_first', // Minimize transaction size and fees
  LARGEST_FIRST = 'largest_first', // Privacy-focused, fewer inputs
  BEST_FIT = 'best_fit', // Find UTXOs that closely match target amount
  CONSOLIDATE_DUST = 'consolidate_dust', // Include dust UTXOs for cleanup
  PRIVACY_FOCUSED = 'privacy_focused', // Multiple UTXOs for transaction privacy
  MANUAL = 'manual', // User-selected UTXOs
}

export interface UTXOSelectionOptions {
  strategy?: CoinSelectionStrategy;
  targetAmount: number;
  feeRate?: number;
  includeDust?: boolean;
  maxInputs?: number;
  minConfirmations?: number;
  manualSelection?: EnhancedUTXO[];
  allowUnconfirmed?: boolean;
  dustThreshold?: number;
  isAutoConsolidation?: boolean;
  selfAddress?: string; // The wallet's own address for auto consolidation
}

export class UTXOSelectionService {
  private static readonly DEFAULT_FEE_RATE = 10000; // 0.0001 AVN in satoshis
  private static readonly DEFAULT_DUST_THRESHOLD = 1000; // 0.00001 AVN in satoshis
  private static readonly DEFAULT_MAX_INPUTS = 20;
  private static readonly DEFAULT_MIN_CONFIRMATIONS = 6;

  /**
   * Select optimal UTXOs for a transaction
   */
  static selectUTXOs(
    availableUTXOs: EnhancedUTXO[],
    options: UTXOSelectionOptions,
  ): UTXOSelectionResult | null {
    const {
      strategy = CoinSelectionStrategy.BEST_FIT,
      targetAmount,
      feeRate = this.DEFAULT_FEE_RATE,
      includeDust = false,
      maxInputs = this.DEFAULT_MAX_INPUTS,
      minConfirmations = this.DEFAULT_MIN_CONFIRMATIONS,
      manualSelection,
      allowUnconfirmed = false,
      dustThreshold = this.DEFAULT_DUST_THRESHOLD,
      isAutoConsolidation = false,
      selfAddress,
    } = options;

    // Enhance UTXOs with additional metadata
    const enhancedUTXOs = this.enhanceUTXOs(availableUTXOs, dustThreshold, minConfirmations);

    // Filter UTXOs based on options
    let filteredUTXOs = this.filterUTXOs(enhancedUTXOs, {
      includeDust,
      minConfirmations,
      allowUnconfirmed,
    });

    if (filteredUTXOs.length === 0) {
      return null;
    }

    // Handle manual selection
    if (strategy === CoinSelectionStrategy.MANUAL && manualSelection) {
      return this.processManualSelection(manualSelection, targetAmount, feeRate);
    }

    // Apply selection strategy
    let result: UTXOSelectionResult | null = null;

    switch (strategy) {
      case CoinSelectionStrategy.SMALLEST_FIRST:
        result = this.selectSmallestFirst(filteredUTXOs, targetAmount, feeRate, maxInputs);
        break;

      case CoinSelectionStrategy.LARGEST_FIRST:
        result = this.selectLargestFirst(filteredUTXOs, targetAmount, feeRate, maxInputs);
        break;

      case CoinSelectionStrategy.BEST_FIT:
        result = this.selectBestFit(filteredUTXOs, targetAmount, feeRate, maxInputs);
        break;

      case CoinSelectionStrategy.CONSOLIDATE_DUST:
        result = this.selectConsolidateDust(filteredUTXOs, targetAmount, feeRate, maxInputs);
        break;

      case CoinSelectionStrategy.PRIVACY_FOCUSED:
        result = this.selectPrivacyFocused(filteredUTXOs, targetAmount, feeRate, maxInputs);
        break;

      default:
        result = this.selectBestFit(filteredUTXOs, targetAmount, feeRate, maxInputs);
    }

    return result;
  }

  /**
   * Enhance UTXOs with computed metadata
   */
  private static enhanceUTXOs(
    utxos: EnhancedUTXO[],
    dustThreshold: number,
    minConfirmations: number,
  ): EnhancedUTXO[] {
    return utxos.map((utxo) => ({
      ...utxo,
      isDust: utxo.value <= dustThreshold,
      isConfirmed: (utxo.confirmations || 0) >= minConfirmations,
      ageInBlocks: utxo.confirmations || 0,
    }));
  }

  /**
   * Filter UTXOs based on selection criteria
   */
  private static filterUTXOs(
    utxos: EnhancedUTXO[],
    options: {
      includeDust: boolean;
      minConfirmations: number;
      allowUnconfirmed: boolean;
    },
  ): EnhancedUTXO[] {
    return utxos.filter((utxo) => {
      // Filter dust unless specifically included
      if (!options.includeDust && utxo.isDust) {
        return false;
      }

      // Filter by confirmations
      const confirmations = utxo.confirmations || 0;
      if (!options.allowUnconfirmed && confirmations === 0) {
        return false;
      }

      if (confirmations < options.minConfirmations) {
        return false;
      }

      return true;
    });
  }

  /**
   * Smallest First: Select smallest UTXOs first to minimize transaction size
   * Good for regular payments where fee minimization is priority
   */
  private static selectSmallestFirst(
    utxos: EnhancedUTXO[],
    targetAmount: number,
    feeRate: number,
    maxInputs: number,
  ): UTXOSelectionResult | null {
    const sorted = [...utxos].sort((a, b) => a.value - b.value);
    return this.greedySelection(
      sorted,
      targetAmount,
      feeRate,
      maxInputs,
      CoinSelectionStrategy.SMALLEST_FIRST,
    );
  }

  /**
   * Largest First: Select largest UTXOs first for privacy and fewer inputs
   * Good when you want to minimize the number of inputs for privacy
   */
  private static selectLargestFirst(
    utxos: EnhancedUTXO[],
    targetAmount: number,
    feeRate: number,
    maxInputs: number,
  ): UTXOSelectionResult | null {
    const sorted = [...utxos].sort((a, b) => b.value - a.value);
    return this.greedySelection(
      sorted,
      targetAmount,
      feeRate,
      maxInputs,
      CoinSelectionStrategy.LARGEST_FIRST,
    );
  }

  /**
   * Best Fit: Find the optimal combination that minimizes change
   * Uses a branch and bound approach for better efficiency
   */
  private static selectBestFit(
    utxos: EnhancedUTXO[],
    targetAmount: number,
    feeRate: number,
    maxInputs: number,
  ): UTXOSelectionResult | null {
    const totalRequired = targetAmount + feeRate;

    // First try to find exact match or close fit
    const exactMatch = this.findExactMatch(utxos, totalRequired);
    if (exactMatch) {
      return exactMatch;
    }

    // Try combinations with low change
    const bestFit = this.findBestFitCombination(utxos, totalRequired, maxInputs);
    if (bestFit) {
      return bestFit;
    }

    // Fallback to smallest first
    return this.selectSmallestFirst(utxos, targetAmount, feeRate, maxInputs);
  }

  /**
   * Consolidate Dust: Include dust UTXOs to clean up the wallet
   * Good for maintenance transactions
   */
  private static selectConsolidateDust(
    utxos: EnhancedUTXO[],
    targetAmount: number,
    feeRate: number,
    maxInputs: number,
  ): UTXOSelectionResult | null {
    // Start with largest UTXOs for the main amount
    const nonDust = utxos.filter((utxo) => !utxo.isDust).sort((a, b) => b.value - a.value);
    const dust = utxos.filter((utxo) => utxo.isDust).sort((a, b) => b.value - a.value);

    const selected: EnhancedUTXO[] = [];
    let totalInput = 0;
    let remainingInputs = maxInputs;

    // First select enough non-dust to cover the target
    for (const utxo of nonDust) {
      if (totalInput >= targetAmount + feeRate || remainingInputs <= 0) break;
      selected.push(utxo);
      totalInput += utxo.value;
      remainingInputs--;
    }

    // Then sweep up the dust, which is the entire point of this strategy.
    //
    // This used to be gated on `utxo.value > feeRate * 0.1`, meant as the marginal fee cost of
    // one more input. That gate never let anything through: dust is `value <= dustThreshold`
    // (1000 by default) and the gate came to exactly 1000 at the default fee rate, so the two
    // conditions were complementary and the strategy silently degraded to largest-first.
    //
    // It was also modelling a cost that is not charged. `change` below is
    // `totalInput - targetAmount - feeRate`, a flat fee that does not grow with the number of
    // inputs, so an extra input costs the user nothing. Consolidation is opt-in, and maxInputs
    // still bounds how large the transaction can get.
    //
    // If a size-based fee model is ever introduced, this is the place to reinstate a real
    // per-input cost — and the test in UTXOSelectionService.test.ts should move with it.
    for (const utxo of dust) {
      if (remainingInputs <= 0) break;
      if (utxo.value <= 0) continue;

      selected.push(utxo);
      totalInput += utxo.value;
      remainingInputs--;
    }

    if (totalInput < targetAmount + feeRate) {
      return null;
    }

    return {
      selectedUTXOs: selected,
      totalInput,
      change: totalInput - targetAmount - feeRate,
      estimatedFee: feeRate,
      strategyUsed: CoinSelectionStrategy.CONSOLIDATE_DUST,
      efficiency: targetAmount / totalInput,
    };
  }

  /**
   * Privacy Focused: Use multiple inputs for transaction graph privacy
   * Good when privacy is more important than fees
   */
  private static selectPrivacyFocused(
    utxos: EnhancedUTXO[],
    targetAmount: number,
    feeRate: number,
    maxInputs: number,
  ): UTXOSelectionResult | null {
    // Try to use 3-5 inputs of varying sizes for privacy
    const targetInputCount = Math.min(Math.max(3, Math.ceil(utxos.length / 4)), maxInputs, 5);

    // Sort by value and select a diverse set
    const sorted = [...utxos].sort((a, b) => b.value - a.value);
    const selected: EnhancedUTXO[] = [];
    let totalInput = 0;

    // Select UTXOs at different value tiers
    const step = Math.max(1, Math.floor(sorted.length / targetInputCount));

    for (let i = 0; i < sorted.length && selected.length < targetInputCount; i += step) {
      if (totalInput >= targetAmount + feeRate && selected.length >= 3) {
        break;
      }
      selected.push(sorted[i]);
      totalInput += sorted[i].value;
    }

    // If we don't have enough, add more from the remaining
    if (totalInput < targetAmount + feeRate) {
      for (const utxo of sorted) {
        if (selected.includes(utxo)) continue;
        if (selected.length >= maxInputs) break;

        selected.push(utxo);
        totalInput += utxo.value;

        if (totalInput >= targetAmount + feeRate) break;
      }
    }

    if (totalInput < targetAmount + feeRate) {
      return null;
    }

    return {
      selectedUTXOs: selected,
      totalInput,
      change: totalInput - targetAmount - feeRate,
      estimatedFee: feeRate,
      strategyUsed: CoinSelectionStrategy.PRIVACY_FOCUSED,
      efficiency: targetAmount / totalInput,
    };
  }

  /**
   * Process manual UTXO selection
   */
  private static processManualSelection(
    selectedUTXOs: EnhancedUTXO[],
    targetAmount: number,
    feeRate: number,
  ): UTXOSelectionResult | null {
    const totalInput = selectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);

    if (totalInput < targetAmount + feeRate) {
      return null;
    }

    return {
      selectedUTXOs,
      totalInput,
      change: totalInput - targetAmount - feeRate,
      estimatedFee: feeRate,
      strategyUsed: CoinSelectionStrategy.MANUAL,
      efficiency: targetAmount / totalInput,
    };
  }

  /**
   * Greedy selection algorithm (shared by smallest/largest first)
   */
  private static greedySelection(
    sortedUTXOs: EnhancedUTXO[],
    targetAmount: number,
    feeRate: number,
    maxInputs: number,
    strategy: CoinSelectionStrategy,
  ): UTXOSelectionResult | null {
    let totalInput = 0;
    const selected: EnhancedUTXO[] = [];
    const totalRequired = targetAmount + feeRate;

    for (const utxo of sortedUTXOs) {
      if (totalInput >= totalRequired || selected.length >= maxInputs) break;

      selected.push(utxo);
      totalInput += utxo.value;
    }

    if (totalInput < totalRequired) {
      return null;
    }

    return {
      selectedUTXOs: selected,
      totalInput,
      change: totalInput - totalRequired,
      estimatedFee: feeRate,
      strategyUsed: strategy,
      efficiency: targetAmount / totalInput,
    };
  }

  /**
   * Find exact match for the target amount
   */
  private static findExactMatch(
    utxos: EnhancedUTXO[],
    totalRequired: number,
  ): UTXOSelectionResult | null {
    // Try single UTXO exact match
    for (const utxo of utxos) {
      if (utxo.value === totalRequired) {
        return {
          selectedUTXOs: [utxo],
          totalInput: utxo.value,
          change: 0,
          estimatedFee: totalRequired - utxo.value,
          strategyUsed: CoinSelectionStrategy.BEST_FIT,
          efficiency: 1.0,
        };
      }
    }

    // Try two-UTXO combinations for exact match
    for (let i = 0; i < utxos.length; i++) {
      for (let j = i + 1; j < utxos.length; j++) {
        const sum = utxos[i].value + utxos[j].value;
        if (sum === totalRequired) {
          return {
            selectedUTXOs: [utxos[i], utxos[j]],
            totalInput: sum,
            change: 0,
            estimatedFee: totalRequired - sum,
            strategyUsed: CoinSelectionStrategy.BEST_FIT,
            efficiency: 1.0,
          };
        }
      }
    }

    return null;
  }

  /**
   * Find best fit combination with minimal change
   */
  private static findBestFitCombination(
    utxos: EnhancedUTXO[],
    totalRequired: number,
    maxInputs: number,
  ): UTXOSelectionResult | null {
    // Sort by value descending for better branch and bound performance
    const sorted = [...utxos].sort((a, b) => b.value - a.value);

    let bestResult: UTXOSelectionResult | null = null;
    let bestChange = Infinity;

    // Try combinations up to 4 inputs for best fit
    const maxCombinationInputs = Math.min(4, maxInputs, sorted.length);

    for (let numInputs = 1; numInputs <= maxCombinationInputs; numInputs++) {
      const result = this.findBestCombination(sorted, totalRequired, numInputs);
      if (result && result.change < bestChange) {
        bestChange = result.change;
        bestResult = result;

        // If we found a very close match, stop searching
        if (result.change < totalRequired * 0.05) {
          // Within 5% of target
          break;
        }
      }
    }

    return bestResult;
  }

  /**
   * Find best combination for a specific number of inputs
   */
  private static findBestCombination(
    utxos: EnhancedUTXO[],
    totalRequired: number,
    numInputs: number,
  ): UTXOSelectionResult | null {
    const combinations = this.generateCombinations(utxos, numInputs);
    let bestResult: UTXOSelectionResult | null = null;
    let bestChange = Infinity;

    for (const combination of combinations) {
      const totalInput = combination.reduce((sum, utxo) => sum + utxo.value, 0);

      if (totalInput >= totalRequired) {
        const change = totalInput - totalRequired;
        if (change < bestChange) {
          bestChange = change;
          bestResult = {
            selectedUTXOs: combination,
            totalInput,
            change,
            estimatedFee: totalRequired - (totalInput - change),
            strategyUsed: CoinSelectionStrategy.BEST_FIT,
            efficiency: (totalRequired - (totalRequired - (totalInput - change))) / totalInput,
          };
        }
      }
    }

    return bestResult;
  }

  /**
   * Generate combinations of UTXOs
   */
  private static generateCombinations(utxos: EnhancedUTXO[], size: number): EnhancedUTXO[][] {
    if (size === 1) {
      return utxos.map((utxo) => [utxo]);
    }

    const combinations: EnhancedUTXO[][] = [];

    for (let i = 0; i <= utxos.length - size; i++) {
      const rest = this.generateCombinations(utxos.slice(i + 1), size - 1);
      for (const combination of rest) {
        combinations.push([utxos[i], ...combination]);
      }
    }

    return combinations;
  }

  /**
   * Get recommended strategy for a given transaction
   */
  static getRecommendedStrategy(
    targetAmount: number,
    availableUTXOs: EnhancedUTXO[],
    options: {
      prioritizeFees?: boolean;
      prioritizePrivacy?: boolean;
      consolidateDust?: boolean;
      selfAddress?: string;
    } = {},
  ): { strategy: CoinSelectionStrategy; recommendSelfAddress?: boolean } {
    const totalAvailable = availableUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
    const dustCount = availableUTXOs.filter((utxo) => utxo.isDust).length;
    const amountRatio = targetAmount / totalAvailable;

    if (options.consolidateDust && dustCount > 5) {
      // For dust consolidation, recommend using the wallet's own address
      return {
        strategy: CoinSelectionStrategy.CONSOLIDATE_DUST,
        recommendSelfAddress: true,
      };
    }

    if (options.prioritizePrivacy) {
      return { strategy: CoinSelectionStrategy.PRIVACY_FOCUSED };
    }

    if (options.prioritizeFees || amountRatio > 0.8) {
      return { strategy: CoinSelectionStrategy.SMALLEST_FIRST };
    }

    // Default to best fit for most transactions
    return { strategy: CoinSelectionStrategy.BEST_FIT };
  }

  /**
   * Validate UTXO selection result
   */
  static validateSelection(result: UTXOSelectionResult, targetAmount: number): boolean {
    const totalInput = result.selectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
    return totalInput >= targetAmount + result.estimatedFee && totalInput === result.totalInput;
  }
}
