import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mailer } from '@nestjs/mail';
import { createHash, randomBytes } from 'node:crypto';
import {
  assignableRoles,
  type AcceptInvitationResult,
  type Invitation,
  type InvitationPreview,
  type InviteMemberInput,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { invitationMail } from './invitation.mail.js';

const invitationInclude = {
  invitedBy: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.InvitationInclude;

type InvitationRow = Prisma.InvitationGetPayload<{ include: typeof invitationInclude }>;

export interface InvitationCreated {
  invitation: Invitation;
  emailSent: boolean;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly webUrl: string;
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    private readonly entitlements: EntitlementsService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
    this.ttlMs = config.get('INVITATION_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;
  }

  async listPending(organizationId: string): Promise<Invitation[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { organizationId, status: 'PENDING' },
      include: invitationInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toInvitation);
  }

  /**
   * Invites someone by email. Re-inviting an address with a pending invitation replaces it,
   * which also serves as "resend".
   */
  async invite(actor: OrgContext, user: AuthContext, input: InviteMemberInput): Promise<InvitationCreated> {
    if (!assignableRoles(actor.role).includes(input.role)) {
      throw new ForbiddenException('You cannot invite someone with this role');
    }

    const existingMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId: actor.organizationId, user: { email: input.email } },
      select: { id: true },
    });
    if (existingMember) throw new ConflictException(`${input.email} is already a member of this organization`);
    await this.entitlements.assertCanInvite(actor.organizationId, input.email);

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { organizationId: actor.organizationId, email: input.email, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      const created = await tx.invitation.create({
        data: {
          organizationId: actor.organizationId,
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedById: user.userId,
          expiresAt,
        },
        include: { ...invitationInclude, organization: { select: { name: true } } },
      });
      await this.audit.record(
        {
          organizationId: actor.organizationId,
          actorUserId: user.userId,
          action: 'invitation.created',
          targetType: 'invitation',
          targetId: created.id,
          metadata: { email: input.email, role: input.role },
        },
        tx,
      );
      return created;
    });

    const emailSent = await this.sendInvitationEmail(row, token);
    return { invitation: toInvitation(row), emailSent };
  }

  async revoke(actor: OrgContext, actorUserId: string, invitationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findFirst({
        where: { id: invitationId, organizationId: actor.organizationId, status: 'PENDING' },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (!assignableRoles(actor.role).includes(invitation.role)) {
        throw new ForbiddenException('You cannot revoke this invitation');
      }
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: 'REVOKED' } });
      await this.audit.record(
        {
          organizationId: actor.organizationId,
          actorUserId,
          action: 'invitation.revoked',
          targetType: 'invitation',
          targetId: invitation.id,
          metadata: { email: invitation.email, role: invitation.role },
        },
        tx,
      );
    });
  }

  /** Public preview shown on the accept page before the user signs in. */
  async preview(token: string): Promise<InvitationPreview> {
    const row = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { name: true } }, invitedBy: { select: { fullName: true, email: true } } },
    });
    if (!row) throw new NotFoundException('This invitation link is invalid');
    return {
      organizationName: row.organization.name,
      email: row.email,
      role: row.role,
      invitedByName: row.invitedBy?.fullName ?? row.invitedBy?.email ?? null,
      expiresAt: row.expiresAt.toISOString(),
      status: row.status === 'PENDING' && row.expiresAt <= new Date() ? 'EXPIRED' : row.status,
    };
  }

  async accept(token: string, user: AuthContext): Promise<AcceptInvitationResult> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the invitation so it can't be accepted twice concurrently.
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM invitations WHERE token_hash = ${hashToken(token)} FOR UPDATE`;
      if (!locked) throw new NotFoundException('This invitation link is invalid');

      const invitation = await tx.invitation.findUniqueOrThrow({
        where: { id: locked.id },
        include: { organization: { select: { id: true, name: true, slug: true } } },
      });
      if (invitation.status === 'REVOKED') throw new GoneException('This invitation has been revoked');
      if (invitation.status === 'ACCEPTED') throw new GoneException('This invitation has already been used');
      if (invitation.expiresAt <= new Date()) throw new GoneException('This invitation has expired');
      if (invitation.email !== user.email) {
        throw new ForbiddenException(
          `This invitation was sent to ${invitation.email}. Sign in with that email address to accept it.`,
        );
      }

      const alreadyMember = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.userId } },
      });
      if (!alreadyMember) await this.entitlements.assertCanJoin(invitation.organizationId, tx);

      const membership = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.userId } },
        create: { organizationId: invitation.organizationId, userId: user.userId, role: invitation.role },
        update: {},
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: user.userId },
      });
      await this.audit.record(
        {
          organizationId: invitation.organizationId,
          actorUserId: user.userId,
          action: 'member.joined',
          targetType: 'member',
          targetId: membership.id,
          metadata: { email: user.email, role: membership.role, invitationId: invitation.id },
        },
        tx,
      );
      return { organization: { ...invitation.organization, role: membership.role } };
    });
  }

  private async sendInvitationEmail(
    row: InvitationRow & { organization: { name: string } },
    token: string,
  ): Promise<boolean> {
    const content = invitationMail({
      organizationName: row.organization.name,
      inviterName: row.invitedBy?.fullName ?? row.invitedBy?.email ?? 'A teammate',
      role: row.role,
      acceptUrl: `${this.webUrl}/invite/${token}`,
      expiresAt: row.expiresAt,
    });
    try {
      await this.mailer.send({ to: row.email, ...content, idempotencyKey: `invitation-${row.id}` });
      return true;
    } catch (err) {
      // The invitation exists either way; the UI offers to resend.
      this.logger.error(`Failed to send invitation ${row.id}: ${(err as Error).message}`);
      return false;
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedBy: row.invitedBy,
  };
}
