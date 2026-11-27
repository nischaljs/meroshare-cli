#!/usr/bin/env node
// Packs the package as npm would publish it, installs the tarball into an empty folder and
// runs the installed `ipo` and `meroshare-cli` with --help and --version only.
// HOME and IPO_HOME point to an empty temp folder, so nothing reads or writes a real config,
// and nothing here talks to MeroShare.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'meroshare-cli-pack-'));

function fail(message) {
  console.error(`test:pack: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

try {
  // 1. Pack (runs prepack, which builds dist/)
  const out = execFileSync(npm, ['pack', '--json', '--pack-destination', work], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });
  const [info] = JSON.parse(out.slice(out.indexOf('[')));
  const files = info.files.map((f) => f.path);
  console.log(`packed ${info.filename}: ${files.length} files, ${info.size} bytes (${info.unpackedSize} unpacked)`);

  for (const need of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'dist/bin/cli.js']) {
    if (!files.includes(need)) fail(`the tarball has no ${need}`);
  }
  const stray = files.filter(
    (f) => !['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'].includes(f) && !/^dist\/(bin|src)\/.+\.js$/.test(f),
  );
  if (stray.length) fail(`the tarball has files the CLI does not need: ${stray.join(', ')}`);
  if (files.some((f) => /\.test\.js$/.test(f))) fail('the tarball has test files');

  // 2. Install the tarball into an empty project
  const prefix = path.join(work, 'install');
  fs.mkdirSync(prefix);
  fs.writeFileSync(path.join(prefix, 'package.json'), '{"name":"pack-smoke","private":true}\n');
  execFileSync(npm, ['install', '--no-audit', '--no-fund', '--ignore-scripts', path.join(work, info.filename)], {
    cwd: prefix,
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (fs.existsSync(path.join(prefix, 'node_modules', 'tsx'))) fail('tsx was installed: it must not be a runtime dependency');

  // 3. Run the installed bins with an empty HOME
  const home = path.join(work, 'home');
  fs.mkdirSync(home);
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, IPO_HOME: path.join(home, '.ipo'), NO_COLOR: '1' };
  const binDir = path.join(prefix, 'node_modules', '.bin');
  const run = (bin, arg) =>
    execFileSync(path.join(binDir, process.platform === 'win32' ? `${bin}.cmd` : bin), [arg], {
      cwd: work,
      env,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim();

  for (const bin of ['ipo', 'meroshare-cli']) {
    const help = run(bin, '--help');
    if (!help.includes('Usage: ipo')) fail(`${bin} --help did not print the usage:\n${help}`);
    const version = run(bin, '--version');
    if (version !== pkg.version) fail(`${bin} --version printed ${version}, package.json says ${pkg.version}`);
    console.log(`${bin} --help and --version: ok (${version})`);
  }
  if (fs.readdirSync(home).length) fail(`--help or --version wrote to HOME: ${fs.readdirSync(home).join(', ')}`);
  console.log('test:pack: ok');
} catch (err) {
  if (!process.exitCode) {
    console.error(`test:pack: ${err.message}`);
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
