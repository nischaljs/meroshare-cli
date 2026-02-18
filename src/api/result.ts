import { resultApiRequest } from './client.js';
import type { ResultCompany } from '../store/types.js';

interface CompanySharesBody {
  companyShareList?: ResultCompany[];
}

export async function getResultCompanies(): Promise<ResultCompany[]> {
  const response = await resultApiRequest<unknown>('/result/companyShares/fileUploaded');

  if (Array.isArray(response)) return response;

  const obj = response as Record<string, unknown>;
  if (obj.body && typeof obj.body === 'object') {
    const body = obj.body as CompanySharesBody;
    if (Array.isArray(body.companyShareList)) return body.companyShareList;
    if (Array.isArray(body)) return body as unknown as ResultCompany[];
  }

  throw new Error(`Unexpected response: ${JSON.stringify(response).slice(0, 200)}`);
}
