import pLimit from 'p-limit';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min = 500, max = 2000): Promise<void> {
  return sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

export interface PaceOptions {
  /** How many items run at once. */
  concurrency: number;
  /** Least time between the start of one item and the next, in ms. */
  gapMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs fn over items with limited concurrency and a gap between starts,
 * so many accounts do not hit MeroShare at the same moment. Keeps the order of items.
 */
export async function pacedMap<T, R>(items: T[], opts: PaceOptions, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const limit = pLimit(Math.max(1, opts.concurrency));
  const wait = opts.sleep ?? sleep;
  let gate: Promise<void> = Promise.resolve();
  return Promise.all(
    items.map((item, i) =>
      limit(async () => {
        const myTurn = gate;
        let release!: () => void;
        gate = new Promise<void>((r) => (release = r));
        await myTurn;
        if (i > 0 && opts.gapMs > 0) await wait(opts.gapMs);
        release();
        return fn(item, i);
      }),
    ),
  );
}
