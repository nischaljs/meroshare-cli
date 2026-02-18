import { input, password, number, search, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  configExists,
  createConfig,
  readRawConfig,
  writeConfig,
  verifyMasterPassword,
  getDecryptedAccounts,
  encryptAccountFields,
  updateAccount,
  removeAccount,
} from '../store/config.js';
import { deriveKey } from '../store/crypto.js';
import { getDPList, getUserBanks, getBankDetail } from '../api/bank.js';
import { login } from '../api/auth.js';
import { log } from '../utils/logger.js';
import { createSpinner, createTable } from '../utils/ui.js';
import type { Account, DPItem } from '../store/types.js';

// ─── Shared: collect one account via prompts ───────────────────────────

async function collectAccount(dpList: DPItem[]): Promise<Account | null> {
  const dpId = await search<number>({
    message: 'Select your DP (broker/bank):',
    source: async (term) => {
      const filtered = term
        ? dpList.filter((dp) => dp.name.toLowerCase().includes(term.toLowerCase()))
        : dpList;
      return filtered.map((dp) => ({
        name: `${dp.name} (${dp.id})`,
        value: dp.id,
      }));
    },
  });

  const selectedDP = dpList.find((dp) => dp.id === dpId)!;

  const username = await input({ message: 'MeroShare username (BOID last 8 digits):' });
  const pwd = await password({ message: 'MeroShare password:', mask: '*' });
  const boid = await input({ message: 'Full BOID (16 digits):' });

  // Validate login
  const loginSpinner = createSpinner('Validating login...');
  loginSpinner.start();

  let token: string;
  let demat: string;
  let accountName: string;
  try {
    const loginResult = await login(dpId, username, pwd);
    token = loginResult.token;
    demat = loginResult.demat;
    accountName = loginResult.name || username;
    loginSpinner.succeed(`Logged in as ${chalk.green(accountName)}`);
  } catch (err) {
    loginSpinner.fail('Login failed');
    log.error((err as Error).message);
    return null;
  }

  // Fetch bank details
  const bankSpinner = createSpinner('Fetching bank details...');
  bankSpinner.start();

  let bankId: number;
  let bankName: string;
  let accountBranchId: number;
  let accountNumber: string;
  let customerId: number;

  try {
    const banks = await getUserBanks(token);
    if (banks.length === 0) {
      bankSpinner.fail('No bank accounts found');
      return null;
    }

    // If multiple banks, let user pick
    let selectedBank = banks[0];
    if (banks.length > 1) {
      bankSpinner.stop();
      const bankIdx = await select<number>({
        message: 'Select bank account:',
        choices: banks.map((b, i) => ({
          name: `${b.name || b.bankName || `Bank ${b.id}`}`,
          value: i,
        })),
      });
      selectedBank = banks[bankIdx];
      bankSpinner.start();
    }

    // Fetch full detail for selected bank
    const detail = await getBankDetail(token, selectedBank.id);
    bankId = selectedBank.id;
    bankName = detail.bankName || selectedBank.name || selectedBank.bankName || 'Bank';
    accountNumber = detail.accountNumber || '';
    accountBranchId = detail.accountBranchId || 0;
    customerId = detail.customerId || 0;
    bankSpinner.succeed(`Bank: ${chalk.green(bankName)} (${accountNumber || 'N/A'})`);
  } catch (err) {
    bankSpinner.fail('Failed to fetch bank details');
    log.error((err as Error).message);
    return null;
  }

  const crn = await input({ message: 'CRN number:' });
  const pin = await password({ message: 'Transaction PIN:', mask: '*' });

  return {
    name: accountName,
    dpId,
    dpName: selectedDP.name,
    username,
    password: pwd,
    boid,
    crn,
    pin,
    bankId,
    bankName,
    accountBranchId,
    accountNumber,
    customerId,
    demat,
  };
}

async function fetchDPList(): Promise<DPItem[] | null> {
  const spinner = createSpinner('Fetching DP list...');
  spinner.start();
  try {
    const dpList = await getDPList();
    spinner.succeed(`Loaded ${dpList.length} DPs`);
    return dpList;
  } catch (err) {
    spinner.fail('Failed to fetch DP list');
    log.error((err as Error).message);
    return null;
  }
}

async function promptMasterPassword(): Promise<string | null> {
  const pwd = await password({ message: 'Master password:', mask: '*' });
  if (!verifyMasterPassword(pwd)) {
    log.error('Invalid master password.');
    return null;
  }
  return pwd;
}

// ─── Commands ──────────────────────────────────────────────────────────

export async function initCommand(): Promise<void> {
  console.log(chalk.bold('\n  IPO CLI Setup Wizard\n'));

  if (configExists()) {
    log.warn('Config already exists. This will create a fresh config.');
    const ok = await input({ message: 'Type "yes" to continue and overwrite:' });
    if (ok !== 'yes') {
      log.info('Cancelled.');
      return;
    }
  }

  const masterPassword = await password({ message: 'Set master password:', mask: '*' });
  if (masterPassword.length < 6) {
    log.error('Master password must be at least 6 characters.');
    return;
  }
  const confirmPwd = await password({ message: 'Confirm master password:', mask: '*' });
  if (masterPassword !== confirmPwd) {
    log.error('Passwords do not match.');
    return;
  }

  const config = createConfig(masterPassword);
  log.success('Master password set and config created.');

  const dpList = await fetchDPList();
  if (!dpList) return;

  const accountCount = (await number({
    message: 'How many MeroShare accounts to add?',
    default: 1,
    min: 1,
    max: 50,
  })) ?? 1;

  const key = deriveKey(masterPassword, config.salt);

  for (let i = 0; i < accountCount; i++) {
    console.log(chalk.bold(`\n  Account ${i + 1} of ${accountCount}\n`));

    const account = await collectAccount(dpList);
    if (!account) {
      log.warn('Skipping this account. You can add it later with "ipo init add".');
      continue;
    }

    const encrypted = encryptAccountFields(account, key);
    const currentConfig = readRawConfig();
    currentConfig.accounts.push(encrypted);
    writeConfig(currentConfig);

    log.success(`Account "${account.name}" added successfully.`);
  }

  const finalConfig = readRawConfig();
  console.log(
    chalk.bold(`\n  Setup complete! ${finalConfig.accounts.length} account(s) configured.\n`),
  );
  log.dim('Config saved to ~/.ipo/config.json');
  if (finalConfig.accounts.length < accountCount) {
    log.dim('Tip: add skipped accounts later with "ipo init add"');
  }
}

export async function initAddCommand(): Promise<void> {
  console.log(chalk.bold('\n  Add Account\n'));

  if (!configExists()) {
    log.error('No config found. Run "ipo init" first.');
    return;
  }

  const masterPassword = await promptMasterPassword();
  if (!masterPassword) return;

  const dpList = await fetchDPList();
  if (!dpList) return;

  const account = await collectAccount(dpList);
  if (!account) {
    log.error('Account setup failed.');
    return;
  }

  const config = readRawConfig();
  const key = deriveKey(masterPassword, config.salt);
  const encrypted = encryptAccountFields(account, key);
  config.accounts.push(encrypted);
  writeConfig(config);

  log.success(`Account "${account.name}" added. Total: ${config.accounts.length} account(s).`);
}

export async function initListCommand(): Promise<void> {
  console.log(chalk.bold('\n  Configured Accounts\n'));

  if (!configExists()) {
    log.error('No config found. Run "ipo init" first.');
    return;
  }

  const config = readRawConfig();

  if (config.accounts.length === 0) {
    log.info('No accounts configured. Run "ipo init add" to add one.');
    return;
  }

  const rows = config.accounts.map((acc, i) => [
    String(i + 1),
    acc.name,
    acc.dpName,
    acc.username,
    acc.boid,
    acc.bankName,
  ]);

  console.log(createTable(['#', 'Name', 'DP', 'Username', 'BOID', 'Bank'], rows));
  console.log(chalk.dim(`  ${config.accounts.length} account(s) total\n`));
}

export async function initEditCommand(): Promise<void> {
  console.log(chalk.bold('\n  Edit Account\n'));

  if (!configExists()) {
    log.error('No config found. Run "ipo init" first.');
    return;
  }

  const masterPassword = await promptMasterPassword();
  if (!masterPassword) return;

  const accounts = getDecryptedAccounts(masterPassword);
  if (accounts.length === 0) {
    log.info('No accounts to edit.');
    return;
  }

  const index = await select<number>({
    message: 'Select account to edit:',
    choices: accounts.map((acc, i) => ({
      name: `${acc.name} (${acc.boid}) — ${acc.dpName}`,
      value: i,
    })),
  });

  const existing = accounts[index];
  console.log(chalk.dim(`\n  Editing: ${existing.name} (${existing.boid})`));
  console.log(chalk.dim('  Press Enter to keep current value.\n'));

  const dpList = await fetchDPList();
  if (!dpList) return;

  // Let user re-enter or keep each field
  const dpId = await search<number>({
    message: `DP [current: ${existing.dpName}]:`,
    source: async (term) => {
      const filtered = term
        ? dpList.filter((dp) => dp.name.toLowerCase().includes(term.toLowerCase()))
        : dpList;
      return filtered.map((dp) => ({
        name: `${dp.name} (${dp.id})`,
        value: dp.id,
      }));
    },
  });
  const selectedDP = dpList.find((dp) => dp.id === dpId)!;

  const username = await input({
    message: `Username [${existing.username}]:`,
    default: existing.username,
  });

  const pwd = await password({ message: 'Password (enter new or re-enter current):', mask: '*' });

  const boid = await input({
    message: `BOID [${existing.boid}]:`,
    default: existing.boid,
  });

  // Validate login with new credentials
  const loginSpinner = createSpinner('Validating login...');
  loginSpinner.start();

  let token: string;
  let demat: string;
  let accountName: string;
  try {
    const loginResult = await login(dpId, username, pwd);
    token = loginResult.token;
    demat = loginResult.demat;
    accountName = loginResult.name || username;
    loginSpinner.succeed(`Logged in as ${chalk.green(accountName)}`);
  } catch (err) {
    loginSpinner.fail('Login failed');
    log.error((err as Error).message);
    return;
  }

  // Re-fetch bank details
  const bankSpinner = createSpinner('Fetching bank details...');
  bankSpinner.start();

  let bankId: number;
  let bankName: string;
  let accountBranchId: number;
  let accountNumber: string;
  let customerId: number;

  try {
    const banks = await getUserBanks(token);
    if (banks.length === 0) {
      bankSpinner.fail('No bank accounts found');
      return;
    }

    let selectedBank = banks[0];
    if (banks.length > 1) {
      bankSpinner.stop();
      const bankIdx = await select<number>({
        message: 'Select bank account:',
        choices: banks.map((b, i) => ({
          name: `${b.name || b.bankName || `Bank ${b.id}`}`,
          value: i,
        })),
      });
      selectedBank = banks[bankIdx];
      bankSpinner.start();
    }

    const detail = await getBankDetail(token, selectedBank.id);
    bankId = selectedBank.id;
    bankName = detail.bankName || selectedBank.name || selectedBank.bankName || 'Bank';
    accountNumber = detail.accountNumber || '';
    accountBranchId = detail.accountBranchId || 0;
    customerId = detail.customerId || 0;
    bankSpinner.succeed(`Bank: ${chalk.green(bankName)} (${accountNumber || 'N/A'})`);
  } catch (err) {
    bankSpinner.fail('Failed to fetch bank details');
    log.error((err as Error).message);
    return;
  }

  const crn = await input({
    message: `CRN [${existing.crn}]:`,
    default: existing.crn,
  });

  const pin = await password({ message: 'Transaction PIN:', mask: '*' });

  const updated: Account = {
    name: accountName,
    dpId,
    dpName: selectedDP.name,
    username,
    password: pwd,
    boid,
    crn,
    pin: pin || existing.pin,
    bankId,
    bankName,
    accountBranchId,
    accountNumber,
    customerId,
    demat,
  };

  updateAccount(masterPassword, index, updated);
  log.success(`Account "${accountName}" updated.`);
}

export async function initRemoveCommand(): Promise<void> {
  console.log(chalk.bold('\n  Remove Account\n'));

  if (!configExists()) {
    log.error('No config found.');
    return;
  }

  const masterPassword = await promptMasterPassword();
  if (!masterPassword) return;

  const accounts = getDecryptedAccounts(masterPassword);
  if (accounts.length === 0) {
    log.info('No accounts to remove.');
    return;
  }

  const index = await select<number>({
    message: 'Select account to remove:',
    choices: accounts.map((acc, i) => ({
      name: `${acc.name} (${acc.boid}) — ${acc.dpName}`,
      value: i,
    })),
  });

  const acc = accounts[index];
  const ok = await confirm({
    message: `Remove "${acc.name}" (${acc.boid})?`,
    default: false,
  });

  if (!ok) {
    log.info('Cancelled.');
    return;
  }

  removeAccount(index);
  log.success(`Account "${acc.name}" removed.`);
}
