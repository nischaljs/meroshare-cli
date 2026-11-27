import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

export interface ApplyInput {
  demat: string;
  boid: string;
  accountNumber: string;
  customerId: number;
  accountBranchId: number;
  accountTypeId: number;
  kitta: number;
  crn: string;
  pin: string;
  companyShareId: number;
  bankId: number;
}

/** Sends one application. A write: never retried. */
export const ApplyEndpoint = defineEndpoint<ApplyInput, { message: string }>({
  name: 'apply',
  method: 'POST',
  path: '/meroShare/applicantForm/share/apply',
  kind: 'write',
  body: (i) => ({
    demat: i.demat,
    boid: i.boid,
    accountNumber: i.accountNumber,
    customerId: i.customerId,
    accountBranchId: i.accountBranchId,
    accountTypeId: i.accountTypeId,
    appliedKitta: String(i.kitta),
    crnNumber: i.crn,
    transactionPIN: i.pin,
    companyShareId: i.companyShareId,
    bankId: i.bankId,
  }),
  response: z
    .object({ message: z.string().optional(), status: z.string().optional() })
    .loose()
    .default({})
    .transform((r) => ({ message: r.message || r.status || 'Applied' })),
});
