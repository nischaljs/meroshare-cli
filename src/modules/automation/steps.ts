import type { AppContext } from '../../platform/context/public.js';
import { log, pacedMap } from '../../platform/terminal/public.js';
import { ApplyBusyError, autoApply } from '../apply/public.js';
import { accountId, listAccounts } from '../accounts/public.js';
import { blockedActions, blockedNoticesDue, cachedReports, markBlockedNotified, runDoctor, type HealthReport } from '../health/public.js';
import { passwordChangeUnblocks, rotatePassword, rotationReason } from '../password/public.js';
import { sendRenewalReminders } from '../renewal/public.js';
import { createSessionPool, type SessionPool } from '../session/public.js';
import type { AutoSettings } from './state.js';

/** What the steps of one run share. */
export interface RunBag {
  settings: AutoSettings;
  reports: HealthReport[];
  lines: string[];
  /** Each account logs in once per run, in the first step that needs it; later steps reuse it. */
  sessions: SessionPool;
}

/** A step plugs into the daily job with this. Steps run by `order`, low first. */
export interface AutomationStep {
  name: string;
  order: number;
  run(ctx: AppContext, bag: RunBag): Promise<void>;
}

const UNTIL_CHECKED =
  'It stays held until you check it again with "ipo doctor" (or "ipo fix"); a fix made on the MeroShare website is not seen until then';

/** Why the daily job makes no login with this account, and what the person does about it. */
function heldReason(report: HealthReport): string {
  const why = report.findings.filter((f) => f.severity === 'blocked').map((f) => f.message).join('; ');
  return `blocked: ${why}. To fix it: ${blockedActions(report).join('; ')}. ${UNTIL_CHECKED}`;
}

/** One email when an account becomes held, not one a day while it stays held. */
async function sendHeldNotices(ctx: AppContext, held: HealthReport[]): Promise<void> {
  for (const r of blockedNoticesDue(ctx, held)) {
    const delivery = await ctx.notifier.send({
      kind: 'accountBlocked',
      account: r.account.name,
      subject: `${r.account.name} is blocked: the daily run makes no login with it`,
      lines: [
        `${r.account.name}: ${r.findings.filter((f) => f.severity === 'blocked').map((f) => f.message).join('; ')}.`,
        '',
        `To fix it: ${blockedActions(r).join('; ')}.`,
        '',
        `The daily run makes no login with this account and applies for no IPO with it. ${UNTIL_CHECKED}.`,
        'This email is sent once for this block.',
      ],
    });
    if (delivery.email !== 'failed') markBlockedNotified(ctx, r.account);
  }
}

/**
 * An account the last check found blocked is held: no step logs in with it, so a dead
 * password is not tried again every day. The one exception is a block the automatic
 * password change fixes (an expired password, MeroShare asks for a new one) while it is on.
 */
export function accountsToHold(reports: HealthReport[], settings: AutoSettings): HealthReport[] {
  return reports.filter((r) => r.status === 'blocked' && !(settings.autoPassword && passwordChangeUnblocks(r)));
}

export const healthStep: AutomationStep = {
  name: 'health',
  order: 10,
  async run(ctx, bag) {
    let cached: HealthReport[];
    try {
      cached = cachedReports(ctx);
    } catch (err) {
      // fail closed: without the last checks ipo cannot tell a blocked account from a good one
      const reason = `ipo could not read the last health checks (${(err as Error).message}). No login with any account until "ipo doctor" runs`;
      for (const a of listAccounts(ctx)) bag.sessions.hold(a, reason);
      bag.lines.push(`health: ${reason}. Every login step, apply included, is skipped in this run.`);
      return;
    }
    const held = accountsToHold(cached, bag.settings);
    for (const r of held) bag.sessions.hold(r.account, heldReason(r));
    const reports = await runDoctor(ctx, bag.sessions);
    bag.reports = reports;
    // a held account's report is its last check, not a new one: count each account once
    const heldIds = new Set(held.map((r) => accountId(r.account)));
    const checked = reports.filter((r) => !heldIds.has(accountId(r.account)));
    const bad = checked.filter((r) => r.status !== 'ok');
    bag.lines.push(
      `health: ${checked.length} account(s) checked, ${bad.length} need attention` + (held.length ? `, ${held.length} blocked and not logged in` : ''),
    );
    for (const r of held) bag.lines.push(`health: skipped ${r.account.name}: ${heldReason(r)}`);
    // the accounts this check leaves held from the next run on, the ones held now included:
    // the email goes out on the run that finds the block, once
    await sendHeldNotices(ctx, accountsToHold(reports, bag.settings));
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
      const o = await bag.sessions.get(report.account);
      if (!o.ok) {
        bag.lines.push(o.held ? `password: skipped ${report.account.name}: ${o.error}` : `password: ${report.account.name}: could not log in (${o.error})`);
        return;
      }
      try {
        const out = await rotatePassword(ctx, o.session);
        if ((out.status === 'changed' || out.status === 'rejected') && out.session) await bag.sessions.replace(out.session);
        // neither password logs in: no more tries with this account in this run
        if (out.status === 'blocked') await bag.sessions.fail(report.account, out.message);
        bag.lines.push(`password: ${report.account.name} (${reason}): ${out.status}${out.status === 'changed' ? '' : `, ${out.message}`}`);
      } catch (err) {
        bag.lines.push(`password: ${report.account.name}: ${(err as Error).message}`);
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
    // checked here, not by the commands, so auto run, auto start and every cron run obey it
    if (!bag.settings.enabled) {
      bag.lines.push('apply: Auto-apply is off. Turn it on with ipo auto config.');
      return;
    }
    let outcome;
    try {
      outcome = await autoApply(ctx, { categories: bag.settings.categories, maxKitta: bag.settings.maxKitta }, bag.sessions);
    } catch (err) {
      if (!(err instanceof ApplyBusyError)) throw err;
      bag.lines.push(`apply: Another ipo apply is running (pid ${err.pid}). This run did not apply.`);
      return;
    }
    const { plan, results } = outcome;
    for (const s of plan.skipped) bag.lines.push(`apply: skipped ${s.account.name}: ${s.reason}`);
    if (!results.length) bag.lines.push('apply: nothing to apply for');
    for (const r of results) bag.lines.push(`apply: ${r.account.name} ${r.company}: ${r.status} ${r.message}`);
  },
};

/** The daily job. Adding a step means adding it to this list, nothing else. */
export const DAILY_STEPS: AutomationStep[] = [healthStep, passwordStep, renewalWarningsStep, applyStep];

/** Runs the steps in order. A failing step is logged and the next one still runs. */
export async function runDaily(ctx: AppContext, settings: AutoSettings, steps: AutomationStep[] = DAILY_STEPS): Promise<RunBag> {
  const bag: RunBag = { settings, reports: [], lines: [], sessions: createSessionPool(ctx) };
  try {
    for (const step of [...steps].sort((a, b) => a.order - b.order)) {
      try {
        await step.run(ctx, bag);
      } catch (err) {
        bag.lines.push(`${step.name}: failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await bag.sessions.closeAll();
  }
  for (const l of bag.lines) log.info(`[auto] ${l}`);
  return bag;
}
