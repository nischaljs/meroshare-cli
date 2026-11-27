import { z } from 'zod';
import { defineSection, type SectionValue } from '../../platform/store/public.js';

/** The `auto` section. The same name and fields as the version 1 file, plus `autoPassword` (off by default). */
export const AutoSection = defineSection('auto', () =>
  z
    .object({
      enabled: z.boolean().default(false),
      categories: z.array(z.string()).default([]),
      sectors: z.array(z.string()).default([]),
      maxKitta: z.number().int().min(1).default(10),
      schedule: z.string().default('0 10 * * *'),
      /** When on, the daily job changes a password within 7 days of expiry or when MeroShare asks. */
      autoPassword: z.boolean().default(false),
    })
    .prefault({}),
);
export type AutoSettings = SectionValue<typeof AutoSection>;
