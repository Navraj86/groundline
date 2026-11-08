import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AgentModule } from './agent/agent.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { ChatModule } from './chat/chat.module.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { AppMailModule } from './mail/mail.config.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
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
    CommonModule,
    QueueModule,
    AppMailModule,
    StorageModule,
    AuditModule,
    BillingModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    InvitationsModule,
    KnowledgeModule,
    ChatModule,
    TicketsModule,
    AgentModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
