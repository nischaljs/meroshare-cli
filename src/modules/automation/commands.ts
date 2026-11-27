import { checkbox, confirm, input, number } from '@inquirer/prompts';
import chalk from 'chalk';
import { defineCommand } from '../../platform/command/public.js';
import {
  clearPid,
  getAutoStartInstructions,
  isValidSchedule,
  runningPid,
  schedule,
  stopRunning,
  writePid,
} from '../../platform/scheduler/public.js';
import { log, unlockStore } from '../../platform/terminal/public.js';
import { runDaily } from './steps.js';
import { AutoSection } from './state.js';

export const CATEGORIES = ['IPO', 'FPO', 'Right', 'Debenture', 'Mutual Fund'];
export const SECTORS = [
  'Commercial Bank',
  'Development Bank',
  'Finance',
  'Microfinance',
  'Hydropower',
  'Insurance (Life)',
  'Insurance (Non-Life)',
  'Hotels & Tourism',
  'Manufacturing',
  'Trading',
  'Investment',
  'Others',
];

const config = defineCommand({
  name: 'config',
  description: 'Configure auto-apply',
  async handler(_input, ctx) {
    console.log(chalk.bold('\n  Auto-Apply Configuration\n'));
    await unlockStore(ctx.store);
    const section = ctx.store.section(AutoSection);
    const { value: cur, revision } = section.read();
    const categories = await checkbox<string>({
      message: 'Share categories to auto-apply:',
      choices: CATEGORIES.map((c) => ({ name: c, value: c, checked: cur.categories.includes(c) })),
    });
    const sectors = await checkbox<string>({
      message: 'Sectors to auto-apply (leave empty for all):',
      choices: SECTORS.map((s) => ({ name: s, value: s, checked: cur.sectors.includes(s) })),
    });
    const maxKitta = (await number({ message: 'Max kitta per application:', default: cur.maxKitta, min: 1, max: 500 })) ?? 10;
    const when = await input({
      message: 'Cron schedule (default: daily at 10 AM):',
      default: cur.schedule,
      validate: (v) => (isValidSchedule(v) ? true : 'Not a valid cron schedule'),
    });
    console.log(
      chalk.dim(
        '\n  Automatic password change: the daily job changes a MeroShare password within 7 days of\n' +
          '  expiry, or when MeroShare asks for a new one. ipo then holds the only copy of the new\n' +
          '  password (encrypted). See it any time with: ipo accounts password <account>\n',
      ),
    );
    const autoPassword = await confirm({ message: 'Turn on automatic password change?', default: cur.autoPassword });
    const next = { enabled: true, categories, sectors, maxKitta, schedule: when, autoPassword };
    section.update(() => next, { revision });
    log.success('Auto-apply configuration saved.');
    console.log(chalk.dim(`\n  Categories: ${categories.join(', ') || 'All'}`));
    console.log(chalk.dim(`  Sectors: ${sectors.join(', ') || 'All'}`));
    console.log(chalk.dim(`  Max kitta: ${maxKitta}`));
    console.log(chalk.dim(`  Schedule: ${when}`));
    console.log(chalk.dim(`  Password change: ${autoPassword ? 'on' : 'off'}\n`));
  },
});

const start = defineCommand({
  name: 'start',
  description: 'Run the daily job on its schedule (runs until stopped)',
  options: [{ flags: '--now', description: 'also run the job once right away' }],
  async handler({ options }, ctx) {
    console.log(chalk.bold('\n  Start Auto-Apply\n'));
    await unlockStore(ctx.store);
    const settings = ctx.store.section(AutoSection).read().value;
    if (!settings.enabled) return log.warn('Auto-apply not configured. Run "ipo auto config" first.');
    const other = runningPid();
    if (other) return log.warn(`Already running (pid ${other}). Stop it with "ipo auto stop".`);
    if (!process.env.IPO_MASTER_PASSWORD && (await confirm({ message: 'Show platform-specific autostart setup instructions?', default: false }))) {
      console.log(getAutoStartInstructions());
    }
    // each run reads the settings again, so "ipo auto config" takes effect without a restart
    const job = async () => {
      log.info(`[auto] run at ${ctx.now().toLocaleString()}`);
      await runDaily(ctx, ctx.store.section(AutoSection).read().value);
    };
    const task = schedule(settings.schedule, job, (err) => log.error(`[auto] ${(err as Error).message}`));
    writePid();
    log.info(`Scheduler running (${settings.schedule}). Ctrl+C or "ipo auto stop" to stop.`);
    const stop = () => {
      task.stop();
      clearPid();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    if (options.now) await job();
  },
});

const run = defineCommand({
  name: 'run',
  description: 'Run the daily job once now: health, password, warnings, apply',
  async handler(_input, ctx) {
    await unlockStore(ctx.store);
    await runDaily(ctx, ctx.store.section(AutoSection).read().value);
  },
});

const stop = defineCommand({
  name: 'stop',
  description: 'Stop the running scheduler',
  async handler() {
    const out = stopRunning();
    if (!out.stopped) return log.info('No scheduler is running.');
    log.success('Scheduler stopped.');
    if (out.note) log.warn(out.note);
  },
});

const status = defineCommand({
  name: 'status',
  description: 'Show auto-apply settings',
  async handler(_input, ctx) {
    console.log(chalk.bold('\n  Auto-Apply Status\n'));
    if (!ctx.store.exists()) return log.error('No config found.');
    const s = ctx.store.section(AutoSection).read().value;
    const pid = runningPid();
    console.log(`  Enabled:    ${s.enabled ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`  Running:    ${pid ? chalk.green(`Yes (pid ${pid})`) : chalk.dim('No')}`);
    console.log(`  Schedule:   ${s.schedule}`);
    console.log(`  Categories: ${s.categories.join(', ') || chalk.dim('All')}`);
    console.log(`  Sectors:    ${s.sectors.join(', ') || chalk.dim('All')}`);
    console.log(`  Max kitta:  ${s.maxKitta}`);
    console.log(`  Password change: ${s.autoPassword ? 'on' : 'off'}\n`);
  },
});

export const autoCommand = defineCommand({
  name: 'auto',
  description: 'Daily job: health check, password change, expiry warnings, auto-apply',
  subcommands: [config, start, run, stop, status],
});
