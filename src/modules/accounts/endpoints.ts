import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

const DP = z.object({ id: z.number(), code: z.union([z.string(), z.number()]).optional(), name: z.string() }).loose();

/** List of depository participants. Answers without a token. */
export const DpList = defineEndpoint<void, z.infer<typeof DP>[]>({
  name: 'dpList',
  method: 'GET',
  path: '/meroShare/capital/',
  kind: 'read',
  auth: 'none',
  response: z.array(DP),
});

const Bank = z.object({ id: z.number(), bankCode: z.string().optional(), name: z.string().optional(), bankName: z.string().optional() }).loose();
export type Bank = z.infer<typeof Bank>;

export const Banks = defineEndpoint<void, Bank[]>({
  name: 'banks',
  method: 'GET',
  path: '/meroShare/bank/',
  kind: 'read',
  response: z.array(Bank),
});

const BankDetailItem = z
  .object({
    id: z.number().optional(),
    accountNumber: z.string().optional(),
    accountBranchId: z.number().optional(),
    accountTypeId: z.number().optional(),
    customerId: z.number().optional(),
    bankName: z.string().optional(),
    bankId: z.number().optional(),
  })
  .loose();
export type BankDetail = z.infer<typeof BankDetailItem>;

export const BankDetail = defineEndpoint<number, BankDetail>({
  name: 'bankDetail',
  method: 'GET',
  path: (bankId) => `/meroShare/bank/${bankId}`,
  kind: 'read',
  response: z.union([z.array(BankDetailItem), BankDetailItem]).transform((v) => (Array.isArray(v) ? (v[0] ?? {}) : v)),
});
