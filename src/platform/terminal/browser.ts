import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export interface PaymentForm {
  url: string;
  fields: { name: string; value: string }[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function checkAction(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Payment page address is not a URL: ${url}`);
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) {
    throw new Error(`Payment page must use https: ${url}`);
  }
}

export function paymentHtml(form: PaymentForm): string {
  checkAction(form.url);
  const inputs = form.fields
    .map((f) => `<input type="hidden" name="${esc(f.name)}" value="${esc(f.value)}">`)
    .join('\n    ');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Opening payment page</title></head>
<body>
  <p>Opening the payment page. If nothing happens, press the button.</p>
  <form id="pay" method="POST" action="${esc(form.url)}">
    ${inputs}
    <button type="submit">Continue to payment</button>
  </form>
  <script>document.getElementById('pay').submit();</script>
</body></html>
`;
}

/**
 * Writes an auto-submit form to a private temp file and opens it in the browser.
 * The person types wallet details on the partner's page, never here.
 */
export function openPaymentPage(form: PaymentForm, opts: { open?: boolean } = {}): string {
  const html = paymentHtml(form);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-pay-'));
  const file = path.join(dir, `pay-${crypto.randomBytes(4).toString('hex')}.html`);
  fs.writeFileSync(file, html, { mode: 0o600 });
  if (opts.open !== false) openInBrowser(file);
  return file;
}

/** Opens a file path or an https address in the default browser. No shell is used. */
export function openInBrowser(target: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [target]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', target]]
        : ['xdg-open', [target]];
  const child = spawn(cmd, args as string[], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}
