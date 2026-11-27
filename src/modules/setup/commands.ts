import { input, number, password, search, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AppContext } from '../../platform/context/public.js';
import { defineCommand } from '../../platform/command/public.js';
import { friendlyMessage } from '../../platform/meroshare/public.js';
import { createSpinner, createTable, log, typedYes, unlockStore } from '../../platform/terminal/public.js';
import { closeSession, openSession } from '../session/public.js';
import {
  accountId,
  addAccount,
  findAccount,
  getBankDetail,
  getBanks,
  getDpList,
  listAccounts,
  removeAccount,
  updateAccount,
  type Account,
} from '../accounts/public.js';

type Dp = Awaited<ReturnType<typeof getDpList>>[number];

async function fetchDps(ctx: AppContext): Promise<Dp[] | null> {
  const spinner = createSpinner('Fetching DP list...').start();
  try {
    const dps = await getDpList(ctx);
    spinner.succeed(`Loaded ${dps.length} DPs`);
    return dps;
  } catch (err) {
    spinner.fail(`Failed to fetch DP list: ${friendlyMessage(err)}`);
    return null;
  }
}

/** Asks for one account and checks it by logging in. Null when the login or bank read fails. */
async function collectAccount(ctx: AppContext, dps: Dp[], existing?: Account): Promise<Account | null> {
  const dpId = await search<number>({
    message: existing ? `DP [current: ${existing.dpName}]:` : 'Select your DP (broker/bank):',
    source: async (term) =>
      (term ? dps.filter((dp) => dp.name.toLowerCase().includes(term.toLowerCase())) : dps).map((dp) => ({
        name: `${dp.name} (${dp.id})`,
        value: dp.id,
      })),
  });
  const dp = dps.find((d) => d.id === dpId)!;
  const username = await input({ message: 'MeroShare username (BOID last 8 digits):', default: existing?.username });
  const pwd = await password({ message: existing ? 'Password (new or current):' : 'MeroShare password:', mask: '*' });
  const boid = await input({ message: 'Full BOID (16 digits):', default: existing?.boid });

  const draft: Account = {
    name: existing?.name ?? username,
    dpId,
    dpName: dp.name,
    username,
    password: pwd,
    pendingPassword: '',
    boid,
    crn: existing?.crn ?? '',
    pin: existing?.pin ?? '',
    bankId: 0,
    bankName: '',
    accountBranchId: 0,
    accountNumber: '',
    customerId: 0,
    demat: '',
  };

  const spinner = createSpinner('Validating login...').start();
  let session;
  try {
    session = await openSession(ctx, draft);
    spinner.succeed(`Logged in as ${chalk.green(session.name)}`);
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err));
    return null;
  }
  if (session.blocked.length) {
    log.warn(`MeroShare reports: ${session.blocked.map((b) => b.message).join('; ')}. The account is saved; run "ipo doctor" after setup.`);
  }

  try {
    if (session.blocked.length) {
      draft.name = session.name;
      draft.demat = session.demat;
    } else {
      const bankSpinner = createSpinner('Fetching bank details...').start();
      const banks = await getBanks(ctx, session);
      if (!banks.length) {
        bankSpinner.fail('No bank account is linked in MeroShare');
        return null;
      }
      let bank = banks[0];
      if (banks.length > 1) {
        bankSpinner.stop();
        const i = await select<number>({
          message: 'Select bank account:',
          choices: banks.map((b, idx) => ({ name: b.name || b.bankName || `Bank ${b.id}`, value: idx })),
        });
        bank = banks[i];
        bankSpinner.start();
      }
      const detail = await getBankDetail(ctx, session, bank.id);
      Object.assign(draft, {
        name: session.name,
        demat: session.demat,
        bankId: bank.id,
        bankName: detail.bankName || bank.name || bank.bankName || 'Bank',
        accountNumber: detail.accountNumber || '',
        accountBranchId: detail.accountBranchId || 0,
        customerId: detail.customerId || 0,
      });
      bankSpinner.succeed(`Bank: ${chalk.green(draft.bankName)} (${draft.accountNumber || 'N/A'})`);
    }
  } catch (err) {
    log.error(`Failed to fetch bank details: ${friendlyMessage(err)}`);
    return null;
  } finally {
    await closeSession(ctx, session);
  }

  draft.crn = await input({ message: 'CRN number:', default: existing?.crn });
  const pin = await password({ message: existing ? 'Transaction PIN (Enter keeps the current one):' : 'Transaction PIN:', mask: '*' });
  draft.pin = pin || existing?.pin || '';
  return draft;
}

async function pickAccount(ctx: AppContext, verb: string): Promise<Account | null> {
  const accounts = listAccounts(ctx);
  if (!accounts.length) {
    log.info(`No accounts to ${verb}.`);
    return null;
  }
  const i = await select<number>({
    message: `Select account to ${verb}:`,
    choices: accounts.map((a, idx) => ({ name: `${a.name} (${a.boid}) - ${a.dpName}`, value: idx })),
  });
  return accounts[i];
}

const setup = defineCommand({
  name: 'setup',
  description: 'Full setup wizard (master password + accounts)',
  isDefault: true,
  async handler(_input, ctx) {
    console.log(chalk.bold('\n  IPO CLI Setup Wizard\n'));
    if (ctx.store.exists()) {
      log.warn('Config already exists. This will create a fresh config.');
      if (!(await typedYes('Overwrite it?'))) return log.info('Cancelled.');
    }
    const master = await password({ message: 'Set master password:', mask: '*' });
    if (master.length < 6) return log.error('Master password must be at least 6 characters.');
    if ((await password({ message: 'Confirm master password:', mask: '*' })) !== master) return log.error('Passwords do not match.');
    ctx.store.create(master);
    log.success('Master password set and config created.');
    const dps = await fetchDps(ctx);
    if (!dps) return;
    const count = (await number({ message: 'How many MeroShare accounts to add?', default: 1, min: 1, max: 50 })) ?? 1;
    for (let i = 0; i < count; i++) {
      console.log(chalk.bold(`\n  Account ${i + 1} of ${count}\n`));
      const account = await collectAccount(ctx, dps);
      if (!account) {
        log.warn('Skipping this account. You can add it later with "ipo init add".');
        continue;
      }
      addAccount(ctx, account);
      log.success(`Account "${account.name}" added.`);
    }
    console.log(chalk.bold(`\n  Setup complete! ${listAccounts(ctx).length} account(s) configured.\n`));
    log.dim(`Config saved to ${ctx.store.path}`);
  },
});

const add = defineCommand({
  name: 'add',
  description: 'Add a new account',
  async handler(_input, ctx) {
    await unlockStore(ctx.store);
    const dps = await fetchDps(ctx);
    if (!dps) return;
    const account = await collectAccount(ctx, dps);
    if (!account) return log.error('Account setup failed.');
    const total = addAccount(ctx, account);
    log.success(`Account "${account.name}" added. Total: ${total} account(s).`);
  },
});

const list = defineCommand({
  name: 'list',
  description: 'List all configured accounts',
  async handler(_input, ctx) {
    if (!ctx.store.exists()) return log.error('No config found. Run "ipo init" first.');
    const accounts = listAccounts(ctx);
    if (!accounts.length) return log.info('No accounts configured. Run "ipo init add" to add one.');
    console.log(
      createTable(
        ['#', 'Name', 'DP', 'Username', 'BOID', 'Bank'],
        accounts.map((a, i) => [String(i + 1), a.name, a.dpName, a.username, a.boid, a.bankName]),
      ),
    );
    console.log(chalk.dim(`  ${accounts.length} account(s) total\n`));
  },
});

const edit = defineCommand({
  name: 'edit',
  description: 'Edit an existing account',
  async handler(_input, ctx) {
    await unlockStore(ctx.store);
    const existing = await pickAccount(ctx, 'edit');
    if (!existing) return;
    console.log(chalk.dim(`\n  Editing: ${existing.name} (${existing.boid}). Press Enter to keep a value.\n`));
    const dps = await fetchDps(ctx);
    if (!dps) return;
    const next = await collectAccount(ctx, dps, existing);
    if (!next) return;
    updateAccount(ctx, accountId(existing), () => next);
    log.success(`Account "${next.name}" updated.`);
  },
});

const remove = defineCommand({
  name: 'remove',
  description: 'Remove an account',
  async handler(_input, ctx) {
    await unlockStore(ctx.store);
    const acc = await pickAccount(ctx, 'remove');
    if (!acc) return;
    if (!(await confirm({ message: `Remove "${acc.name}" (${acc.boid})?`, default: false }))) return log.info('Cancelled.');
    removeAccount(ctx, accountId(acc));
    log.success(`Account "${acc.name}" removed.`);
  },
});

export const initCommand = defineCommand({
  name: 'init',
  description: 'Setup and manage MeroShare accounts',
  subcommands: [setup, add, list, edit, remove],
});

const showPassword = defineCommand({
  name: 'password',
  description: 'Show the stored MeroShare password of an account (asks for the master password)',
  args: [{ name: 'account', description: 'account name, username or number', required: true }],
  async handler({ args }, ctx) {
    await unlockStore(ctx.store);
    const a = findAccount(ctx, args[0]);
    console.log(`${a.name}: ${a.password}`);
    if (a.pendingPassword) log.warn(`A password change was not confirmed. If the one above fails, the new one is: ${a.pendingPassword}`);
  },
});

export const accountsCommand = defineCommand({
  name: 'accounts',
  description: 'Account details',
  subcommands: [showPassword],
});
