import nodemailer from 'nodemailer';
import type { EmailConfig } from '../store/types.js';

export async function sendNotification(
  config: EmailConfig,
  subject: string,
  body: string,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.email,
      pass: config.appPassword,
    },
  });

  await transporter.sendMail({
    from: config.email,
    to: config.email,
    subject: `[IPO CLI] ${subject}`,
    text: body,
  });
}

export async function sendTestEmail(config: EmailConfig): Promise<void> {
  await sendNotification(
    config,
    'Test Notification',
    'This is a test email from IPO CLI. If you received this, email notifications are working correctly.',
  );
}
