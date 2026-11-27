import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

export interface LoginInput {
  clientId: number;
  username: string;
  password: string;
}

/**
 * Login. Marked `read` because it changes nothing on the server, so a 5xx or a bot
 * check page is retried. A refused login (4xx) is never retried.
 */
export const Login = defineEndpoint<LoginInput, Record<string, unknown>>({
  name: 'login',
  method: 'POST',
  path: '/meroShare/auth/',
  kind: 'read',
  auth: 'none',
  body: (i) => ({ clientId: i.clientId, username: i.username, password: i.password }),
  response: z.record(z.string(), z.unknown()).default({}),
});

/** Logout. Best effort; the path is from the old code and not confirmed. */
export const Logout = defineEndpoint<void, unknown>({
  name: 'logout',
  method: 'GET',
  path: '/meroShare/auth/logout/',
  kind: 'write',
  response: z.unknown(),
});
