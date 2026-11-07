import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assignableRoles, canManageMember, type Member, type OrgRole } from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import type { OrgContext } from '../auth/auth.types.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const memberInclude = {
  user: { select: { id: true, email: true, fullName: true, avatarUrl: true } },
} satisfies Prisma.OrganizationMemberInclude;

type MemberRow = Prisma.OrganizationMemberGetPayload<{ include: typeof memberInclude }>;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string): Promise<Member[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: memberInclude,
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map(toMember);
  }

  async changeRole(actor: OrgContext, actorUserId: string, memberId: string, role: OrgRole): Promise<Member> {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.findMember(tx, actor.organizationId, memberId);
      if (target.role === role) return toMember(target);

      if (!canManageMember(actor.role, target.role) || !assignableRoles(actor.role).includes(role)) {
        throw new ForbiddenException('You cannot assign this role');
      }
      if (target.role === 'OWNER') await this.assertAnotherOwner(tx, actor.organizationId);

      const updated = await tx.organizationMember.update({
        where: { id: target.id },
        data: { role },
        include: memberInclude,
      });
      await this.audit.record(
        {
          organizationId: actor.organizationId,
          actorUserId,
          action: 'member.role_changed',
          targetType: 'member',
          targetId: target.id,
          metadata: { email: target.user.email, from: target.role, to: role },
        },
        tx,
      );
      return toMember(updated);
    });
  }

  /** Removes a member. Any member may remove themselves (leave); others need `members:manage`. */
  async remove(actor: OrgContext, actorUserId: string, memberId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.findMember(tx, actor.organizationId, memberId);
      const leaving = target.id === actor.memberId;

      if (!leaving && !canManageMember(actor.role, target.role)) {
        throw new ForbiddenException('You cannot remove this member');
      }
      if (target.role === 'OWNER') await this.assertAnotherOwner(tx, actor.organizationId);

      await tx.organizationMember.delete({ where: { id: target.id } });
      await this.audit.record(
        {
          organizationId: actor.organizationId,
          actorUserId,
          action: leaving ? 'member.left' : 'member.removed',
          targetType: 'member',
          targetId: target.id,
          metadata: { email: target.user.email, role: target.role },
        },
        tx,
      );
    });
  }

  private async findMember(tx: Prisma.TransactionClient, organizationId: string, memberId: string) {
    const member = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      include: memberInclude,
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  /** An organization must always keep at least one owner. */
  private async assertAnotherOwner(tx: Prisma.TransactionClient, organizationId: string) {
    // Lock the owner rows so two concurrent demotions can't both pass this check.
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM organization_members
      WHERE organization_id = ${organizationId}::uuid AND role = 'OWNER'
      FOR UPDATE`;
    if (owners.length <= 1) {
      throw new BadRequestException('An organization needs at least one owner. Make someone else an owner first.');
    }
  }
}

function toMember(row: MemberRow): Member {
  return { id: row.id, role: row.role, joinedAt: row.createdAt.toISOString(), user: row.user };
}
