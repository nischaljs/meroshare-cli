import { z } from 'zod';
import type { Endpoint, SessionToken } from './endpoint.js';
import { MeroShareError, ResponseShapeError } from './errors.js';

const DEFAULT_API_BASE = 'https://webbackend.cdsc.com.np/api';
const DEFAULT_RESULT_BASE = 'https://iporesult.cdsc.com.np';
const MEROSHARE_SITE = 'https://meroshare.cdsc.com.np';
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ATTEMPTS = 3;
const BACKOFF_MS = [2000, 4000];
const JITTER_MS: [number, number] = [250, 750];
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface ClientOptions {
  apiBase?: string;
  resultBase?: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** How long one request may take, body included, before it is given up (default 30 s). */
  timeoutMs?: number;
  /** Called before each retry of a read. */
  onRetry?: (info: { endpoint: string; attempt: number; waitMs: number; reason: string }) => void;
}

export interface MeroShareClient {
  readonly apiBase: string;
  call<I, O>(ep: Endpoint<I, O>, input: I, session?: SessionToken | null): Promise<O>;
  /** Like call, and also returns the token MeroShare sends in the Authorization header. */
  login<I, O>(ep: Endpoint<I, O>, input: I): Promise<{ data: O; token: string }>;
}

interface Raw {
  status: number;
  headers: Headers;
  text: string;
}

function looksLikeHtml(contentType: string, text: string): boolean {
  if (contentType.includes('text/html')) return true;
  const head = text.trimStart().slice(0, 15).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

function errorFromBody(endpoint: string, status: number, text: string): MeroShareError {
  let message = `MeroShare error ${status}`;
  let errorCode: string | undefined;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const m = j.message ?? j.errorMessage ?? j.error ?? j.msg;
    if (typeof m === 'string' && m) message = m;
    const c = j.errorCode ?? j.code;
    if (c !== undefined && c !== null) errorCode = String(c);
  } catch {
    if (text.trim()) message = `${message}: ${text.trim().slice(0, 200)}`;
  }
  return new MeroShareError(message, endpoint, status, 'http', errorCode);
}

function retryable(err: unknown): boolean {
  if (!(err instanceof MeroShareError)) return false;
  if (err.kind === 'challenge' || err.kind === 'network' || err.kind === 'timeout') return true;
  return err.kind === 'http' && (err.status === 429 || err.status >= 500);
}

export function createMeroShareClient(opts: ClientOptions = {}): MeroShareClient {
  const apiBase = (opts.apiBase ?? process.env.MEROSHARE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');
  const resultBase = (opts.resultBase ?? process.env.IPORESULT_BASE ?? DEFAULT_RESULT_BASE).replace(/\/$/, '');
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let resultCookies = '';

  async function refreshResultCookies(): Promise<void> {
    const res = await fetch(`${resultBase}/`, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    resultCookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    await res.text();
  }

  async function sendOnce<I, O>(ep: Endpoint<I, O>, input: I, session?: SessionToken | null): Promise<Raw> {
    const site = ep.site ?? 'meroshare';
    const base = site === 'result' ? resultBase : apiBase;
    const path = typeof ep.path === 'function' ? ep.path(input) : ep.path;
    const body = ep.body ? ep.body(input) : undefined;
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': BROWSER_UA,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (site === 'meroshare') {
      headers.Origin = MEROSHARE_SITE;
      headers.Referer = `${MEROSHARE_SITE}/`;
      if ((ep.auth ?? 'token') === 'token') {
        if (!session?.token) throw new MeroShareError(`"${ep.name}" needs a login token`, ep.name, 0, 'auth');
        headers.Authorization = session.token; // as-is, no "Bearer"
      }
    } else {
      try {
        if (!resultCookies) await refreshResultCookies();
      } catch (err) {
        throw new MeroShareError(`Network error: ${(err as Error).message}`, ep.name, 0, 'network');
      }
      headers.Referer = `${resultBase}/`;
      if (resultCookies) headers.Cookie = resultCookies;
    }

    let res: Response;
    let text: string;
    try {
      res = await fetch(`${base}${path}`, {
        method: ep.method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') {
        throw new MeroShareError(`MeroShare did not answer within ${Math.round(timeoutMs / 1000)} s`, ep.name, 0, 'timeout');
      }
      throw new MeroShareError(`Network error: ${(err as Error).message}`, ep.name, 0, 'network');
    }
    if (site === 'result') {
      const extra = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
      if (extra.length) resultCookies = [resultCookies, ...extra].filter(Boolean).join('; ');
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (looksLikeHtml(contentType, text)) {
      if (site === 'result') resultCookies = '';
      throw new MeroShareError(
        'MeroShare answered with a web page instead of data (likely a bot check)',
        ep.name,
        res.status,
        'challenge',
      );
    }
    if (res.status < 200 || res.status >= 300) throw errorFromBody(ep.name, res.status, text);
    return { status: res.status, headers: res.headers, text };
  }

  async function send<I, O>(ep: Endpoint<I, O>, input: I, session?: SessionToken | null): Promise<Raw> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await sendOnce(ep, input, session);
      } catch (err) {
        if (ep.kind === 'write' || attempt >= ATTEMPTS || !retryable(err)) throw err;
        const jitter = JITTER_MS[0] + Math.floor(random() * (JITTER_MS[1] - JITTER_MS[0] + 1));
        const waitMs = BACKOFF_MS[attempt - 1] + jitter;
        opts.onRetry?.({ endpoint: ep.name, attempt, waitMs, reason: (err as Error).message });
        await sleep(waitMs);
      }
    }
  }

  function parse<I, O>(ep: Endpoint<I, O>, raw: Raw): O {
    let data: unknown = undefined;
    if (raw.text.trim()) {
      try {
        data = JSON.parse(raw.text);
      } catch {
        throw new ResponseShapeError(ep.name, raw.status, 'the body is not JSON');
      }
    }
    const parsed = ep.response.safeParse(data);
    if (!parsed.success) throw new ResponseShapeError(ep.name, raw.status, z.prettifyError(parsed.error));
    return parsed.data;
  }

  return {
    apiBase,
    async call(ep, input, session) {
      return parse(ep, await send(ep, input, session));
    },
    async login(ep, input) {
      const raw = await send(ep, input, null);
      const token = raw.headers.get('authorization') ?? '';
      if (!token) throw new MeroShareError('MeroShare sent no login token', ep.name, raw.status, 'auth');
      return { data: parse(ep, raw), token };
    },
  };
}
