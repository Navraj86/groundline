import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@groundline/shared';
import { z } from 'zod';
import type { AppRequest, OrgContext } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PERMISSION_KEY = 'org:permission';
const uuid = z.uuid();

/**
 * Resolves the caller's membership in the organization named by the `:orgId` route
 * parameter and enforces the route's required permission.
 *
 * Non-members get 404 rather than 403 so that organization ids can't be probed.
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const orgId = req.params.orgId;
    if (!req.auth || typeof orgId !== 'string' || !uuid.safeParse(orgId).success) {
      throw new NotFoundException('Organization not found');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.auth.userId } },
      select: { id: true, role: true },
    });
    if (!membership) throw new NotFoundException('Organization not found');

    req.org = { organizationId: orgId, memberId: membership.id, role: membership.role };

    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !hasPermission(membership.role, required)) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}

/** Marks a route as organization-scoped and requires `permission` (default: `org:read`). */
export function OrgScoped(permission: Permission = 'org:read') {
  return applyDecorators(SetMetadata(PERMISSION_KEY, permission), UseGuards(OrgAccessGuard));
}

/** The caller's membership in the route's organization, as resolved by `OrgAccessGuard`. */
export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => {
  const org = ctx.switchToHttp().getRequest<AppRequest>().org;
  if (!org) throw new Error('CurrentOrg used on a route without @OrgScoped()');
  return org;
});
