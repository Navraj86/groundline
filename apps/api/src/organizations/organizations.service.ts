import { ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  hasPermission,
  slugify,
  type CreateOrganizationInput,
  type Organization,
  type OrganizationOverview,
  type OrgRole,
  type UpdateOrganizationInput,
} from '@groundline/shared';
import { AuditService, toEntry } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const RESERVED_SLUGS = new Set(['new', 'admin', 'api', 'app', 'settings', 'onboarding', 'login', 'signup']);

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Creates an organization and makes the creator its owner. */
  async create(userId: string, input: CreateOrganizationInput): Promise<Organization> {
    const explicitSlug = input.slug !== undefined;
    let slug = input.slug ?? (slugify(input.name) || 'org');
    if (slug.length < 3) slug = `${slug}-org`;

    for (let attempt = 0; attempt < 5; attempt++) {
      if (RESERVED_SLUGS.has(slug)) {
        if (explicitSlug) throw new ConflictException('That URL is reserved. Choose another.');
        slug = withSuffix(slug);
        continue;
      }
      try {
        const org = await this.prisma.$transaction(async (tx) => {
          const created = await tx.organization.create({
            data: { name: input.name, slug, members: { create: { userId, role: 'OWNER' } } },
          });
          await this.audit.record(
            {
              organizationId: created.id,
              actorUserId: userId,
              action: 'organization.created',
              targetType: 'organization',
              targetId: created.id,
              metadata: { name: created.name, slug: created.slug },
            },
            tx,
          );
          return created;
        });
        return toOrganization(org, 'OWNER');
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (explicitSlug) throw new ConflictException('That URL is already taken. Choose another.');
        slug = withSuffix(slug);
      }
    }
    throw new ConflictException('Could not generate a unique URL. Provide one explicitly.');
  }

  async get(organizationId: string, role: OrgRole): Promise<Organization> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return toOrganization(org, role);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    role: OrgRole,
    input: UpdateOrganizationInput,
  ): Promise<Organization> {
    if (input.slug && RESERVED_SLUGS.has(input.slug)) {
      throw new ConflictException('That URL is reserved. Choose another.');
    }
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    try {
      const org = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.organization.update({
          where: { id: organizationId },
          data: { name: input.name, slug: input.slug },
        });
        await this.audit.record(
          {
            organizationId,
            actorUserId,
            action: 'organization.updated',
            targetType: 'organization',
            targetId: organizationId,
            metadata: diff(before, updated, ['name', 'slug']),
          },
          tx,
        );
        return updated;
      });
      return toOrganization(org, role);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('That URL is already taken. Choose another.');
      throw err;
    }
  }

  async overview(organizationId: string, role: OrgRole): Promise<OrganizationOverview> {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [members, pendingInvitations, knowledgeSources, conversations, needsHuman, recent] = await Promise.all([
      this.prisma.organizationMember.count({ where: { organizationId } }),
      this.prisma.invitation.count({ where: { organizationId, status: 'PENDING', expiresAt: { gt: now } } }),
      this.prisma.knowledgeSource.count({ where: { organizationId, status: 'READY' } }),
      this.prisma.conversation.count({
        where: { organizationId, channel: 'WIDGET', createdAt: { gte: since }, messages: { some: {} } },
      }),
      // Escalated conversations stand in for open tickets until the ticketing module lands.
      this.prisma.conversation.count({ where: { organizationId, status: 'ESCALATED' } }),
      hasPermission(role, 'audit:read')
        ? this.prisma.auditLog.findMany({
            where: { organizationId },
            include: { actor: { select: { id: true, email: true, fullName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 8,
          })
        : Promise.resolve([]),
    ]);
    return {
      members,
      pendingInvitations,
      knowledgeSources,
      conversations,
      openTickets: needsHuman,
      recentActivity: recent.map(toEntry),
    };
  }
}

function toOrganization(
  org: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date },
  role: OrgRole,
): Organization {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

function withSuffix(slug: string): string {
  return `${slug.slice(0, 40)}-${randomBytes(2).toString('hex')}`;
}

function diff<T extends Record<string, unknown>>(before: T, after: T, keys: (keyof T)[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    if (before[key] !== after[key]) changes[key as string] = { from: before[key], to: after[key] };
  }
  return { changes };
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
