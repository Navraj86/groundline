import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  inviteMemberSchema,
  type AcceptInvitationResult,
  type Invitation,
  type InvitationPreview,
  type InviteMemberInput,
} from '@groundline/shared';
import { z } from 'zod';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser, Public } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { InvitationsService, type InvitationCreated } from './invitations.service.js';

const tokenSchema = z.string().min(20).max(100);

@Controller('orgs/:orgId/invitations')
export class OrgInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @OrgScoped('members:manage')
  list(@CurrentOrg() org: OrgContext): Promise<Invitation[]> {
    return this.invitations.listPending(org.organizationId);
  }

  @Post()
  @OrgScoped('members:manage')
  invite(
    @CurrentUser() user: AuthContext,
    @CurrentOrg() org: OrgContext,
    @Body({ schema: inviteMemberSchema }) body: InviteMemberInput,
  ): Promise<InvitationCreated> {
    return this.invitations.invite(org, user, body);
  }

  @Delete(':invitationId')
  @OrgScoped('members:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: AuthContext,
    @CurrentOrg() org: OrgContext,
    @Param('invitationId', { schema: z.uuid() }) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(org, user.userId, invitationId);
  }
}

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Get(':token')
  preview(@Param('token', { schema: tokenSchema }) token: string): Promise<InvitationPreview> {
    return this.invitations.preview(token);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthContext,
    @Param('token', { schema: tokenSchema }) token: string,
  ): Promise<AcceptInvitationResult> {
    return this.invitations.accept(token, user);
  }
}
