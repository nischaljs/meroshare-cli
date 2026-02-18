import { password, confirm, number } from '@inquirer/prompts';
import chalk from 'chalk';
import pLimit from 'p-limit';
import { configExists, getDecryptedAccounts, verifyMasterPassword, readRawConfig, decryptEmailPassword } from '../store/config.js';
import { login, logout } from '../api/auth.js';
import { getOpenIPOs, applyIPO } from '../api/ipo.js';
import { getUserBanks, getBankDetail } from '../api/bank.js';
import { log } from '../utils/logger.js';
import { createSpinner, createTable, formatStatus, randomDelay } from '../utils/ui.js';
import { sendNotification } from '../notifications/email.js';
import type { Account, ApplyResult, OpenIPO } from '../store/types.js';

export async function applyCommand(): Promise<void> {
  console.log(chalk.bold('\n  IPO Apply\n'));

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
    log.error('No accounts configured. Run "ipo init" first.');
    return;
  }

  log.info(`Loaded ${accounts.length} account(s)`);

  // Login with first account to fetch open IPOs
  const spinner = createSpinner('Fetching open IPOs...');
  spinner.start();

  let openIPOs: OpenIPO[];
  let firstToken: string;
  try {
    const loginResult = await login(accounts[0].dpId, accounts[0].username, accounts[0].password);
    firstToken = loginResult.token;
    openIPOs = await getOpenIPOs(firstToken);
    await logout(firstToken);
    spinner.succeed(`Found ${openIPOs.length} open IPO(s)`);
  } catch (err) {
    spinner.fail('Failed to fetch open IPOs');
    log.error((err as Error).message);
    return;
  }

  if (openIPOs.length === 0) {
    log.info('No open IPOs available right now.');
    return;
  }

  // Display open IPOs
  const ipoTable = createTable(
    ['#', 'Company', 'Type', 'Group', 'Open', 'Close', 'Min', 'Max', 'Price'],
    openIPOs.map((ipo, i) => [
      String(i + 1),
      ipo.companyName,
      ipo.shareTypeName || '-',
      ipo.shareGroupName || '-',
      ipo.issueOpenDate || '-',
      ipo.issueCloseDate || '-',
      String(ipo.minUnit || '-'),
      String(ipo.maxUnit || '-'),
      String(ipo.shareValue || '-'),
    ]),
  );
  console.log(ipoTable);

  // Select IPOs — confirm each one
  const selectedIPOs: number[] = [];
  for (let i = 0; i < openIPOs.length; i++) {
    const ipo = openIPOs[i];
    const apply = await confirm({
      message: `Apply for ${ipo.companyName} (${ipo.shareGroupName || ipo.shareTypeName})?`,
      default: true,
    });
    if (apply) {
      selectedIPOs.push(i);
    }
  }

  if (selectedIPOs.length === 0) {
    log.info('No IPOs selected.');
    return;
  }

  // Get kitta for each selected IPO
  const kittaMap = new Map<number, number>();
  for (const idx of selectedIPOs) {
    const ipo = openIPOs[idx];
    const kitta = await number({
      message: `Kitta for ${ipo.companyName} (min: ${ipo.minUnit}, max: ${ipo.maxUnit}):`,
      default: ipo.minUnit || 10,
      min: ipo.minUnit || 1,
      max: ipo.maxUnit || 100,
    }) ?? ipo.minUnit ?? 10;
    kittaMap.set(idx, kitta);
  }

  // Confirmation
  console.log(chalk.bold('\n  Application Summary\n'));
  for (const idx of selectedIPOs) {
    const ipo = openIPOs[idx];
    log.info(`${ipo.companyName}: ${kittaMap.get(idx)} kitta x ${accounts.length} accounts`);
  }

  const confirmInput = await password({
    message: 'Press Enter to confirm (or Ctrl+C to cancel):',
    mask: '',
  });

  // Bulk apply
  const limit = pLimit(3);
  const results: ApplyResult[] = [];

  for (const idx of selectedIPOs) {
    const ipo = openIPOs[idx];
    const kitta = kittaMap.get(idx)!;

    console.log(chalk.bold(`\n  Applying for ${ipo.companyName}...\n`));

    const tasks = accounts.map((account) =>
      limit(async () => {
        await randomDelay();
        return applyForAccount(account, ipo, kitta);
      }),
    );

    const ipoResults = await Promise.all(tasks);
    results.push(...ipoResults);
  }

  // Display results
  console.log(chalk.bold('\n  Results\n'));
  const resultTable = createTable(
    ['Username', 'Company', 'Status', 'Message'],
    results.map((r) => [
      r.accountName,
      r.company,
      formatStatus(r.status),
      r.message.length > 60 ? r.message.substring(0, 57) + '...' : r.message,
    ]),
  );
  console.log(resultTable);

  // Send email notification
  const config = readRawConfig();
  if (config.email && config.email.events.applied) {
    try {
      const emailPassword = decryptEmailPassword(masterPassword, config.email.appPassword);
      const successCount = results.filter((r) => r.status === 'success').length;
      const failCount = results.filter((r) => r.status === 'error').length;
      await sendNotification(
        {
          ...config.email,
          appPassword: emailPassword,
        },
        'IPO Application Results',
        `Applied to ${selectedIPOs.length} IPO(s) across ${accounts.length} account(s).\n\nSuccess: ${successCount}\nFailed: ${failCount}\n\nDetails:\n${results.map((r) => `${r.accountName} - ${r.company}: ${r.status} (${r.message})`).join('\n')}`,
      );
      log.success('Email notification sent.');
    } catch (err) {
      log.warn(`Failed to send email: ${(err as Error).message}`);
    }
  }
}

async function applyForAccount(
  account: Account,
  ipo: OpenIPO,
  kitta: number,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    accountName: account.username,
    boid: account.boid,
    company: ipo.companyName,
    status: 'error',
    message: '',
  };

  try {
    const loginResult = await login(account.dpId, account.username, account.password);
    const token = loginResult.token;

    // Fetch bank details fresh (like MeroShare frontend does)
    const banks = await getUserBanks(token);
    if (banks.length === 0) {
      throw new Error('No bank accounts found');
    }

    // Use the first bank (or match by stored bankId if available)
    const selectedBank = account.bankId
      ? banks.find((b) => b.id === account.bankId) || banks[0]
      : banks[0];

    const bankDetail = await getBankDetail(token, selectedBank.id);

    const response = await applyIPO({
      token,
      companyShareId: ipo.companyShareId,
      kitta,
      demat: account.boid, // full 16-digit BOID as demat
      boid: account.username, // short 8-char BOID
      accountNumber: bankDetail.accountNumber || '',
      customerId: bankDetail.id || bankDetail.customerId || 0, // bank detail "id" is the customerId
      accountBranchId: bankDetail.accountBranchId || 0,
      accountTypeId: bankDetail.accountTypeId || 1,
      bankId: selectedBank.id,
      crn: account.crn,
      pin: account.pin,
    });

    await logout(token);
    result.status = 'success';
    result.message = response.message;
  } catch (err) {
    const msg = (err as Error).message;
    // Handle known API errors with friendly messages
    if (msg.includes('409') || msg.toLowerCase().includes('application in process')) {
      result.message = 'Already applied';
    } else {
      const jsonMatch = msg.match(/"message"\s*:\s*"([^"]+)"/);
      result.message = jsonMatch ? jsonMatch[1] : msg;
    }
  }

  const statusIcon = result.status === 'success' ? chalk.green('✓') : chalk.red('✗');
  console.log(`  ${statusIcon} ${account.username}: ${result.message}`);

  return result;
}
