import { password, confirm } from '@inquirer/prompts';
import { exec } from 'node:child_process';
import os from 'node:os';
import chalk from 'chalk';
import pLimit from 'p-limit';
import { configExists, getDecryptedAccounts, verifyMasterPassword, readRawConfig, decryptEmailPassword } from '../store/config.js';
import { login, logout } from '../api/auth.js';
import { getApplicationReports, getApplicationDetail } from '../api/ipo.js';
import { log } from '../utils/logger.js';
import { createSpinner, createTable, formatStatus, randomDelay } from '../utils/ui.js';
import { sendNotification } from '../notifications/email.js';
import type { IPOResult, Account } from '../store/types.js';

export async function resultCommand(): Promise<void> {
  console.log(chalk.bold('\n  IPO Result Check\n'));

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

  const accounts = getDecryptedAccounts(masterPassword);
  if (accounts.length === 0) {
    log.error('No accounts configured.');
    return;
  }

  log.info(`Checking results for ${accounts.length} account(s) via MeroShare...`);

  const limit = pLimit(3);
  const results: IPOResult[] = [];

  const spinner = createSpinner('Checking application results...');
  spinner.start();

  const tasks = accounts.map((account) =>
    limit(async () => {
      await randomDelay(300, 1000);
      return checkAccountResults(account);
    }),
  );

  const accountResults = await Promise.all(tasks);
  for (const ar of accountResults) {
    results.push(...ar);
  }

  spinner.succeed(`Checked ${accounts.length} account(s)`);

  if (results.length === 0) {
    log.info('No application records found for any account.');
    log.dim('Results may take ~24h to appear on MeroShare after the public site.');

    const openPublic = await confirm({
      message: 'Open public result site in browser?',
      default: true,
    });
    if (openPublic) {
      openBrowser('https://iporesult.cdsc.com.np');
    }
    return;
  }

  // Display results
  console.log(chalk.bold('\n  Application Results\n'));
  const resultTable = createTable(
    ['Username', 'Company', 'Status', 'Applied', 'Received'],
    results.map((r) => [
      r.accountName,
      r.company,
      formatStatus(r.status),
      r.kitta !== undefined ? String(r.kitta) : '-',
      r.receivedKitta !== undefined ? String(r.receivedKitta) : '-',
    ]),
  );
  console.log(resultTable);

  // Summary
  const allotted = results.filter((r) => r.status === 'allotted');
  const notAllotted = results.filter((r) => r.status === 'not_allotted');
  const errors = results.filter((r) => r.status === 'error');
  console.log(
    chalk.bold(
      `\n  Summary: ${chalk.green(allotted.length + ' allotted')}, ${chalk.red(notAllotted.length + ' not allotted')}` +
      (errors.length ? `, ${chalk.yellow(errors.length + ' error')}` : '') +
      '\n',
    ),
  );

  // Offer to open public site for early results
  const openPublic = await confirm({
    message: 'Open public result site for early results?',
    default: false,
  });
  if (openPublic) {
    openBrowser('https://iporesult.cdsc.com.np');
  }

  // Send email notification
  const config = readRawConfig();
  if (config.email && config.email.events.resultOut) {
    try {
      const emailPassword = decryptEmailPassword(masterPassword, config.email.appPassword);
      await sendNotification(
        { ...config.email, appPassword: emailPassword },
        'IPO Result Check',
        `Checked ${results.length} result(s) across ${accounts.length} account(s).\n\n` +
        `Allotted: ${allotted.length}\nNot Allotted: ${notAllotted.length}\n\n` +
        `Details:\n${results.map((r) => `${r.accountName} - ${r.company}: ${r.status}${r.kitta ? ` (applied: ${r.kitta})` : ''}${r.receivedKitta ? ` (received: ${r.receivedKitta})` : ''}`).join('\n')}`,
      );
      log.success('Email notification sent.');
    } catch (err) {
      log.warn(`Failed to send email: ${(err as Error).message}`);
    }
  }
}

async function checkAccountResults(account: Account): Promise<IPOResult[]> {
  const results: IPOResult[] = [];

  try {
    const loginResult = await login(account.dpId, account.username, account.password);
    const token = loginResult.token;

    const reports = await getApplicationReports(token);

    for (const report of reports) {
      const raw = report as unknown as Record<string, unknown>;
      const reportId = raw.applicantFormId ?? raw.id ?? raw.companyShareId;

      // Try to get detail if we have a valid ID
      let receivedKitta: number | undefined;
      let appliedKitta: number | undefined = report.appliedKitta;
      if (reportId !== undefined) {
        try {
          const detail = await getApplicationDetail(token, reportId as number);
          receivedKitta = detail.receivedKitta;
          if (!appliedKitta && detail.appliedKitta) {
            appliedKitta = detail.appliedKitta;
          }
        } catch {
          // detail fetch is non-critical
        }
      }

      // Determine allotment status from receivedKitta (the true signal)
      const statusLower = (report.statusName || '').toLowerCase();
      let status: IPOResult['status'];
      if (receivedKitta !== undefined && receivedKitta > 0) {
        status = 'allotted';
      } else if (statusLower.includes('transaction_success') || statusLower.includes('not') || statusLower.includes('rejected')) {
        status = 'not_allotted';
      } else if (statusLower.includes('block_failed') || statusLower.includes('error')) {
        status = 'error';
      } else {
        // APPROVED, TRANSACTION_PENDING, etc. — completed but no allocation
        status = 'not_allotted';
      }

      results.push({
        accountName: account.username,
        boid: account.boid,
        company: report.companyName || 'Unknown',
        status,
        kitta: appliedKitta,
        receivedKitta,
        message: report.statusName || 'Unknown',
      });
    }

    await logout(token);
  } catch (err) {
    results.push({
      accountName: account.username,
      boid: account.boid,
      company: '-',
      status: 'error',
      message: `Login/fetch failed: ${(err as Error).message}`,
    });
  }

  return results;
}

function openBrowser(url: string): void {
  const platform = os.platform();
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`, (err) => {
    if (err) {
      log.dim(`Open manually: ${url}`);
    } else {
      log.success('Opened in browser.');
    }
  });
}
