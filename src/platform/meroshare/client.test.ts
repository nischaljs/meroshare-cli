import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createMeroShareClient, defineEndpoint, MeroShareError, ResponseShapeError, friendlyMessage } from './public.js';
import { startFake } from '../../../test/fake-meroshare/server.js';

const user = { dpId: 1, username: 'u1', password: 'p1' };
const Login = defineEndpoint<void, Record<string, unknown>>({
  name: 'login',
  method: 'POST',
  path: '/meroShare/auth/',
  kind: 'read',
  auth: 'none',
  body: () => ({ clientId: 1, username: 'u1', password: 'p1' }),
  response: z.record(z.string(), z.unknown()),
});
const Banks = defineEndpoint<void, { id: number }[]>({
  name: 'banks', method: 'GET', path: '/meroShare/bank/', kind: 'read', response: z.array(z.object({ id: z.number() }).loose()),
});
const BanksWrongShape = defineEndpoint<void, { code: string }>({
  name: 'banks', method: 'GET', path: '/meroShare/bank/', kind: 'read', response: z.object({ code: z.string() }),
});
const ChangePassword = defineEndpoint<void, unknown>({
  name: 'changePassword', method: 'POST', path: '/meroShare/changePassword/', kind: 'write',
  body: () => ({ oldPassword: 'p1', newPassword: 'p2', confirmPassword: 'p2' }), response: z.unknown(),
});
const OwnDetail = defineEndpoint<void, unknown>({ name: 'ownDetail', method: 'GET', path: '/meroShare/ownDetail/', kind: 'read', response: z.unknown() });

function client(apiBase: string, waits: number[]) {
  return createMeroShareClient({ apiBase, resultBase: apiBase, sleep: async (ms) => void waits.push(ms), random: () => 0 });
}

test('a bot-check page on a read is retried with backoff, then succeeds', async () => {
  const fake = await startFake({ users: [{ ...user, challengeLogins: 2 }] });
  try {
    const waits: number[] = [];
    const { token } = await client(fake.apiBase, waits).login(Login, undefined);
    assert.ok(token.startsWith('tok-u1'));
    assert.equal(fake.count('POST', '/meroShare/auth/'), 3);
    assert.deepEqual(waits, [2250, 4250]);
  } finally {
    await fake.close();
  }
});

test('a read gives up after three attempts with a typed challenge error', async () => {
  const fake = await startFake({ users: [{ ...user, challengeLogins: 5 }] });
  try {
    await assert.rejects(client(fake.apiBase, []).login(Login, undefined), (e: unknown) => e instanceof MeroShareError && e.kind === 'challenge');
    assert.equal(fake.count('POST', '/meroShare/auth/'), 3);
  } finally {
    await fake.close();
  }
});

test('a 5xx read is retried; a write is sent once only', async () => {
  const fake = await startFake({ users: [user], failFirst: { '/meroShare/bank/': 1, '/meroShare/changePassword/': 1 } });
  try {
    const c = client(fake.apiBase, []);
    const { token } = await c.login(Login, undefined);
    assert.deepEqual((await c.call(Banks, undefined, { token })).map((b) => b.id), [7]);
    assert.equal(fake.count('GET', '/meroShare/bank/'), 2);
    await assert.rejects(c.call(ChangePassword, undefined, { token }), (e: unknown) => e instanceof MeroShareError && e.status === 500);
    assert.equal(fake.count('POST', '/meroShare/changePassword/'), 1);
  } finally {
    await fake.close();
  }
});

test('a refused login is not retried and is a definite rejection', async () => {
  const fake = await startFake({ users: [{ ...user, password: 'other' }] });
  try {
    await assert.rejects(client(fake.apiBase, []).login(Login, undefined), (e: unknown) => e instanceof MeroShareError && e.status === 401 && e.isDefiniteRejection);
    assert.equal(fake.count('POST', '/meroShare/auth/'), 1);
  } finally {
    await fake.close();
  }
});

test('an answer of the wrong shape is a ResponseShapeError', async () => {
  const fake = await startFake({ users: [user] });
  try {
    const c = client(fake.apiBase, []);
    const { token } = await c.login(Login, undefined);
    await assert.rejects(c.call(BanksWrongShape, undefined, { token }), (e: unknown) => e instanceof ResponseShapeError && e.kind === 'schema');
  } finally {
    await fake.close();
  }
});

test('Role Not Authorized is recognised and points to ipo doctor', async () => {
  const fake = await startFake({ users: [{ ...user, ownDetail: 'roleNotAuthorized' }] });
  try {
    const c = client(fake.apiBase, []);
    const { token } = await c.login(Login, undefined);
    const err = await c.call(OwnDetail, undefined, { token }).catch((e) => e);
    assert.ok(err instanceof MeroShareError && err.isRoleNotAuthorized);
    assert.match(friendlyMessage(err), /ipo doctor/);
    assert.equal(fake.count('GET', '/meroShare/ownDetail/'), 1);
  } finally {
    await fake.close();
  }
});

test('a call that needs a token fails before sending without one', async () => {
  const c = createMeroShareClient({ apiBase: 'http://127.0.0.1:9/api' });
  await assert.rejects(c.call(Banks, undefined, null), (e: unknown) => e instanceof MeroShareError && e.kind === 'auth');
});
