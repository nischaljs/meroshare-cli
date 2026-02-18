import { apiRequest } from './client.js';
import type { OpenIPO } from '../store/types.js';

export interface ApplicableIssueResponse {
  object: OpenIPO[];
}

export async function getOpenIPOs(token: string): Promise<OpenIPO[]> {
  const response = await apiRequest<ApplicableIssueResponse>(
    '/meroShare/companyShare/applicableIssue/',
    {
      method: 'POST',
      token,
      body: {
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
      },
    },
  );
  return response.object || [];
}

export interface ApplyIPOParams {
  token: string;
  companyShareId: number;
  kitta: number;
  demat: string;
  boid: string; // short 8-char BOID (username)
  accountNumber: string; // bank account number
  customerId: number;
  accountBranchId: number;
  accountTypeId: number;
  bankId: number;
  crn: string;
  pin: string;
}

export async function applyIPO(params: ApplyIPOParams): Promise<{ message: string }> {
  const response = await apiRequest<{ message?: string; status?: string }>(
    '/meroShare/applicantForm/share/apply',
    {
      method: 'POST',
      token: params.token,
      body: {
        demat: params.demat,
        boid: params.boid,
        accountNumber: params.accountNumber,
        customerId: params.customerId,
        accountBranchId: params.accountBranchId,
        accountTypeId: params.accountTypeId,
        appliedKitta: params.kitta.toString(),
        crnNumber: params.crn,
        transactionPIN: params.pin,
        companyShareId: params.companyShareId,
        bankId: params.bankId,
      },
    },
  );

  return { message: response.message || response.status || 'Applied successfully' };
}

export interface ApplicationReport {
  id: number;
  companyName: string;
  scrip: string;
  appliedKitta: number;
  statusName: string;
}

export async function getApplicationReports(token: string): Promise<ApplicationReport[]> {
  const response = await apiRequest<{ object: ApplicationReport[] }>(
    '/meroShare/applicantForm/active/search/',
    {
      method: 'POST',
      token,
      body: {
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
      },
    },
  );
  return response.object || [];
}

export interface ApplicationDetail {
  companyName?: string;
  scrip?: string;
  appliedKitta?: number;
  receivedKitta?: number;
  statusName?: string;
  [key: string]: unknown;
}

export async function getApplicationDetail(token: string, applicationId: number): Promise<ApplicationDetail> {
  const response = await apiRequest<ApplicationDetail>(
    `/meroShare/applicantForm/report/detail/${applicationId}`,
    { token },
  );
  return response;
}
