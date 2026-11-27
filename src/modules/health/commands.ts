import chalk from 'chalk';
import { defineCommand } from '../../platform/command/public.js';
import { createSpinner, createTable, unlockStore } from '../../platform/terminal/public.js';
import { daysLeft } from './dates.js';
import { runDoctor, type HealthReport, type Severity } from './health.js';

const COLOR: Record<Severity, (s: string) => string> = {
  ok: chalk.green,
  warn: chalk.yellow,
  urgent: chalk.hex('#ff8800'),
  error: chalk.red,
  blocked: chalk.red.bold,
};

function dateCell(day: string | null, now: Date): string {
  if (!day) return chalk.dim('-');
  const left = daysLeft(day, now);
  if (left < 0) return chalk.red(`${day} (expired)`);
  const text = `${day} (${left}d)`;
  return left <= 7 ? chalk.hex('#ff8800')(text) : left <= 30 ? chalk.yellow(text) : text;
}

export function doctorTable(reports: HealthReport[], now: Date): string {
  return createTable(
    ['Account', 'Password', 'MeroShare', 'DEMAT', 'PIN', 'Bank', 'Status', 'Fix'],
    reports.map((r) => {
      const s = r.snapshot;
      const problems = r.findings.filter((f) => f.severity !== 'ok').map((f) => f.message);
      return [
        r.account.name,
        s.flags.passwordExpired ? chalk.red('expired') : dateCell(s.passwordExpiry, now),
        s.flags.accountExpired ? chalk.red('expired') : dateCell(s.meroshareExpiry, now),
        s.flags.dematExpired ? chalk.red('expired') : dateCell(s.dematExpiry, now),
        s.pin === 'set' ? 'set' : s.pin === 'unknown' ? chalk.dim('-') : chalk.red(s.pin),
        s.bankLinked === null ? chalk.dim('-') : s.bankLinked ? 'linked' : chalk.red('none'),
        COLOR[r.status](r.status) + (problems.length ? `\n${chalk.dim(problems.join('\n'))}` : ''),
        r.fix ?? '',
      ];
    }),
  );
}

export const doctorCommand = defineCommand({
  name: 'doctor',
  description: 'Check every account: expiry dates, PIN, bank, and what to fix (read only)',
  handler: async (_input, ctx) => {
    await unlockStore(ctx.store);
    const spinner = createSpinner('Checking accounts...').start();
    const reports = await runDoctor(ctx);
    spinner.stop();
    if (!reports.length) {
      console.log('No accounts configured. Run "ipo init add".');
      return;
    }
    console.log(doctorTable(reports, ctx.now()));
    const bad = reports.filter((r) => r.status !== 'ok').length;
    console.log(bad ? chalk.yellow(`\n  ${bad} of ${reports.length} account(s) need attention.\n`) : chalk.green(`\n  All ${reports.length} account(s) are fine.\n`));
  },
});
