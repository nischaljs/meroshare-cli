import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { encrypt, decrypt, deriveKey, generateSalt, hashPassword, verifyPassword } from './crypto.js';
import type { AppConfig, Account } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.ipo');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const SENSITIVE_ACCOUNT_FIELDS: (keyof Account)[] = ['password', 'crn', 'pin'];

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  }
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function readRawConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error('Config not found. Run "ipo init" first.');
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

export function writeConfig(config: AppConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function createConfig(masterPassword: string): AppConfig {
  const salt = generateSalt();
  const config: AppConfig = {
    masterPasswordHash: hashPassword(masterPassword),
    salt,
    iv: '', // unused, IV is per-encryption
    accounts: [],
    auto: {
      enabled: false,
      categories: [],
      sectors: [],
      maxKitta: 10,
      schedule: '0 10 * * *',
    },
    email: null,
  };
  writeConfig(config);
  return config;
}

export function verifyMasterPassword(password: string): boolean {
  const config = readRawConfig();
  return verifyPassword(password, config.masterPasswordHash);
}

export function encryptAccountFields(account: Account, key: Buffer): Account {
  const encrypted = { ...account };
  for (const field of SENSITIVE_ACCOUNT_FIELDS) {
    if (encrypted[field]) {
      encrypted[field] = encrypt(String(encrypted[field]), key) as never;
    }
  }
  return encrypted;
}

export function decryptAccountFields(account: Account, key: Buffer): Account {
  const decrypted = { ...account };
  for (const field of SENSITIVE_ACCOUNT_FIELDS) {
    if (decrypted[field]) {
      try {
        decrypted[field] = decrypt(String(decrypted[field]), key) as never;
      } catch {
        throw new Error(`Failed to decrypt field "${field}" for account "${account.name}". Wrong master password?`);
      }
    }
  }
  return decrypted;
}

export function getDecryptedAccounts(masterPassword: string): Account[] {
  const config = readRawConfig();
  const key = deriveKey(masterPassword, config.salt);
  return config.accounts.map((acc) => decryptAccountFields(acc, key));
}

export function addAccount(masterPassword: string, account: Account): void {
  const config = readRawConfig();
  const key = deriveKey(masterPassword, config.salt);
  const encrypted = encryptAccountFields(account, key);
  config.accounts.push(encrypted);
  writeConfig(config);
}

export function encryptEmailPassword(masterPassword: string, appPassword: string): string {
  const config = readRawConfig();
  const key = deriveKey(masterPassword, config.salt);
  return encrypt(appPassword, key);
}

export function decryptEmailPassword(masterPassword: string, encrypted: string): string {
  const config = readRawConfig();
  const key = deriveKey(masterPassword, config.salt);
  return decrypt(encrypted, key);
}

export function updateAccount(masterPassword: string, index: number, account: Account): void {
  const config = readRawConfig();
  if (index < 0 || index >= config.accounts.length) {
    throw new Error(`Account index ${index} out of range`);
  }
  const key = deriveKey(masterPassword, config.salt);
  config.accounts[index] = encryptAccountFields(account, key);
  writeConfig(config);
}

export function removeAccount(index: number): void {
  const config = readRawConfig();
  if (index < 0 || index >= config.accounts.length) {
    throw new Error(`Account index ${index} out of range`);
  }
  config.accounts.splice(index, 1);
  writeConfig(config);
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
