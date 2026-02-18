#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import {
  initCommand,
  initAddCommand,
  initListCommand,
  initEditCommand,
  initRemoveCommand,
} from '../src/commands/init.js';
import { applyCommand } from '../src/commands/apply.js';
import { resultCommand } from '../src/commands/result.js';
import { notifyCommand } from '../src/commands/notify.js';
import {
  autoConfigCommand,
  autoStartCommand,
  autoStopCommand,
  autoStatusCommand,
} from '../src/commands/auto.js';

const program = new Command();

program
  .name('ipo')
  .description('Bulk MeroShare IPO CLI tool for Nepal Stock Exchange')
  .version('1.0.0');

const init = program
  .command('init')
  .description('Setup and manage MeroShare accounts');

init
  .command('setup', { isDefault: true })
  .description('Full setup wizard (master password + accounts)')
  .action(async () => {
    try {
      await initCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

init
  .command('add')
  .description('Add a new account')
  .action(async () => {
    try {
      await initAddCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

init
  .command('list')
  .description('List all configured accounts')
  .action(async () => {
    try {
      await initListCommand();
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

init
  .command('edit')
  .description('Edit an existing account')
  .action(async () => {
    try {
      await initEditCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

init
  .command('remove')
  .description('Remove an account')
  .action(async () => {
    try {
      await initRemoveCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

program
  .command('apply')
  .description('Apply for open IPOs across all accounts')
  .action(async () => {
    try {
      await applyCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

program
  .command('result')
  .description('Check IPO results for all accounts')
  .action(async () => {
    try {
      await resultCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

program
  .command('notify')
  .description('Configure email notifications')
  .action(async () => {
    try {
      await notifyCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

const auto = program
  .command('auto')
  .description('Auto-apply configuration and scheduler');

auto
  .command('config')
  .description('Configure auto-apply preferences')
  .action(async () => {
    try {
      await autoConfigCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

auto
  .command('start')
  .description('Start the auto-apply scheduler')
  .action(async () => {
    try {
      await autoStartCommand();
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') process.exit(0);
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

auto
  .command('stop')
  .description('Stop the auto-apply scheduler')
  .action(async () => {
    try {
      await autoStopCommand();
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

auto
  .command('status')
  .description('Show auto-apply status')
  .action(async () => {
    try {
      await autoStatusCommand();
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

program.parse();
