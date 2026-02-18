import cron from 'node-cron';
import { readRawConfig, getDecryptedAccounts, decryptEmailPassword } from '../store/config.js';
import { login, logout } from '../api/auth.js';
import { getOpenIPOs, applyIPO } from '../api/ipo.js';
import { sendNotification } from '../notifications/email.js';
import { log } from '../utils/logger.js';
import { randomDelay } from '../utils/ui.js';
import pLimit from 'p-limit';
import type { AutoConfig, Account, OpenIPO, ApplyResult } from '../store/types.js';

let task: cron.ScheduledTask | null = null;

function matchesAutoConfig(ipo: OpenIPO, autoConfig: AutoConfig): boolean {
  if (autoConfig.categories.length > 0) {
    const type = (ipo.shareTypeName || '').toLowerCase();
    const matchesCategory = autoConfig.categories.some((c) =>
      type.includes(c.toLowerCase()),
    );
    if (!matchesCategory) return false;
  }
  return true;
}

async function autoApplyRun(masterPassword: string): Promise<void> {
  const config = readRawConfig();
  const autoConfig = config.auto;

  if (!autoConfig.enabled) return;

  const accounts = getDecryptedAccounts(masterPassword);
  if (accounts.length === 0) return;

  log.info(`[Auto] Running scheduled IPO check at ${new Date().toLocaleString()}`);

  // Login with first account to check open IPOs
  let openIPOs: OpenIPO[];
  try {
    const loginResult = await login(accounts[0].dpId, accounts[0].username, accounts[0].password);
    openIPOs = await getOpenIPOs(loginResult.token);
    await logout(loginResult.token);
  } catch (err) {
    log.error(`[Auto] Failed to fetch IPOs: ${(err as Error).message}`);
    return;
  }

  // Filter by auto config
  const matching = openIPOs.filter((ipo) => matchesAutoConfig(ipo, autoConfig));
  if (matching.length === 0) {
    log.info('[Auto] No matching IPOs found.');
    return;
  }

  log.info(`[Auto] Found ${matching.length} matching IPO(s)`);

  const limit = pLimit(3);
  const results: ApplyResult[] = [];

  for (const ipo of matching) {
    const kitta = Math.min(autoConfig.maxKitta, ipo.maxUnit || autoConfig.maxKitta);
    const tasks = accounts.map((account) =>
      limit(async () => {
        await randomDelay();
        try {
          const loginResult = await login(account.dpId, account.username, account.password);
          const response = await applyIPO({
            token: loginResult.token,
            companyShareId: ipo.companyShareId,
            kitta,
            demat: account.demat || loginResult.demat,
            boid: account.boid,
            customerId: account.customerId,
            accountBranchId: account.accountBranchId,
            bankId: account.bankId,
            crn: account.crn,
            pin: account.pin,
          });
          await logout(loginResult.token);
          return {
            accountName: account.name,
            boid: account.boid,
            company: ipo.companyName,
            status: 'success' as const,
            message: response.message,
          };
        } catch (err) {
          return {
            accountName: account.name,
            boid: account.boid,
            company: ipo.companyName,
            status: 'error' as const,
            message: (err as Error).message,
          };
        }
      }),
    );

    const ipoResults = await Promise.all(tasks);
    results.push(...ipoResults);
  }

  // Log results
  const successCount = results.filter((r) => r.status === 'success').length;
  const failCount = results.filter((r) => r.status === 'error').length;
  log.info(`[Auto] Done: ${successCount} success, ${failCount} failed`);

  // Send notification
  if (config.email && config.email.events.applied) {
    try {
      const emailPassword = decryptEmailPassword(masterPassword, config.email.appPassword);
      await sendNotification(
        { ...config.email, appPassword: emailPassword },
        'Auto-Apply Results',
        `Auto-applied to ${matching.length} IPO(s) across ${accounts.length} account(s).\n\nSuccess: ${successCount}\nFailed: ${failCount}\n\nDetails:\n${results.map((r) => `${r.accountName} - ${r.company}: ${r.status} (${r.message})`).join('\n')}`,
      );
    } catch {
      log.warn('[Auto] Failed to send email notification');
    }
  }
}

export function startCron(masterPassword: string, schedule: string): void {
  if (task) {
    log.warn('Cron job already running. Stop it first.');
    return;
  }

  if (!cron.validate(schedule)) {
    log.error(`Invalid cron schedule: ${schedule}`);
    return;
  }

  log.info(`Starting auto-apply cron: ${schedule}`);
  task = cron.schedule(schedule, () => {
    autoApplyRun(masterPassword).catch((err) => {
      log.error(`[Auto] Unhandled error: ${(err as Error).message}`);
    });
  });

  task.start();
  log.success('Auto-apply scheduler started.');
}

export function stopCron(): void {
  if (task) {
    task.stop();
    task = null;
    log.success('Auto-apply scheduler stopped.');
  } else {
    log.info('No scheduler running.');
  }
}

export function isCronRunning(): boolean {
  return task !== null;
}
