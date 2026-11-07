import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { updateMemberRoleSchema, type Member, type UpdateMemberRoleInput } from '@groundline/shared';
import { z } from 'zod';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { MembersService } from './members.service.js';
import { CurrentOrg, OrgScoped } from './org-access.js';

@Controller('orgs/:orgId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @OrgScoped('members:read')
  list(@CurrentOrg() org: OrgContext): Promise<Member[]> {
    return this.members.list(org.organizationId);
  }

  @Patch(':memberId')
  @OrgScoped('members:manage')
  changeRole(
    @CurrentUser() user: AuthContext,
    @CurrentOrg() org: OrgContext,
    @Param('memberId', { schema: z.uuid() }) memberId: string,
    @Body({ schema: updateMemberRoleSchema }) body: UpdateMemberRoleInput,
  ): Promise<Member> {
    return this.members.changeRole(org, user.userId, memberId, body.role);
  }

  // Permission is checked in the service: members may always remove themselves.
  @Delete(':memberId')
  @OrgScoped('org:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthContext,
    @CurrentOrg() org: OrgContext,
    @Param('memberId', { schema: z.uuid() }) memberId: string,
  ): Promise<void> {
    return this.members.remove(org, user.userId, memberId);
  }
}
