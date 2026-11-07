import { Injectable, Logger } from '@nestjs/common';
import type { AuditLogEntry, Paginated } from '@groundline/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEvent {
  organizationId?: string;
  actorUserId?: string;
  /** Dotted verb, e.g. `member.role_changed`. */
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit event. Pass a transaction client to make the record part of the same
   * transaction as the change it describes.
   */
  async record(event: AuditEvent, db: Db = this.prisma): Promise<void> {
    try {
      await db.auditLog.create({
        data: { ...event, metadata: (event.metadata ?? {}) as Prisma.InputJsonValue },
      });
    } catch (err) {
      // Outside a transaction an audit failure must not break the user's request.
      if (db !== this.prisma) throw err;
      this.logger.error(`Failed to record audit event ${event.action}: ${(err as Error).message}`);
    }
  }

  async list(organizationId: string, opts: { limit: number; cursor?: string }): Promise<Paginated<AuditLogEntry>> {
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId },
      include: { actor: { select: { id: true, email: true, fullName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map(toEntry);
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }
}

export function toEntry(row: Prisma.AuditLogGetPayload<{ include: { actor: { select: { id: true; email: true; fullName: true } } } }>): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
  };
}
