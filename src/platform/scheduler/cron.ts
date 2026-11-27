import cron from 'node-cron';

export interface ScheduledJob {
  stop(): void;
}

export function isValidSchedule(expr: string): boolean {
  return cron.validate(expr);
}

/** Runs job on the cron schedule. A run never overlaps the one before it. */
export function schedule(expr: string, job: () => Promise<void>, onError?: (err: unknown) => void): ScheduledJob {
  if (!cron.validate(expr)) throw new Error(`Not a valid cron schedule: ${expr}`);
  let running = false;
  const task = cron.schedule(expr, async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (err) {
      onError?.(err);
    } finally {
      running = false;
    }
  });
  return { stop: () => task.stop() };
}
