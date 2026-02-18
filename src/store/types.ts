export interface Account {
  name: string;
  dpId: number;
  dpName: string;
  username: string;
  password: string; // encrypted
  boid: string;
  crn: string; // encrypted
  pin: string; // encrypted
  bankId: number;
  bankName: string;
  accountBranchId: number;
  accountNumber: string;
  customerId: number;
  demat: string;
}

export interface AutoConfig {
  enabled: boolean;
  categories: string[]; // IPO, FPO, Right
  sectors: string[];
  maxKitta: number;
  schedule: string; // cron expression
}

export interface EmailConfig {
  email: string;
  appPassword: string; // encrypted
  smtpHost: string;
  smtpPort: number;
  events: {
    applied: boolean;
    resultOut: boolean;
    allocated: boolean;
    notAllocated: boolean;
  };
}

export interface AppConfig {
  masterPasswordHash: string; // bcrypt hash
  salt: string; // for PBKDF2
  iv: string; // base64 IV for encryption
  accounts: Account[];
  auto: AutoConfig;
  email: EmailConfig | null;
}

export interface OpenIPO {
  companyShareId: number;
  companyName: string;
  subGroup: string;
  shareTypeName: string;
  shareGroupName: string;
  issueOpenDate: string;
  issueCloseDate: string;
  issueCloseDateStr?: string;
  minUnit: number;
  maxUnit: number;
  sharePerUnit: number;
  shareValue: number;
}

export interface ApplyResult {
  accountName: string;
  boid: string;
  company: string;
  status: 'success' | 'error';
  message: string;
}

export interface IPOResult {
  accountName: string;
  boid: string;
  company: string;
  status: 'allotted' | 'not_allotted' | 'error';
  kitta?: number;
  receivedKitta?: number;
  message: string;
}

export interface LoginResponse {
  token: string;
  demat: string;
  name: string;
}

export interface DPItem {
  id: number;
  name: string;
  code?: string;
}

export interface BankDetail {
  id: number;
  bankName: string;
  accountNumber: string;
  accountBranchId: number;
  customerId: number;
}

export interface ResultCompany {
  id: number;
  name: string;
  companyName?: string;
  scrip?: string;
  isFileUploaded?: boolean;
}
