import { describe, expect, it, vi } from 'vitest';

import { runWithConcurrency } from './concurrency';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('runWithConcurrency', () => {
  it('runs every item exactly once, with its original index', async () => {
    const seen: Array<[number, number]> = [];
    await runWithConcurrency([10, 20, 30], 2, async (item, index) => {
      seen.push([item, index]);
    });
    expect(seen.sort((a, b) => a[1] - b[1])).toEqual([
      [10, 0],
      [20, 1],
      [30, 2],
    ]);
  });

  it('processes a list longer than the limit', async () => {
    const done: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      done.push(n);
    });
    expect(done.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('never exceeds the concurrency limit, but does run in parallel', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await runWithConcurrency(items, 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(5);
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('clamps a limit below 1 to serial execution', async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithConcurrency([1, 2, 3], 0, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(1);
      inFlight--;
    });
    expect(peak).toBe(1);
  });

  it('does nothing for an empty list', async () => {
    const worker = vi.fn(async () => {});
    await runWithConcurrency([], 4, worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it('rejects when a worker throws', async () => {
    await expect(
      runWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
