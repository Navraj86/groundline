import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  KNOWLEDGE_FILE_TYPES,
  KNOWLEDGE_MAX_FILE_BYTES,
  type AddTextSourceInput,
  type AddUrlSourceInput,
  type KnowledgeSource,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

const sourceInclude = {
  createdBy: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.KnowledgeSourceInclude;
type SourceRow = Prisma.KnowledgeSourceGetPayload<{ include: typeof sourceInclude }>;

export interface UploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** The channel the AI service's ingestion worker listens on. */
const INGEST_CHANNEL = 'knowledge_ingest';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string): Promise<KnowledgeSource[]> {
    const rows = await this.prisma.knowledgeSource.findMany({
      where: { organizationId },
      include: sourceInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSource);
  }

  async addFile(org: OrgContext, user: AuthContext, file: UploadedFileInput | undefined): Promise<KnowledgeSource> {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const { extension, mimeType } = validateFile(file);
    await this.entitlements.assertCanAddKnowledgeSource(org.organizationId);

    const id = randomUUID();
    const fileName = sanitizeFileName(file.originalname, extension);
    const fileKey = `orgs/${org.organizationId}/knowledge/${id}/${fileName}`;
    await this.storage.put(fileKey, file.buffer, mimeType);

    return this.create(org, user, {
      id,
      type: 'FILE',
      title: titleFromFileName(fileName),
      fileKey,
      fileName,
      mimeType,
      sizeBytes: file.size,
    });
  }

  async addUrl(org: OrgContext, user: AuthContext, input: AddUrlSourceInput): Promise<KnowledgeSource> {
    await this.entitlements.assertCanAddKnowledgeSource(org.organizationId);
    const existing = await this.prisma.knowledgeSource.findFirst({
      where: { organizationId: org.organizationId, type: 'URL', url: input.url },
      select: { id: true },
    });
    if (existing) throw new ConflictException('This page is already in your knowledge base. Reprocess it to refresh.');
    // Until the page is fetched, the URL is the title; the worker swaps in the page title.
    return this.create(org, user, { type: 'URL', title: input.title ?? input.url, url: input.url });
  }

  async addText(org: OrgContext, user: AuthContext, input: AddTextSourceInput): Promise<KnowledgeSource> {
    await this.entitlements.assertCanAddKnowledgeSource(org.organizationId);
    const id = randomUUID();
    const fileKey = `orgs/${org.organizationId}/knowledge/${id}/content.txt`;
    const body = Buffer.from(input.content, 'utf8');
    await this.storage.put(fileKey, body, 'text/plain; charset=utf-8');
    return this.create(org, user, {
      id,
      type: 'TEXT',
      title: input.title,
      fileKey,
      fileName: 'content.txt',
      mimeType: 'text/plain',
      sizeBytes: body.length,
    });
  }

  async rename(org: OrgContext, id: string, title: string): Promise<KnowledgeSource> {
    await this.find(org.organizationId, id);
    const row = await this.prisma.knowledgeSource.update({ where: { id }, data: { title }, include: sourceInclude });
    return toSource(row);
  }

  /** Re-runs ingestion: retries a failed source or refreshes a changed web page. */
  async reprocess(org: OrgContext, user: AuthContext, id: string): Promise<KnowledgeSource> {
    const source = await this.find(org.organizationId, id);
    if (source.status === 'PROCESSING' || source.status === 'PENDING') {
      throw new ConflictException('This source is already being processed.');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.knowledgeSource.update({
        where: { id },
        data: { status: 'PENDING', attempts: 0, error: null, lockedAt: null },
        include: sourceInclude,
      });
      await this.audit.record(
        {
          organizationId: org.organizationId,
          actorUserId: user.userId,
          action: 'knowledge.reprocessed',
          targetType: 'knowledge_source',
          targetId: id,
          metadata: { title: source.title },
        },
        tx,
      );
      return updated;
    });
    await this.notify(id);
    return toSource(row);
  }

  async remove(org: OrgContext, user: AuthContext, id: string): Promise<void> {
    const source = await this.find(org.organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      // Chunks cascade with the row, so the content is out of retrieval immediately (BR-014).
      await tx.knowledgeSource.delete({ where: { id } });
      await this.audit.record(
        {
          organizationId: org.organizationId,
          actorUserId: user.userId,
          action: 'knowledge.deleted',
          targetType: 'knowledge_source',
          targetId: id,
          metadata: { title: source.title, type: source.type },
        },
        tx,
      );
    });
    if (source.fileKey) await this.storage.delete(source.fileKey);
  }

  private async create(
    org: OrgContext,
    user: AuthContext,
    data: Omit<Prisma.KnowledgeSourceUncheckedCreateInput, 'organizationId' | 'createdById'>,
  ): Promise<KnowledgeSource> {
    let row: SourceRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.knowledgeSource.create({
          data: { ...data, organizationId: org.organizationId, createdById: user.userId },
          include: sourceInclude,
        });
        await this.audit.record(
          {
            organizationId: org.organizationId,
            actorUserId: user.userId,
            action: 'knowledge.added',
            targetType: 'knowledge_source',
            targetId: created.id,
            metadata: { title: created.title, type: created.type },
          },
          tx,
        );
        return created;
      });
    } catch (err) {
      if (data.fileKey) await this.storage.delete(data.fileKey);
      throw err;
    }
    await this.notify(row.id);
    return toSource(row);
  }

  private async find(organizationId: string, id: string) {
    const source = await this.prisma.knowledgeSource.findFirst({ where: { id, organizationId } });
    if (!source) throw new NotFoundException('Knowledge source not found');
    return source;
  }

  private async notify(id: string): Promise<void> {
    // Wakes the ingestion worker; if it's down, it finds the row when it next polls.
    await this.prisma.$executeRaw`SELECT pg_notify(${INGEST_CHANNEL}, ${id})`;
  }
}

function validateFile(file: UploadedFileInput): { extension: string; mimeType: string } {
  if (file.size === 0) throw new BadRequestException('The file is empty.');
  if (file.size > KNOWLEDGE_MAX_FILE_BYTES) throw new BadRequestException('Files can be up to 20 MB.');
  const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = KNOWLEDGE_FILE_TYPES[extension];
  if (!mimeType) throw new BadRequestException('Upload a PDF, plain text (.txt) or Markdown (.md) file.');
  // Don't trust the extension alone: a PDF must start with the PDF signature.
  if (mimeType === 'application/pdf' && file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new BadRequestException("This file isn't a valid PDF.");
  }
  return { extension, mimeType };
}

function sanitizeFileName(name: string, extension: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'document'}.${extension}`;
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || fileName;
}

function toSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    url: row.url,
    chunkCount: row.chunkCount,
    characterCount: row.characterCount,
    error: row.error,
    attempts: row.attempts,
    processedAt: row.processedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
  };
}
