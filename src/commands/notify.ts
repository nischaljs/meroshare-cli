import { input, password, number, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  configExists,
  verifyMasterPassword,
  readRawConfig,
  writeConfig,
  encryptEmailPassword,
} from '../store/config.js';
import { sendTestEmail } from '../notifications/email.js';
import { log } from '../utils/logger.js';
import { createSpinner } from '../utils/ui.js';
import type { EmailConfig } from '../store/types.js';

export async function notifyCommand(): Promise<void> {
  console.log(chalk.bold('\n  Email Notification Setup\n'));

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

  if (config.email) {
    log.info('Email notifications already configured.');
    const reconfigure = await confirm({
      message: 'Reconfigure email settings?',
      default: false,
    });
    if (!reconfigure) return;
  }

  const email = await input({
    message: 'Email address:',
    validate: (val) => (val.includes('@') ? true : 'Enter a valid email'),
  });

  const appPassword = await password({
    message: 'App password (Gmail: generate at myaccount.google.com/apppasswords):',
    mask: '*',
  });

  const smtpHost = await input({
    message: 'SMTP host:',
    default: 'smtp.gmail.com',
  });

  const smtpPort =
    (await number({
      message: 'SMTP port:',
      default: 587,
    })) ?? 587;

  // Event preferences
  const applied = await confirm({ message: 'Notify on IPO application?', default: true });
  const resultOut = await confirm({ message: 'Notify on result check?', default: true });
  const allocated = await confirm({ message: 'Notify on allocation?', default: true });
  const notAllocated = await confirm({ message: 'Notify on non-allocation?', default: false });

  const emailConfig: EmailConfig = {
    email,
    appPassword,
    smtpHost,
    smtpPort,
    events: { applied, resultOut, allocated, notAllocated },
  };

  // Test email
  const sendTest = await confirm({
    message: 'Send a test email?',
    default: true,
  });

  if (sendTest) {
    const spinner = createSpinner('Sending test email...');
    spinner.start();
    try {
      await sendTestEmail(emailConfig);
      spinner.succeed('Test email sent! Check your inbox.');
    } catch (err) {
      spinner.fail('Failed to send test email');
      log.error((err as Error).message);
      log.warn('Check your email and app password, then try again.');
      return;
    }
  }

  // Encrypt and save
  const encryptedPassword = encryptEmailPassword(masterPassword, appPassword);
  config.email = {
    ...emailConfig,
    appPassword: encryptedPassword,
  };
  writeConfig(config);

  log.success('Email notifications configured.');
}
