#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsx = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const cli = join(__dirname, 'cli.ts');

try {
  execFileSync(tsx, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status ?? 1);
}
