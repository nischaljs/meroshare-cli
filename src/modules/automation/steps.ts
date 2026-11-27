import type { AppContext } from '../../platform/context/public.js';
import { log, pacedMap } from '../../platform/terminal/public.js';
import { autoApply } from '../apply/public.js';
import { runDoctor, type HealthReport } from '../health/public.js';
import { rotatePassword, rotationReason } from '../password/public.js';
import { sendRenewalReminders } from '../renewal/public.js';
import { closeSession, openSession } from '../session/public.js';
import type { AutoSettings } from './state.js';

/** What the steps of one run share. */
export interface RunBag {
  settings: AutoSettings;
  reports: HealthReport[];
  lines: string[];
}

/** A step plugs into the daily job with this. Steps run by `order`, low first. */
export interface AutomationStep {
  name: string;
  order: number;
  run(ctx: AppContext, bag: RunBag): Promise<void>;
}

export const healthStep: AutomationStep = {
  name: 'health',
  order: 10,
  async run(ctx, bag) {
    bag.reports = await runDoctor(ctx);
    const bad = bag.reports.filter((r) => r.status !== 'ok');
    bag.lines.push(`health: ${bag.reports.length} account(s) checked, ${bad.length} need attention`);
  },
};

export const passwordStep: AutomationStep = {
  name: 'password',
  order: 20,
  async run(ctx, bag) {
    if (!bag.settings.autoPassword) return;
    const due = bag.reports
      .map((r) => ({ report: r, reason: rotationReason(r, ctx.now()) }))
      .filter((d): d is { report: HealthReport; reason: string } => d.reason !== null);
    await pacedMap(due, { concurrency: 1, gapMs: ctx.accountGapMs, sleep: ctx.sleep }, async ({ report, reason }) => {
      let session;
      try {
        session = await openSession(ctx, report.account);
      } catch (err) {
        bag.lines.push(`password: ${report.account.name}: could not log in (${(err as Error).message})`);
        return;
      }
      try {
        const out = await rotatePassword(ctx, session);
        bag.lines.push(`password: ${report.account.name} (${reason}): ${out.status}${out.status === 'changed' ? '' : `, ${out.message}`}`);
      } catch (err) {
        bag.lines.push(`password: ${report.account.name}: ${(err as Error).message}`);
      } finally {
        if (session) await closeSession(ctx, session);
      }
    });
  },
};

export const renewalWarningsStep: AutomationStep = {
  name: 'renewal-warnings',
  order: 30,
  async run(ctx, bag) {
    const sent = await sendRenewalReminders(ctx);
    if (sent) bag.lines.push(`warnings: ${sent} reminder(s) sent`);
  },
};

export const applyStep: AutomationStep = {
  name: 'apply',
  order: 40,
  async run(ctx, bag) {
    const { plan, results } = await autoApply(ctx, { categories: bag.settings.categories, maxKitta: bag.settings.maxKitta });
    for (const s of plan.skipped) bag.lines.push(`apply: skipped ${s.account.name}: ${s.reason}`);
    if (!results.length) bag.lines.push('apply: nothing to apply for');
    for (const r of results) bag.lines.push(`apply: ${r.account.name} ${r.company}: ${r.status} ${r.message}`);
  },
};

/** The daily job. Adding a step means adding it to this list, nothing else. */
export const DAILY_STEPS: AutomationStep[] = [healthStep, passwordStep, renewalWarningsStep, applyStep];

/** Runs the steps in order. A failing step is logged and the next one still runs. */
export async function runDaily(ctx: AppContext, settings: AutoSettings, steps: AutomationStep[] = DAILY_STEPS): Promise<RunBag> {
  const bag: RunBag = { settings, reports: [], lines: [] };
  for (const step of [...steps].sort((a, b) => a.order - b.order)) {
    try {
      await step.run(ctx, bag);
    } catch (err) {
      bag.lines.push(`${step.name}: failed: ${(err as Error).message}`);
    }
  }
  for (const l of bag.lines) log.info(`[auto] ${l}`);
  return bag;
}
