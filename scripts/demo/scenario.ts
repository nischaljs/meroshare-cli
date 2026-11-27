/**
 * The demo scenario for docs/media/demo.gif.
 *
 * Starts the fake MeroShare from test/fake-meroshare on 127.0.0.1 and a config with three
 * fake family accounts in a temp IPO_HOME, then writes `env.sh` into the work folder and
 * keeps running until it is killed. It never reads ~/.ipo and never calls a real host.
 *
 *   Ram   password expired (MeroShare blocks the login)
 *   Sita  DEMAT expires in 9 days
 *   Hari  healthy
 *
 * Usage: npx tsx scripts/demo/scenario.ts <work-folder>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFake, type FakeUser } from '../../test/fake-meroshare/server.js';
import { createContext } from '../../src/platform/context/public.js';
import { AccountsSection } from '../../src/modules/accounts/public.js';

const MASTER = 'demo-master-password';
const DP = { id: 101, code: '11', name: 'Demo Capital Ltd.' };
const BANK = { id: 7, name: 'Demo Bank Ltd.' };

const work = process.argv[2];
if (!work) throw new Error('Usage: scenario.ts <work-folder>');
const home = path.join(work, 'home');
fs.mkdirSync(home, { recursive: true, mode: 0o700 });

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Each account gets its own copy: the fake marks an issue as applied on the object it holds. */
function issues(): Record<string, unknown>[] {
  return [
    {
      companyShareId: 9001,
      companyName: 'Demo Hydropower Ltd.',
      scrip: 'DHPL',
      shareTypeName: 'IPO',
      shareGroupName: 'Ordinary Shares',
      statusName: 'CREATE_APPROVE',
      action: null,
      issueOpenDate: day(-1),
      issueCloseDate: day(3),
      minUnit: 10,
      maxUnit: 1000,
      shareValue: 100,
    },
  ];
}

const healthyDates = { passwordExpiryDate: day(80), expiredDate: day(210), dematExpiryDate: day(300) };

const users: FakeUser[] = [
  {
    dpId: DP.id,
    username: '00110001',
    password: 'Old-pass-1!',
    name: 'Ram',
    flags: { passwordExpired: true },
    ownDetail: { expiredDate: day(150), dematExpiryDate: day(240) },
    banks: [BANK],
    issues: issues(),
  },
  {
    dpId: DP.id,
    username: '00110002',
    password: 'Sita-pass-2!',
    name: 'Sita',
    ownDetail: { passwordExpiryDate: day(60), expiredDate: day(180), dematExpiryDate: day(9) },
    banks: [BANK],
    issues: issues(),
  },
  {
    dpId: DP.id,
    username: '00110003',
    password: 'Hari-pass-3!',
    name: 'Hari',
    ownDetail: healthyDates,
    banks: [BANK],
    issues: issues(),
  },
];

const fake = await startFake({ users, dps: [DP] });
if (!fake.apiBase.startsWith('http://127.0.0.1:')) throw new Error('The fake must listen on 127.0.0.1');

const ctx = createContext({ store: { home }, client: { apiBase: fake.apiBase, resultBase: fake.resultBase } });
ctx.store.create(MASTER);
ctx.store.section(AccountsSection).update(() =>
  users.map((u, i) => ({
    name: u.name ?? u.username,
    dpId: u.dpId,
    dpName: DP.name,
    username: u.username,
    password: u.password,
    pendingPassword: '',
    boid: `130110000000000${i + 1}`,
    crn: `DEMO-CRN-${i + 1}`,
    pin: '0000',
    bankId: BANK.id,
    bankName: BANK.name,
    accountBranchId: 9,
    accountNumber: `000000000${i + 1}`,
    customerId: 501,
    demat: '',
  })),
);

// a shim so the tape can type `ipo` like a person who installed the package
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const binDir = path.join(work, 'bin');
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(path.join(binDir, 'ipo'), `#!/usr/bin/env bash\nexec node ${JSON.stringify(path.join(repo, 'bin', 'ipo.js'))} "$@"\n`, { mode: 0o755 });

const env = {
  IPO_HOME: home,
  MEROSHARE_API_BASE: fake.apiBase,
  IPORESULT_BASE: fake.resultBase,
  IPO_MASTER_PASSWORD: MASTER,
  IPO_ACCOUNT_GAP_MS: '300',
};
fs.writeFileSync(
  path.join(work, 'env.sh'),
  Object.entries(env)
    .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
    .concat(`export PATH=${JSON.stringify(binDir)}:"$PATH"`)
    .join('\n') + '\n',
);
console.log(`demo scenario ready: ${fake.apiBase}`);

const stop = async () => {
  await fake.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
