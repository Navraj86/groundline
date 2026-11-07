import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  refreshSessionSchema,
  resendConfirmationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type AuthSession,
  type ForgotPasswordInput,
  type RefreshSessionInput,
  type ResendConfirmationInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
  type SignUpResult,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from './auth.types.js';
import { CurrentUser, Public } from './decorators.js';
import { SupabaseAuthClient } from './supabase-auth.client.js';

// Credential endpoints get a tighter limit than the API default.
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly supabase: SupabaseAuthClient,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('sign-up')
  async signUp(@Body({ schema: signUpSchema }) body: SignUpInput): Promise<SignUpResult> {
    const session = await this.supabase.signUp(body.email, body.password, body.fullName, body.next);
    return { confirmationRequired: session === null, session };
  }

  @Public()
  @Throttle(STRICT)
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(@Body({ schema: signInSchema }) body: SignInInput): Promise<AuthSession> {
    return this.supabase.signInWithPassword(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body({ schema: refreshSessionSchema }) body: RefreshSessionInput): Promise<AuthSession> {
    return this.supabase.refresh(body.refreshToken);
  }

  @Public()
  @Throttle(STRICT)
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body({ schema: forgotPasswordSchema }) body: ForgotPasswordInput) {
    // Same response whether or not the account exists, so emails can't be enumerated.
    await this.supabase.sendPasswordReset(body.email).catch(() => undefined);
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @Post('resend-confirmation')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendConfirmation(@Body({ schema: resendConfirmationSchema }) body: ResendConfirmationInput) {
    await this.supabase.resendConfirmation(body.email).catch(() => undefined);
    return { ok: true };
  }

  /** Sets a new password. Called with the session created by a password-reset link. */
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @CurrentUser() user: AuthContext,
    @Body({ schema: resetPasswordSchema }) body: ResetPasswordInput,
  ) {
    await this.supabase.updatePassword(user.accessToken, body.password);
    await this.audit.record({ actorUserId: user.userId, action: 'user.password_changed' });
    return { ok: true };
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@CurrentUser() user: AuthContext): Promise<void> {
    await this.supabase.signOut(user.accessToken).catch(() => undefined);
  }
}
