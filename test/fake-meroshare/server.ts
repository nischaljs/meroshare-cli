import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A fake MeroShare for tests. It listens on 127.0.0.1 only and never talks to the real hosts.
 * Each user is a scenario: flags in the login answer, own details, banks, issues, and how
 * a password change answers.
 */
export interface FakeUser {
  dpId: number;
  username: string;
  password: string;
  name?: string;
  /** Flags returned in the login answer. */
  flags?: Record<string, boolean | string>;
  /** Own details, or 'roleNotAuthorized' for the 401 MeroShare gives after a good login. */
  ownDetail?: Record<string, unknown> | 'roleNotAuthorized';
  banks?: { id: number; name: string }[];
  bankDetail?: Record<string, unknown>;
  /** The issues this user sees; `action` is per user. */
  issues?: Record<string, unknown>[];
  /** How a password change answers. 'drop': the server changes it, then answers 502. */
  changePassword?: 'ok' | 'reject' | 'drop';
  /** The first n login requests get an HTML bot-check page. */
  challengeLogins?: number;
  /** Status every apply request gets (default 201). */
  applyStatus?: number;
  reports?: Record<string, unknown>[];
  reportDetail?: Record<string, unknown>;
}

export interface FakeRequest {
  method: string;
  path: string;
  body: unknown;
  user: string | null;
}

export interface FakeOptions {
  users: FakeUser[];
  dps?: { id: number; code: string; name: string }[];
  policy?: unknown;
  partners?: unknown;
  initialDetails?: Record<string, unknown>;
  /** Answers with 500 to the first n requests of these paths. */
  failFirst?: Record<string, number>;
}

export interface FakeMeroShare {
  apiBase: string;
  resultBase: string;
  users: Map<string, FakeUser>;
  requests: FakeRequest[];
  count(method: string, path: string): number;
  close(): Promise<void>;
}

export async function startFake(opts: FakeOptions): Promise<FakeMeroShare> {
  const users = new Map(opts.users.map((u) => [u.username, { ...u }]));
  const tokens = new Map<string, string>();
  const requests: FakeRequest[] = [];
  const failures = new Map(Object.entries(opts.failFirst ?? {}));
  let n = 0;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const path = url.pathname.replace(/^\/api/, '');
      let body: unknown = undefined;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      const user = tokens.get(String(req.headers.authorization ?? '')) ?? null;
      requests.push({ method: req.method ?? 'GET', path, body, user });

      const json = (status: number, data: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(data));
      };
      const html = () => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!DOCTYPE html><html><body>Checking your browser</body></html>');
      };

      const left = failures.get(path);
      if (left) {
        failures.set(path, left - 1);
        return json(500, { message: 'Internal error' });
      }

      if (req.method === 'POST' && path === '/meroShare/auth/') {
        const b = body as { clientId: number; username: string; password: string };
        const u = users.get(b.username);
        if (u?.challengeLogins) {
          u.challengeLogins--;
          return html();
        }
        if (!u || u.dpId !== b.clientId || u.password !== b.password) {
          return json(401, { message: 'Invalid username or password', errorCode: 401 });
        }
        const token = `tok-${u.username}-${++n}`;
        tokens.set(token, u.username);
        return json(200, { name: u.name ?? u.username, demat: `130${u.username}`, ...(u.flags ?? {}) }, { authorization: token });
      }
      if (path === '/meroShare/capital/') return json(200, opts.dps ?? [{ id: 1, code: '11', name: 'Test Capital' }]);

      const u = user ? users.get(user) : undefined;
      if (!u) return json(401, { message: 'Unauthorized' });

      if (path === '/meroShare/auth/logout/') return json(200, {});
      if (path === '/meroShare/ownDetail/') {
        if (u.ownDetail === 'roleNotAuthorized') return json(401, { message: 'Role Not Authorized' });
        return json(200, u.ownDetail ?? {});
      }
      if (path === '/meroShare/bank/') return json(200, u.banks ?? [{ id: 7, name: 'Test Bank' }]);
      if (path.startsWith('/meroShare/bank/')) {
        return json(200, [{ id: 501, accountNumber: '0011', accountBranchId: 9, accountTypeId: 1, ...(u.bankDetail ?? {}) }]);
      }
      if (path === '/passwordPolicy/used/') return json(200, opts.policy ?? { minLength: 8, upperCase: 1, lowerCase: 1, digit: 1, specialCharacter: 1 });
      if (path === '/meroShare/changePassword/') {
        const b = body as { oldPassword: string; newPassword: string };
        const mode = u.changePassword ?? 'ok';
        if (mode === 'reject' || b.oldPassword !== u.password) return json(400, { message: 'Password does not meet the policy' });
        u.password = b.newPassword;
        u.flags = { ...(u.flags ?? {}), passwordExpired: false, changePassword: false };
        if (mode === 'drop') return json(502, { message: 'Bad gateway' });
        return json(200, { message: 'Password changed successfully' });
      }
      if (path === '/meroShare/companyShare/applicableIssue/') return json(200, { object: u.issues ?? [], totalCount: (u.issues ?? []).length });
      if (path === '/meroShare/applicantForm/share/apply') {
        const status = u.applyStatus ?? 201;
        if (status >= 400) return json(status, { message: status === 409 ? 'Application in process' : 'Server error' });
        const b = body as { companyShareId: number };
        const issue = u.issues?.find((i) => i.companyShareId === b.companyShareId);
        if (issue) issue.action = 'inProcess';
        return json(201, { message: 'Share has been applied successfully.', status: 'CREATED' });
      }
      if (path === '/meroShare/applicantForm/active/search/') return json(200, { object: u.reports ?? [] });
      if (path.startsWith('/meroShare/applicantForm/report/detail/')) return json(200, u.reportDetail ?? {});
      if (path === '/payment/partner/') return json(200, opts.partners ?? [{ id: 1, partnerConfigId: 3, name: 'Test Wallet' }]);
      if (path.startsWith('/payment/initialDetails/')) {
        return json(200, opts.initialDetails ?? { meroShareRenewalCharge: 50, dematRenewalCharge: 100, dematMaxRenewalYear: 3, paymentTypeList: ['MEROSHARE', 'DEMAT'] });
      }
      return json(404, { message: `No fake for ${req.method} ${path}` });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    apiBase: `http://127.0.0.1:${port}/api`,
    resultBase: `http://127.0.0.1:${port}/result`,
    users,
    requests,
    count: (method, path) => requests.filter((r) => r.method === method && r.path === path).length,
    close: () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
