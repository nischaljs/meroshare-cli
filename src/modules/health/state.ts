import { z } from 'zod';
import { defineSection, type SectionValue } from '../../platform/store/public.js';
import { FlagsSchema } from '../session/public.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null);

export const SnapshotSchema = z.object({
  name: z.string(),
  checkedAt: z.string(),
  passwordExpiry: Day,
  meroshareExpiry: Day,
  dematExpiry: Day,
  flags: FlagsSchema.prefault({} as z.input<typeof FlagsSchema>),
  pin: z.enum(['set', 'not set', 'reset', 'unknown']).default('unknown'),
  bankLinked: z.boolean().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type HealthSnapshot = z.infer<typeof SnapshotSchema>;

/** The `health` section: the last check per account (keyed by account id), the reminders and the blocked emails already sent. */
export const HealthSection = defineSection('health', () =>
  z
    .object({
      snapshots: z.record(z.string(), SnapshotSchema).default({}),
      remindersSent: z.array(z.string()).default([]),
      /** Per account id: the block an "account blocked" email was sent for, so it goes once per block. */
      blockedNotified: z.record(z.string(), z.string()).default({}),
    })
    .prefault({}),
);
export type HealthState = SectionValue<typeof HealthSection>;
