import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailerModule } from '../mailer/mailer.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { IdentifierService } from './identifier.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AuthCookies } from './security/cookies';
import { SecurityEventsService } from './security/security-events.service';
import { RateLimitsService } from './security/rate-limits.service';
import { AuthPolicyService } from './auth-policy.service';
import { OtpService } from './otp.service';
import { AuthCompletionService } from './auth-completion.service';
import { CredentialsService } from './credentials.service';
import { GoogleService } from './google.service';
import { AuthSweeperService } from './security/auth-sweeper.service';
import { OptionalAccessGuard } from './security/optional-access.guard';
const providers = [
  AuthSweeperService,
  AuthService,
  JwtStrategy,
  IdentifierService,
  PasswordService,
  SessionService,
  AuthCookies,
  SecurityEventsService,
  RateLimitsService,
  AuthPolicyService,
  OtpService,
  AuthCompletionService,
  CredentialsService,
  GoogleService,
  OptionalAccessGuard,
];
@Global()
@Module({
  imports: [PassportModule, JwtModule.register({}), MailerModule],
  controllers: [AuthController],
  providers,
  exports: [...providers, JwtModule],
})
export class AuthModule {}
