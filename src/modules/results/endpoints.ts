import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

export const ReportSchema = z
  .object({
    applicantFormId: z.number().optional(),
    id: z.number().optional(),
    companyShareId: z.number().optional(),
    companyName: z.string().default('Unknown'),
    scrip: z.string().optional(),
    appliedKitta: z.number().optional(),
    statusName: z.string().default(''),
  })
  .loose();
export type Report = z.infer<typeof ReportSchema>;

export const ApplicationReports = defineEndpoint<void, Report[]>({
  name: 'applicationReports',
  method: 'POST',
  path: '/meroShare/applicantForm/active/search/',
  kind: 'read',
  body: () => ({
    filterFieldParams: [
      { key: 'companyShare.companyIssue.companyISIN.script', alias: 'Scrip' },
      { key: 'companyShare.companyIssue.companyISIN.company.name', alias: 'Company Name' },
    ],
    page: 1,
    size: 200,
    searchRoleViewConstants: 'VIEW_APPLICANT_FORM_COMPLETE',
    filterDateParams: [
      { key: 'appliedDate', condition: '', alias: '', value: '' },
      { key: 'appliedDate', condition: '', alias: '', value: '' },
    ],
  }),
  response: z
    .object({ object: z.array(ReportSchema).nullable().default([]) })
    .loose()
    .transform((r) => r.object ?? []),
});

export const ApplicationDetail = defineEndpoint<number, { receivedKitta?: number; appliedKitta?: number; statusName?: string }>({
  name: 'applicationDetail',
  method: 'GET',
  path: (id) => `/meroShare/applicantForm/report/detail/${id}`,
  kind: 'read',
  response: z
    .object({ receivedKitta: z.number().optional(), appliedKitta: z.number().optional(), statusName: z.string().optional() })
    .loose(),
});
