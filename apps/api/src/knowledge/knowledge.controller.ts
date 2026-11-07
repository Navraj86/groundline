import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  addTextSourceSchema,
  addUrlSourceSchema,
  KNOWLEDGE_MAX_FILE_BYTES,
  renameSourceSchema,
  type AddTextSourceInput,
  type AddUrlSourceInput,
  type KnowledgeSource,
  type RenameSourceInput,
} from '@groundline/shared';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { KnowledgeService, type UploadedFileInput } from './knowledge.service.js';

const sourceId = { schema: z.uuid() };

@Controller('orgs/:orgId/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @OrgScoped('knowledge:read')
  list(@CurrentOrg() org: OrgContext): Promise<KnowledgeSource[]> {
    return this.knowledge.list(org.organizationId);
  }

  @Post('files')
  @OrgScoped('knowledge:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // One byte over the limit lets the service report a friendly error instead of a 413.
      limits: { fileSize: KNOWLEDGE_MAX_FILE_BYTES + 1, files: 1 },
    }),
  )
  uploadFile(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @UploadedFile() file: UploadedFileInput | undefined,
  ): Promise<KnowledgeSource> {
    return this.knowledge.addFile(org, user, file);
  }

  @Post('urls')
  @OrgScoped('knowledge:manage')
  addUrl(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: addUrlSourceSchema }) body: AddUrlSourceInput,
  ): Promise<KnowledgeSource> {
    return this.knowledge.addUrl(org, user, body);
  }

  @Post('text')
  @OrgScoped('knowledge:manage')
  addText(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: addTextSourceSchema }) body: AddTextSourceInput,
  ): Promise<KnowledgeSource> {
    return this.knowledge.addText(org, user, body);
  }

  @Patch(':sourceId')
  @OrgScoped('knowledge:manage')
  rename(
    @CurrentOrg() org: OrgContext,
    @Param('sourceId', sourceId) id: string,
    @Body({ schema: renameSourceSchema }) body: RenameSourceInput,
  ): Promise<KnowledgeSource> {
    return this.knowledge.rename(org, id, body.title);
  }

  @Post(':sourceId/reprocess')
  @OrgScoped('knowledge:manage')
  @HttpCode(HttpStatus.ACCEPTED)
  reprocess(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('sourceId', sourceId) id: string,
  ): Promise<KnowledgeSource> {
    return this.knowledge.reprocess(org, user, id);
  }

  @Delete(':sourceId')
  @OrgScoped('knowledge:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('sourceId', sourceId) id: string,
  ): Promise<void> {
    return this.knowledge.remove(org, user, id);
  }
}
