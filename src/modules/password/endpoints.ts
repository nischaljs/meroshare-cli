import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

/** The password rules in force. The shape is not documented; `policy.ts` reads it loosely. */
export const PasswordPolicyEndpoint = defineEndpoint<void, unknown>({
  name: 'passwordPolicy',
  method: 'GET',
  path: '/passwordPolicy/used/',
  kind: 'read',
  response: z.unknown(),
});

export interface ChangeInput {
  oldPassword: string;
  newPassword: string;
}

export const ChangePasswordEndpoint = defineEndpoint<ChangeInput, unknown>({
  name: 'changePassword',
  method: 'POST',
  path: '/meroShare/changePassword/',
  kind: 'write',
  body: (i) => ({ oldPassword: i.oldPassword, newPassword: i.newPassword, confirmPassword: i.newPassword }),
  response: z.unknown(),
});
