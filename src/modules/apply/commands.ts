import { confirm, input, number } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AppContext } from '../../platform/context/public.js';
import { defineCommand } from '../../platform/command/public.js';
import { createSpinner, createTable, log, unlockStore } from '../../platform/terminal/public.js';
import { listAccounts, type Account } from '../accounts/public.js';
import { hasActed } from '../issues/public.js';
import { ApplyBusyError, lockApply, planApply, runApply, type ApplyStatus, type Selection } from './apply.js';

const STATUS: Record<ApplyStatus, string> = {
  applied: chalk.green('APPLIED'),
  already: chalk.cyan('ALREADY'),
  skipped: chalk.yellow('SKIPPED'),
  failed: chalk.red('FAILED'),
};

export const applyCommand = defineCommand({
  name: 'apply',
  description: 'Apply for open IPOs across all accounts',
  async handler(_input, ctx) {
    console.log(chalk.bold('\n  IPO Apply\n'));
    await unlockStore(ctx.store);
    const accounts = listAccounts(ctx);
    if (!accounts.length) return log.error('No accounts configured. Run "ipo init" first.');
    let lock;
    try {
      lock = lockApply(ctx);
    } catch (err) {
      if (err instanceof ApplyBusyError) return log.error(`Another ipo apply is running (pid ${err.pid}). Wait for it to finish.`);
      throw err;
    }
    try {
      await applyFlow(ctx, accounts);
    } finally {
      lock.release();
    }
  },
});

async function applyFlow(ctx: AppContext, accounts: Account[]): Promise<void> {
  const spinner = createSpinner(`Logging in to ${accounts.length} account(s)...`).start();
  const plan = await planApply(ctx, accounts);
  spinner.stop();
  for (const s of plan.skipped) log.warn(`Skipping ${s.account.name}: ${s.reason}`);
  if (!plan.sessions.length) {
    await plan.release();
    return log.error('No account can apply right now. Run "ipo doctor".');
  }

  // the list comes from the first healthy account; "action" is that account's own
  const open = plan.issues;
  if (!open.length) {
    await plan.release();
    return log.info('No open issues right now.');
  }
  console.log(
    createTable(
      ['#', 'Company', 'Type', 'Group', 'Open', 'Close', 'Min', 'Max', 'Price'],
      open.map((i, n) => [
        String(n + 1),
        i.companyName,
        i.shareTypeName || '-',
        i.shareGroupName || '-',
        i.issueOpenDate || '-',
        i.issueCloseDate || '-',
        String(i.minUnit ?? '-'),
        i.maxUnit ? String(i.maxUnit) : 'not given',
        String(i.shareValue ?? '-'),
      ]),
    ),
  );

  const selections: Selection[] = [];
  try {
    for (const issue of open) {
      const note = hasActed(issue) ? chalk.dim(` [${plan.sessions[0].account.name} already: ${issue.action}]`) : '';
      if (!(await confirm({ message: `Apply for ${issue.companyName} (${issue.shareGroupName || issue.shareTypeName})?${note}`, default: true }))) continue;
      const min = issue.minUnit || 1;
      // no maxUnit: MeroShare checks the amount itself, so set no cap of our own
      const max = issue.maxUnit || undefined;
      const range = max ? `min ${min}, max ${max}` : `min ${min}, max not given by MeroShare`;
      const kitta = (await number({ message: `Kitta for ${issue.companyName} (${range}):`, default: min, min, max })) ?? min;
      selections.push({ issue, kitta });
    }
    if (!selections.length) {
      await plan.release();
      return log.info('No issues selected.');
    }
    console.log(chalk.bold('\n  Summary\n'));
    for (const s of selections) log.info(`${s.issue.companyName}: ${s.kitta} kitta x ${plan.sessions.length} account(s)`);
    await input({ message: 'Press Enter to apply (Ctrl+C to cancel):' });
  } catch (err) {
    await plan.release();
    throw err;
  }

  const results = await runApply(ctx, plan, selections);
  console.log(chalk.bold('\n  Results\n'));
  console.log(
    createTable(
      ['Account', 'Company', 'Status', 'Message'],
      results.map((r) => [r.account.name, r.company, STATUS[r.status], r.message.length > 60 ? `${r.message.slice(0, 57)}...` : r.message]),
    ),
  );
}
