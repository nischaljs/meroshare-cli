import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 18:10Z is 23:55 in Nepal (Nov 27); 18:20Z is 00:05 in Nepal (Nov 28)
const script = `
import { daysLeft, toDay, nepalDay } from './src/modules/health/public.ts';
const before = new Date('2026-11-27T18:10:00Z');
const after = new Date('2026-11-27T18:20:00Z');
console.log(JSON.stringify({
  before: daysLeft('2026-11-28', before),
  after: daysLeft('2026-11-28', after),
  past: daysLeft('2026-11-27', after),
  todayAfter: nepalDay(after),
  epochAfter: toDay(after.getTime()),
  epochBefore: toDay(Math.floor(before.getTime() / 1000)),
  written: toDay('Nov 28, 2026'),
}));
`;

for (const tz of ['UTC', 'America/New_York', 'Asia/Kathmandu', 'Pacific/Kiritimati']) {
  test(`expiry days are counted in Nepal time when the machine runs in ${tz}`, () => {
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: root,
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(out), {
      before: 1,
      after: 0,
      past: -1,
      todayAfter: '2026-11-28',
      epochAfter: '2026-11-28',
      epochBefore: '2026-11-27',
      written: '2026-11-28',
    });
  });
}
