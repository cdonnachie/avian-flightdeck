/**
 * Run an async worker over a list with a bounded number of tasks in flight at once.
 *
 * Electrum's transport matches responses to requests by id, so many `transaction.get` calls can be
 * outstanding on one socket simultaneously. Fetching a large transaction history one-at-a-time pays
 * the round-trip latency serially; a small pool cuts the wall-clock time by roughly the pool size
 * while keeping a ceiling on how hard the server is hit.
 *
 * Ordering is not preserved — workers pull from a shared cursor as they free up — so the worker must
 * not rely on completion order. A worker that throws rejects the whole run (like `Promise.all`);
 * callers that want to tolerate per-item failure should catch inside the worker.
 *
 * @param items   the work list
 * @param limit   maximum tasks running concurrently (clamped to >= 1)
 * @param worker  invoked once per item with the item and its original index
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const bound = Math.max(1, Math.floor(limit));
  let cursor = 0;

  const runner = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  };

  const runners = Array.from({ length: Math.min(bound, items.length) }, () => runner());
  await Promise.all(runners);
}
