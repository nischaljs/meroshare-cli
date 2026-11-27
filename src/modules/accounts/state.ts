import { z } from 'zod';
import { defineSection, type SectionValue } from '../../platform/store/public.js';

/** The `accounts` section. The same name and fields as the version 1 file, plus `pendingPassword`. */
export const AccountsSection = defineSection('accounts', ({ secret }) =>
  z
    .array(
      z.object({
        name: z.string(),
        dpId: z.number(),
        dpName: z.string().default(''),
        username: z.string(),
        password: secret(),
        /** A new password written before the change is sent; see modules/password. */
        pendingPassword: secret().default(''),
        boid: z.string(),
        crn: secret(),
        pin: secret(),
        bankId: z.number().default(0),
        bankName: z.string().default(''),
        accountBranchId: z.number().default(0),
        accountNumber: z.string().default(''),
        customerId: z.number().default(0),
        demat: z.string().default(''),
      }),
    )
    .default([]),
);

export type Account = SectionValue<typeof AccountsSection>[number];
