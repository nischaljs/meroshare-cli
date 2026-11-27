import { confirm, input, number, password } from '@inquirer/prompts';
import chalk from 'chalk';
import { defineCommand } from '../../platform/command/public.js';
import { EmailSection, type EmailSettings, type NoticeKind } from '../../platform/notify/public.js';
import { createSpinner, log, unlockStore } from '../../platform/terminal/public.js';

/** The notices a person can turn on or off, with the old defaults. */
export const EVENT_CHOICES: { kind: NoticeKind; label: string; default: boolean }[] = [
  { kind: 'applied', label: 'Notify on IPO application?', default: true },
  { kind: 'resultOut', label: 'Notify on result check?', default: true },
  { kind: 'allocated', label: 'Notify on allocation?', default: true },
  { kind: 'notAllocated', label: 'Notify on non-allocation?', default: false },
  { kind: 'renewalDue', label: 'Notify before an account, password or DEMAT expires?', default: true },
  { kind: 'passwordChanged', label: 'Notify when ipo changes a password?', default: true },
  { kind: 'accountBlocked', label: 'Notify when an account is blocked?', default: true },
];

export const notifyCommand = defineCommand({
  name: 'notify',
  description: 'Set up email notifications',
  async handler(_input, ctx) {
    console.log(chalk.bold('\n  Email Notification Setup\n'));
    await unlockStore(ctx.store);
    const section = ctx.store.section(EmailSection);
    const { value: current, revision } = section.read();
    if (current) {
      log.info('Email notifications already configured.');
      if (!(await confirm({ message: 'Reconfigure email settings?', default: false }))) return;
    }
    const email = await input({
      message: 'Email address:',
      default: current?.email,
      validate: (v) => (v.includes('@') ? true : 'Enter a valid email'),
    });
    const appPassword = await password({ message: 'App password (Gmail: generate at myaccount.google.com/apppasswords):', mask: '*' });
    const smtpHost = await input({ message: 'SMTP host:', default: current?.smtpHost ?? 'smtp.gmail.com' });
    const smtpPort = (await number({ message: 'SMTP port:', default: current?.smtpPort ?? 587 })) ?? 587;
    const events: Record<string, boolean> = {};
    for (const c of EVENT_CHOICES) {
      events[c.kind] = await confirm({ message: c.label, default: current?.events[c.kind] ?? c.default });
    }
    const settings: EmailSettings = { email, appPassword, smtpHost, smtpPort, events };
    if (await confirm({ message: 'Send a test email?', default: true })) {
      const spinner = createSpinner('Sending test email...').start();
      try {
        await ctx.notifier.test(settings);
        spinner.succeed('Test email sent! Check your inbox.');
      } catch (err) {
        spinner.fail('Failed to send test email');
        log.error((err as Error).message);
        return log.warn('Check your email and app password, then try again. Nothing was saved.');
      }
    }
    section.update(() => settings, { revision });
    log.success('Email notifications configured.');
  },
});
