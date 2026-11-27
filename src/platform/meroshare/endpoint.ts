import type { z } from 'zod';

export type Site = 'meroshare' | 'result';

/**
 * A module plugs an endpoint into the socket with this definition.
 * `kind` decides retries: a read may be retried, a write never is.
 */
export interface Endpoint<I, O> {
  name: string;
  site?: Site; // default 'meroshare'
  method: 'GET' | 'POST';
  path: string | ((input: I) => string);
  kind: 'read' | 'write';
  /** 'token' (default on MeroShare) sends the session token; 'none' sends none. */
  auth?: 'token' | 'none';
  body?: (input: I) => unknown;
  response: z.ZodType<O>;
}

export function defineEndpoint<I = void, O = unknown>(def: Endpoint<I, O>): Endpoint<I, O> {
  return def;
}

export interface SessionToken {
  token: string;
}
