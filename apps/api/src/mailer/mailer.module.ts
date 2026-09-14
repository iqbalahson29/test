import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthClock, AuthRandom } from '../auth/security/primitives';
import {
  BrevoMailDriver,
  ConsoleMailDriver,
  MAIL_DRIVER_TOKEN,
  RecordingMailDriver,
} from './mail-driver';
import { MailerService } from './mailer.service';
import { WebhookService } from './webhook.service';
@Global()
@Module({
  providers: [
    AuthClock,
    AuthRandom,
    {
      provide: MAIL_DRIVER_TOKEN,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const kind = c.get<string>('MAIL_DRIVER') ?? '';
        if (kind === 'brevo') return new BrevoMailDriver(c);
        if (kind === 'console') return new ConsoleMailDriver(c);
        if (
          c.get('NODE_ENV') === 'test' &&
          ['recording', 'noop'].includes(kind)
        )
          return new RecordingMailDriver();
        throw new Error('Unsupported mail driver');
      },
    },
    MailerService,
    WebhookService,
  ],
  exports: [
    AuthClock,
    AuthRandom,
    MailerService,
    WebhookService,
    MAIL_DRIVER_TOKEN,
  ],
})
export class MailerModule {}
