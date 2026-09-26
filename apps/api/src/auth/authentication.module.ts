import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthenticatedSessionGuard } from './authenticated-session.guard.js';
import { AuthenticationService } from './authentication.service.js';
import { CsrfService } from './csrf.service.js';
import { CsrfOriginGuard } from './csrf-origin.guard.js';
import { OriginValidationService } from './origin-validation.service.js';
import { LoginRateLimiterService } from './login-rate-limiter.service.js';
import { PasswordHashService } from './password-hash.service.js';
import { PermissionGuard } from './permission.guard.js';
import { SessionTokenService } from './session-token.service.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthenticationService,
    CsrfService,
    OriginValidationService,
    LoginRateLimiterService,
    PasswordHashService,
    SessionService,
    SessionTokenService,
    { provide: APP_GUARD, useClass: AuthenticatedSessionGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthenticationService, PasswordHashService, SessionService],
})
export class AuthenticationModule {}
