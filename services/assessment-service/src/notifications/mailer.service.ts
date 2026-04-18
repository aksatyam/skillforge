import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailMode = 'console' | 'smtp' | 'ses';

/**
 * Mode-aware email transport.
 *
 *   console → Logger stdout (dev default, no network)
 *   smtp    → nodemailer (Mailhog-compatible for dev, real SMTP in staging/prod)
 *   ses     → Phase 3 — throws at send time so premature flip fails loudly
 *
 * Does NOT throw on per-message SMTP errors — returns `{ ok: false, error }`
 * so the reminder worker can continue iterating across employees.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  private readonly mode: EmailMode;
  private readonly from: string;
  private transporter: Transporter | null = null;

  constructor() {
    const raw = (process.env.EMAIL_MODE ?? 'console').toLowerCase();
    if (raw !== 'console' && raw !== 'smtp' && raw !== 'ses') {
      throw new Error(`Invalid EMAIL_MODE="${raw}" — must be console, smtp, or ses`);
    }
    this.mode = raw;
    this.from = process.env.EMAIL_FROM ?? 'no-reply@skillforge.local';

    if (this.mode === 'smtp') {
      this.transporter = this.buildSmtpTransporter();
    }

    this.logger.log(`Initialized in ${this.mode} mode (from: ${this.from})`);
  }

  async send(msg: MailMessage): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      switch (this.mode) {
        case 'console':
          return this.sendConsole(msg);
        case 'smtp':
          return await this.sendSmtp(msg);
        case 'ses':
          throw new Error('EMAIL_MODE=ses is not implemented yet (Phase 3)');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`send failed to ${msg.to}: ${message}`);
      return { ok: false, error: message };
    }
  }

  private sendConsole(msg: MailMessage): { ok: true } {
    const htmlPreview = msg.html
      ? `\n[html-preview] ${msg.html.replace(/\s+/g, ' ').slice(0, 200)}${msg.html.length > 200 ? '…' : ''}`
      : '';
    this.logger.log(
      `[console-mail] to=${msg.to} subject="${msg.subject}"\n${msg.text}${htmlPreview}`,
    );
    return { ok: true };
  }

  private async sendSmtp(
    msg: MailMessage,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.transporter) return { ok: false, error: 'SMTP transporter not initialized' };
    const info = await this.transporter.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    this.logger.debug(`smtp sent messageId=${info.messageId} to=${msg.to}`);
    return { ok: true };
  }

  private buildSmtpTransporter(): Transporter {
    const host = process.env.SMTP_HOST ?? 'localhost';
    const port = Number(process.env.SMTP_PORT ?? 1025);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }
}
