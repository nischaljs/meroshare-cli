import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContext, type AppContext } from '../../src/platform/context/public.js';
import { EmailSection, type EmailMessage } from '../../src/platform/notify/public.js';
import { AccountsSection } from '../../src/modules/accounts/public.js';
import { startFake, type FakeMeroShare, type FakeOptions, type FakeUser } from './server.js';

export const MASTER = 'master-pass-1';

export interface TestApp {
  ctx: AppContext;
  fake: FakeMeroShare;
  home: string;
  emails: EmailMessage[];
  printed: string[];
  /** Moves the test clock. */
  setNow(d: Date): void;
  /** Writes a value the section's schema refuses straight into the config file. */
  breakSection(name: string, value: unknown): void;
  close(): Promise<void>;
}

/** An account as the store holds it, for a fake user. */
export function accountFor(u: FakeUser, extra: Record<string, unknown> = {}) {
  return {
    name: u.name ?? u.username,
    dpId: u.dpId,
    dpName: 'Test Capital',
    username: u.username,
    password: u.password,
    pendingPassword: '',
    boid: `130000${u.username}`,
    crn: 'CRN1',
    pin: '1234',
    bankId: 7,
    bankName: 'Test Bank',
    accountBranchId: 9,
    accountNumber: '0011',
    customerId: 501,
    demat: '',
    ...extra,
  };
}

export function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-test-'));
}

/**
 * A fake MeroShare, a store in a temp folder with the users as accounts, and a context
 * that waits for nothing and captures email. Never touches ~/.ipo.
 */
export async function startApp(opts: FakeOptions & { now?: Date; email?: boolean; timeoutMs?: number }): Promise<TestApp> {
  const fake = await startFake(opts);
  const home = tempHome();
  const emails: EmailMessage[] = [];
  const printed: string[] = [];
  let now = opts.now ?? new Date(2026, 10, 27, 10, 0, 0);
  const ctx = createContext({
    store: { home },
    client: { apiBase: fake.apiBase, resultBase: fake.resultBase, sleep: async () => {}, timeoutMs: opts.timeoutMs },
    notifier: { print: (l) => printed.push(l), transport: async (_s, m) => void emails.push(m) },
    now: () => now,
    sleep: async () => {},
    accountGapMs: 0,
  });
  ctx.store.create(MASTER);
  ctx.store.section(AccountsSection).update(() => opts.users.map((u) => accountFor(u)));
  if (opts.email) {
    ctx.store.section(EmailSection).update(() => ({ email: 'me@example.test', appPassword: 'app', smtpHost: 'smtp.example.test', smtpPort: 587, events: {} }));
  }
  return {
    ctx,
    fake,
    home,
    emails,
    printed,
    setNow: (d) => (now = d),
    breakSection: (name, value) => {
      const doc = JSON.parse(fs.readFileSync(ctx.store.path, 'utf8'));
      doc[name] = value;
      fs.writeFileSync(ctx.store.path, JSON.stringify(doc));
    },
    close: async () => {
      await fake.close();
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

/** A date `days` from the test clock, as YYYY-MM-DD. */
export function dayFrom(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
