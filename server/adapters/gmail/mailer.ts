import nodemailer, { type Transporter } from 'nodemailer';
import type { Email, Logger, Mailer } from '../../ports/services';

/** Sends email through Gmail SMTP with an app password. */
export class GmailMailer implements Mailer {
  private readonly transporter: Transporter;

  constructor(
    private readonly user: string,
    appPassword: string,
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: appPassword },
      pool: true,
      maxConnections: 3,
    });
  }

  async send(email: Email): Promise<void> {
    await this.transporter.sendMail({
      from: { name: 'Saanjh', address: this.user },
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }
}

/**
 * Local development without SMTP: logs that an email would be sent.
 * Only the subject is logged, never the recipient or body.
 */
export class LogMailer implements Mailer {
  constructor(private readonly logger: Logger) {}

  send(email: Email): Promise<void> {
    this.logger.info('email not sent (no SMTP configured)', { subject: email.subject });
    return Promise.resolve();
  }
}
