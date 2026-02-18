import { password, checkbox, number, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  configExists,
  verifyMasterPassword,
  readRawConfig,
  writeConfig,
} from '../store/config.js';
import { startCron, stopCron, isCronRunning } from '../scheduler/cron.js';
import { getAutoStartInstructions } from '../scheduler/setup.js';
import { log } from '../utils/logger.js';

const CATEGORIES = ['IPO', 'FPO', 'Right', 'Debenture', 'Mutual Fund'];
const SECTORS = [
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

export async function autoConfigCommand(): Promise<void> {
  console.log(chalk.bold('\n  Auto-Apply Configuration\n'));

  if (!configExists()) {
    log.error('No config found. Run "ipo init" first.');
    return;
  }

  const masterPassword = await password({
    message: 'Master password:',
    mask: '*',
  });

  if (!verifyMasterPassword(masterPassword)) {
    log.error('Invalid master password.');
    return;
  }

  const config = readRawConfig();

  const categories = await checkbox<string>({
    message: 'Share categories to auto-apply:',
    choices: CATEGORIES.map((c) => ({
      name: c,
      value: c,
      checked: config.auto.categories.includes(c),
    })),
  });

  const sectors = await checkbox<string>({
    message: 'Sectors to auto-apply (leave empty for all):',
    choices: SECTORS.map((s) => ({
      name: s,
      value: s,
      checked: config.auto.sectors.includes(s),
    })),
  });

  const maxKitta =
    (await number({
      message: 'Max kitta per application:',
      default: config.auto.maxKitta,
      min: 1,
      max: 500,
    })) ?? 10;

  const schedule = await input({
    message: 'Cron schedule (default: daily at 10 AM):',
    default: config.auto.schedule,
  });

  config.auto = {
    enabled: true,
    categories,
    sectors,
    maxKitta,
    schedule,
  };

  writeConfig(config);
  log.success('Auto-apply configuration saved.');

  console.log(chalk.dim(`\n  Categories: ${categories.join(', ') || 'All'}`));
  console.log(chalk.dim(`  Sectors: ${sectors.join(', ') || 'All'}`));
  console.log(chalk.dim(`  Max kitta: ${maxKitta}`));
  console.log(chalk.dim(`  Schedule: ${schedule}\n`));
}

export async function autoStartCommand(): Promise<void> {
  console.log(chalk.bold('\n  Start Auto-Apply\n'));

  if (!configExists()) {
    log.error('No config found. Run "ipo init" first.');
    return;
  }

  const masterPassword = await password({
    message: 'Master password:',
    mask: '*',
  });

  if (!verifyMasterPassword(masterPassword)) {
    log.error('Invalid master password.');
    return;
  }

  const config = readRawConfig();
  if (!config.auto.enabled) {
    log.warn('Auto-apply not configured. Run "ipo auto config" first.');
    return;
  }

  const showSetup = await confirm({
    message: 'Show platform-specific autostart setup instructions?',
    default: false,
  });

  if (showSetup) {
    console.log(getAutoStartInstructions());
  }

  log.info('Starting in-process scheduler (runs until process exits)...');
  startCron(masterPassword, config.auto.schedule);

  // Keep process alive
  process.on('SIGINT', () => {
    stopCron();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopCron();
    process.exit(0);
  });
}

export async function autoStopCommand(): Promise<void> {
  stopCron();
}

export async function autoStatusCommand(): Promise<void> {
  console.log(chalk.bold('\n  Auto-Apply Status\n'));

  if (!configExists()) {
    log.error('No config found.');
    return;
  }

  const config = readRawConfig();
  const running = isCronRunning();

  console.log(`  Enabled:    ${config.auto.enabled ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  Running:    ${running ? chalk.green('Yes') : chalk.dim('No')}`);
  console.log(`  Schedule:   ${config.auto.schedule}`);
  console.log(`  Categories: ${config.auto.categories.join(', ') || chalk.dim('All')}`);
  console.log(`  Sectors:    ${config.auto.sectors.join(', ') || chalk.dim('All')}`);
  console.log(`  Max kitta:  ${config.auto.maxKitta}`);
  console.log();
}
