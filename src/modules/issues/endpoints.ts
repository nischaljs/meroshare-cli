import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

export const IssueSchema = z
  .object({
    companyShareId: z.number(),
    companyName: z.string().default(''),
    scrip: z.string().optional(),
    subGroup: z.string().optional(),
    shareTypeName: z.string().default(''),
    shareGroupName: z.string().default(''),
    statusName: z.string().optional(),
    /** Empty or missing: not applied yet. Set (edit, inProcess, reapply): this account already acted. */
    action: z.string().nullable().optional(),
    issueOpenDate: z.string().optional(),
    issueCloseDate: z.string().optional(),
    minUnit: z.number().optional(),
    maxUnit: z.number().optional(),
    sharePerUnit: z.number().optional(),
    shareValue: z.number().optional(),
  })
  .loose();
export type Issue = z.infer<typeof IssueSchema>;

export const ApplicableIssues = defineEndpoint<void, Issue[]>({
  name: 'applicableIssues',
  method: 'POST',
  path: '/meroShare/companyShare/applicableIssue/',
  kind: 'read',
  body: () => ({
    filterFieldParams: [
      { key: 'companyIssue.companyISIN.script', alias: 'Scrip' },
      { key: 'companyIssue.companyISIN.company.name', alias: 'Company Name' },
      { key: 'companyIssue.assignedToClient.name', value: '', alias: 'Issue Manager' },
    ],
    page: 1,
    size: 200,
    searchRoleViewConstants: 'VIEW_APPLICABLE_SHARE',
    filterDateParams: [
      { key: 'minIssueOpenDate', condition: '', alias: '', value: '' },
      { key: 'maxIssueCloseDate', condition: '', alias: '', value: '' },
    ],
  }),
  response: z
    .object({ object: z.array(IssueSchema).nullable().default([]) })
    .loose()
    .transform((r) => r.object ?? []),
});
