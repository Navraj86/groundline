import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Run from apps/api, the shared .env lives at the repository root.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    // Default API rate limit; credential endpoints apply a stricter one.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
