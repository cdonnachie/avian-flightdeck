import { describe, expect, it } from 'vitest';

import { describeAssetTx, formatAssetQty } from './assetHistory';
import type { AssetScriptInfo } from './assetScript';

const US = 'RXt29uWwW6RJRSjZ4nrpLLpwVs2Xt7YyXm';
const THEM = 'RXReissueAssetXXXXXXXXXXXXXXVEFAWu';

// Terse builder for a decoded asset output.
const out = (
  type: AssetScriptInfo['type'],
  name: string,
  amount: bigint | null,
  address: string | null,
): AssetScriptInfo => ({ type, name, amount, address });

describe('formatAssetQty', () => {
  it('drops trailing zeros so a whole quantity reads as an integer', () => {
    expect(formatAssetQty(100_000_000n)).toBe('1');
    expect(formatAssetQty(1_500_000_000n)).toBe('15');
  });

  it('keeps only the significant decimals', () => {
    expect(formatAssetQty(550_000_000n)).toBe('5.5');
    expect(formatAssetQty(1n)).toBe('0.00000001');
    expect(formatAssetQty(0n)).toBe('0');
  });
});

describe('describeAssetTx', () => {
  it('returns null when the transaction carries no asset outputs', () => {
    expect(describeAssetTx([], US, 'receive')).toBeNull();
  });

  it('labels a received transfer with the amount paid to us', () => {
    const outputs = [
      out('transfer', 'SMAUG', 500_000_000n, US), // 5 to us
      out('transfer', 'SMAUG', 200_000_000n, THEM), // change/other — ignored on receive
    ];
    expect(describeAssetTx(outputs, US, 'receive')).toEqual({
      action: 'receive',
      entries: [{ name: 'SMAUG', amount: 500_000_000n }],
    });
  });

  it('labels a sent transfer with the amount that left to others (change excluded)', () => {
    const outputs = [
      out('transfer', 'SMAUG', 500_000_000n, THEM), // 5 sent away
      out('transfer', 'SMAUG', 900_000_000n, US), // change back to us — excluded
    ];
    expect(describeAssetTx(outputs, US, 'send')).toEqual({
      action: 'send',
      entries: [{ name: 'SMAUG', amount: 500_000_000n }],
    });
  });

  it('recognises an issuance regardless of the AVN-side classification', () => {
    const outputs = [
      out('issue', 'FLIGHTDECK#desktop', 100_000_000n, US),
      out('owner', 'FLIGHTDECK!', null, US),
    ];
    expect(describeAssetTx(outputs, US, 'send')).toEqual({
      action: 'issue',
      entries: [{ name: 'FLIGHTDECK#desktop', amount: 100_000_000n }],
    });
  });

  it('recognises a reissue', () => {
    const outputs = [
      out('reissue', 'CRAIG_KINGDOM', 200_000_000n, US),
      out('owner', 'CRAIG_KINGDOM!', null, US),
    ];
    expect(describeAssetTx(outputs, US, 'send')).toEqual({
      action: 'reissue',
      entries: [{ name: 'CRAIG_KINGDOM', amount: 200_000_000n }],
    });
  });

  it('sums multiple outputs of the same asset', () => {
    const outputs = [
      out('transfer', 'SMAUG', 300_000_000n, US),
      out('transfer', 'SMAUG', 200_000_000n, US),
    ];
    expect(describeAssetTx(outputs, US, 'receive')).toEqual({
      action: 'receive',
      entries: [{ name: 'SMAUG', amount: 500_000_000n }],
    });
  });

  it('ignores an owner-token-only movement', () => {
    const outputs = [out('owner', 'CRAIG_KINGDOM!', null, THEM)];
    expect(describeAssetTx(outputs, US, 'send')).toBeNull();
  });
});
