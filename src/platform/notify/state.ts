import { z } from 'zod';
import { defineSection, type SectionValue } from '../store/public.js';

/** Email settings. The notify socket owns this section; old configs already have it as `email`. */
export const EmailSection = defineSection('email', ({ secret }) =>
  z
    .object({
      email: z.string(),
      appPassword: secret(),
      smtpHost: z.string().default('smtp.gmail.com'),
      smtpPort: z.number().int().default(587),
      // keyed by notice kind; a kind that is not listed is sent
      events: z.record(z.string(), z.boolean()).default({}),
    })
    .nullable()
    .default(null),
);

export type EmailSettings = NonNullable<SectionValue<typeof EmailSection>>;
