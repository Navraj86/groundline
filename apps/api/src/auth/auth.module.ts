import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { SupabaseAuthClient } from './supabase-auth.client.js';
import { TokenVerifier } from './token-verifier.service.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [SupabaseAuthClient, TokenVerifier, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SupabaseAuthClient, TokenVerifier],
})
export class AuthModule {}
