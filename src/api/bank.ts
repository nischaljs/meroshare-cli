import { apiRequest } from './client.js';
import type { DPItem } from '../store/types.js';

export async function getDPList(): Promise<DPItem[]> {
  const response = await apiRequest<DPItem[]>('/meroShare/capital/');
  return response;
}

export interface BankListItem {
  id: number;
  bankCode?: string;
  name?: string;
  bankName?: string;
  [key: string]: unknown;
}

export interface BankBranchDetail {
  accountNumber?: string;
  accountBranchId?: number;
  accountTypeId?: number;
  customerId?: number;
  bankName?: string;
  bankId?: number;
  id?: number;
  [key: string]: unknown;
}

export async function getUserBanks(token: string): Promise<BankListItem[]> {
  const response = await apiRequest<BankListItem[]>('/meroShare/bank/', {
    token,
  });
  return response;
}

export async function getBankDetail(
  token: string,
  bankId: number,
): Promise<BankBranchDetail> {
  const response = await apiRequest<BankBranchDetail | BankBranchDetail[]>(
    `/meroShare/bank/${bankId}`,
    { token },
  );
  // API returns an array — take the first element
  if (Array.isArray(response)) {
    if (response.length === 0) throw new Error('No bank detail found');
    return response[0];
  }
  return response;
}
