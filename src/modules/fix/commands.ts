import { checkbox, number, password as askPassword, select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AppContext } from '../../platform/context/public.js';
import { defineCommand } from '../../platform/command/public.js';
import { friendlyMessage } from '../../platform/meroshare/public.js';
import { createSpinner, generatePassword, log, typedYes, unlockStore } from '../../platform/terminal/public.js';
import { accountId, accountRef, findAccount, type Account } from '../accounts/public.js';
import { cachedReports, checkSession, recordHealth, type HealthReport } from '../health/public.js';
import { canChangePassword, changePassword, checkPassword, describePolicy, getPolicy } from '../password/public.js';
import { chargeLines, listPartners, maxYears, paymentTypeLabel, renewalDetails, startPayment } from '../renewal/public.js';
import { closeSession, openSession, type Session } from '../session/public.js';

type FixKind = 'password' | 'renewal' | 'pin';

/** What needs fixing, from the login flags and the account's details. */
export function fixesFor(session: Session, report: HealthReport | undefined): FixKind[] {
  const kinds = new Set<FixKind>(session.blocked.map((b) => b.fix));
  if (session.flags.passwordPolicyChanged) kinds.add('password');
  for (const f of report?.findings ?? []) {
    if (f.fix === 'password' || f.fix === 'renewal' || f.fix === 'pin') kinds.add(f.fix);
  }
  return (['pin', 'password', 'renewal'] as const).filter((k) => kinds.has(k));
}

function explainPin(account: Account): void {
  log.warn(`The transaction PIN of ${account.name} is not set, or was reset.`);
  console.log(
    '  ipo cannot set it. Log in at https://meroshare.cdsc.com.np, set the PIN there, then run\n' +
      `  "ipo init edit" to store the new PIN, and "ipo doctor" to check.`,
  );
}

async function fixPassword(ctx: AppContext, session: Session): Promise<void> {
  if (!canChangePassword(session)) {
    return log.error(`MeroShare blocks more than the password: ${session.blocked.map((b) => b.message).join('; ')}.`);
  }
  const { policy, fromServer } = await getPolicy(ctx, session);
  log.info(`Password rules${fromServer ? '' : ' (MeroShare did not send them; using the usual ones)'}: ${describePolicy(policy)}`);
  const how = await select({
    message: 'New password:',
    choices: [
      { name: 'Generate a strong one (you can view it later with "ipo accounts password")', value: 'generate' },
      { name: 'Type my own', value: 'type' },
    ],
  });
  let pw: string;
  if (how === 'generate') {
    pw = generatePassword(policy);
  } else {
    for (;;) {
      pw = await askPassword({ message: 'New MeroShare password:', mask: '*' });
      const problems = checkPassword(policy, pw, session.account.password);
      if (problems.length) {
        log.warn(`It needs: ${problems.join(', ')}.`);
        continue;
      }
      if ((await askPassword({ message: 'Type it again:', mask: '*' })) === pw) break;
      log.warn('The two did not match.');
    }
  }
  console.log(chalk.bold('\n  Summary'));
  console.log(`  Account:  ${session.account.name} (${session.account.username})`);
  console.log(`  New:      ${how === 'generate' ? 'a generated password' : 'the password you typed'}`);
  console.log('  ipo stores it encrypted, and sends the change to MeroShare once.\n');
  if (!(await typedYes('Change the MeroShare password now?'))) return log.info('Cancelled. Nothing was sent.');
  const spinner = createSpinner('Changing the password...').start();
  const out = await changePassword(ctx, session, pw);
  if (out.status === 'changed') spinner.succeed(`Password changed. To see it: ipo accounts password ${accountRef(session.account)}`);
  else if (out.status === 'rejected') spinner.fail(`MeroShare refused the change: ${out.message}. The old password is kept.`);
  else if (out.status === 'blocked') spinner.fail(out.message);
  else spinner.warn(`No clear answer from MeroShare (${out.message}). The new password is kept as pending; the next login tries both. Run "ipo doctor" to settle it.`);
}

async function fixRenewal(ctx: AppContext, session: Session): Promise<void> {
  const partners = await listPartners(ctx, session);
  if (!partners.length) return log.error('MeroShare lists no payment partner.');
  const partner = await select({ message: 'Pay with:', choices: partners.map((p) => ({ name: p.name, value: p })) });
  const details = await renewalDetails(ctx, session, partner);
  console.log(chalk.bold('\n  Renewal charges from MeroShare'));
  for (const l of chargeLines(details)) console.log(`  ${l}`);
  const types = details.paymentTypeList ?? [];
  const chosen = types.length
    ? await checkbox({ message: 'What to renew:', choices: types.map((t) => ({ name: paymentTypeLabel(t), value: t, checked: true })), required: true })
    : [];
  const most = maxYears(details);
  const years = most > 1 ? ((await number({ message: `Years (1 to ${most}):`, default: 1, min: 1, max: most })) ?? 1) : 1;
  console.log(chalk.bold('\n  Summary'));
  console.log(`  Account:  ${session.account.name}`);
  console.log(`  Partner:  ${partner.name}`);
  if (chosen.length) console.log(`  Renew:    ${chosen.map(paymentTypeLabel).join(', ')}`);
  console.log(`  Years:    ${years}`);
  console.log(`  You pay on ${partner.name}'s own page. ipo never sees your wallet details.\n`);
  if (!(await typedYes('Open the payment page?'))) return log.info('Cancelled. Nothing was sent.');
  const { file } = await startPayment(ctx, session, { partner, paymentTypes: chosen, years });
  log.success(`Payment page opened in the browser (${file}).`);
  log.dim('After you pay, run "ipo doctor" to check the new expiry date.');
}

export const fixCommand = defineCommand({
  name: 'fix',
  description: 'Fix an account: change an expired password, renew MeroShare or DEMAT, or explain the PIN',
  args: [{ name: 'account', description: 'account name, username or number', required: true }],
  async handler({ args }, ctx) {
    await unlockStore(ctx.store);
    const account = findAccount(ctx, args[0]);
    const spinner = createSpinner(`Logging in to ${account.name}...`).start();
    let session: Session;
    try {
      session = await openSession(ctx, account);
      spinner.stop();
    } catch (err) {
      spinner.fail(friendlyMessage(err));
      return log.info('If the password was changed on the MeroShare site, store it with "ipo init edit".');
    }
    try {
      const report = await checkSession(ctx, session);
      recordHealth(ctx, [report]);
      const cached = cachedReports(ctx).find((r) => accountId(r.account) === accountId(account));
      const kinds = fixesFor(session, cached ?? report);
      if (!kinds.length) return log.success(`${account.name}: nothing to fix.`);
      for (const f of report.findings) if (f.severity !== 'ok') log.warn(f.message);
      const kind = kinds.length === 1 ? kinds[0] : await select({ message: 'Fix which?', choices: kinds.map((k) => ({ name: k, value: k })) });
      if (kind === 'pin') explainPin(account);
      else if (kind === 'password') await fixPassword(ctx, session);
      else await fixRenewal(ctx, session);
    } finally {
      await closeSession(ctx, session);
    }
  },
});
