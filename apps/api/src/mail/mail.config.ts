import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule, SmtpTransport } from '@nestjs/mail';
import type { Env } from '../config/env.js';

/**
 * Outgoing email. Development points SMTP_URL at Mailpit (http://localhost:8025);
 * production points it at the real provider's SMTP relay.
 */
export const AppMailModule = MailModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    transport: new SmtpTransport({ url: config.get('SMTP_URL', { infer: true }) }),
    from: config.get('MAIL_FROM', { infer: true }),
    retry: 3,
  }),
});
