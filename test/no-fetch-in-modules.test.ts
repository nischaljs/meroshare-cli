import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// dependency-cruiser sees imports, not the global fetch; this closes that gap (rule 7)
const MODULES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'modules');

test('no module calls fetch or opens a socket itself', () => {
  const hits: string[] = [];
  for (const entry of fs.readdirSync(MODULES, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.join(entry.parentPath, entry.name);
    fs.readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
      if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/.test(line)) hits.push(`${path.relative(MODULES, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});
