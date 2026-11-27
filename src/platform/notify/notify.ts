import nodemailer from 'nodemailer';
import type { Store } from '../store/public.js';
import { EmailSection } from './state.js';

export type NoticeKind =
  | 'applied'
  | 'resultOut'
  | 'allocated'
  | 'notAllocated'
  | 'passwordChanged'
  | 'renewalDue'
  | 'accountBlocked'
  | 'test';

/** What a module sends. It never says how the notice is delivered. */
export interface Notice {
  kind: NoticeKind;
  account?: string;
  subject: string;
  lines: string[];
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface SmtpSettings {
  email: string;
  appPassword: string;
  smtpHost: string;
  smtpPort: number;
}

export type Transport = (smtp: SmtpSettings, message: EmailMessage) => Promise<void>;

export const smtpTransport: Transport = async (smtp, message) => {
  const transporter = nodemailer.createTransport({
    host: smtp.smtpHost,
    port: smtp.smtpPort,
    secure: smtp.smtpPort === 465,
    auth: { user: smtp.email, pass: smtp.appPassword },
  });
  await transporter.sendMail(message);
};

export interface NotifierOptions {
  /** Where the terminal channel writes. Default: console.log. Pass null to turn it off. */
  print?: ((line: string) => void) | null;
  transport?: Transport;
}

export interface Delivery {
  terminal: boolean;
  email: 'sent' | 'off' | 'failed';
  error?: string;
}

export interface Notifier {
  send(notice: Notice): Promise<Delivery>;
  /** Sends a test email with the given settings, without storing them. */
  test(smtp: SmtpSettings): Promise<void>;
}

function render(notice: Notice): string {
  const head = notice.account ? `Account: ${notice.account}\n\n` : '';
  return `${head}${notice.lines.join('\n')}\n`;
}

export function createNotifier(store: Store, opts: NotifierOptions = {}): Notifier {
  const print = opts.print === undefined ? (l: string) => console.log(l) : opts.print;
  const transport = opts.transport ?? smtpTransport;

  async function deliver(smtp: SmtpSettings, notice: Notice): Promise<void> {
    await transport(smtp, {
      from: smtp.email,
      to: smtp.email,
      subject: `[IPO CLI] ${notice.subject}`,
      text: render(notice),
    });
  }

  return {
    async send(notice) {
      if (print) print(`[notice] ${notice.account ? `${notice.account}: ` : ''}${notice.subject}`);
      const delivery: Delivery = { terminal: !!print, email: 'off' };
      const email = store.exists() ? store.section(EmailSection).read().value : null;
      if (!email || !store.unlocked || email.events[notice.kind] === false) return delivery;
      try {
        await deliver(email, notice);
        delivery.email = 'sent';
      } catch (err) {
        delivery.email = 'failed';
        delivery.error = (err as Error).message;
        if (print) print(`[notice] email failed: ${delivery.error}`);
      }
      return delivery;
    },
    async test(smtp) {
      await deliver(smtp, {
        kind: 'test',
        subject: 'Test Notification',
        lines: ['This is a test email from IPO CLI. If you received this, email notifications are working.'],
      });
    },
  };
}
