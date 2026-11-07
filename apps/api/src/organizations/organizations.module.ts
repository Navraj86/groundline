import { Module } from '@nestjs/common';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { OrgAccessGuard } from './org-access.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  controllers: [OrganizationsController, MembersController],
  providers: [OrganizationsService, MembersService, OrgAccessGuard],
  exports: [OrgAccessGuard],
})
export class OrganizationsModule {}
