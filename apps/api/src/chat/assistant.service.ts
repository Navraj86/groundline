import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_ASSISTANT_SETTINGS,
  type AssistantConfig,
  type AssistantSettings,
  type AssistantSettingsInput,
  type WidgetConfig,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export function newWidgetKey(): string {
  return `wk_${randomBytes(18).toString('base64url')}`;
}

export function readAssistantSettings(settings: Prisma.JsonValue): AssistantSettings {
  const raw = (settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>).assistant
    : undefined) as Partial<AssistantSettings> | undefined;
  return { ...DEFAULT_ASSISTANT_SETTINGS, ...raw };
}

/** Chat assistant configuration (FR-039) and the public widget key. */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(organizationId: string): Promise<AssistantConfig> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const widgetKey = org.widgetKey ?? (await this.ensureWidgetKey(organizationId));
    return { settings: readAssistantSettings(org.settings), widgetKey };
  }

  async update(organizationId: string, actorUserId: string, input: AssistantSettingsInput): Promise<AssistantConfig> {
    await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const settings = { ...(org.settings as Record<string, unknown> | null), assistant: input };
      await tx.organization.update({
        where: { id: organizationId },
        data: { settings: settings as Prisma.InputJsonValue },
      });
      await this.audit.record(
        { organizationId, actorUserId, action: 'assistant.updated', targetType: 'organization', targetId: organizationId },
        tx,
      );
    });
    return this.get(organizationId);
  }

  /** Issues a new widget key. Sites embedding the old key stop working immediately. */
  async rotateKey(organizationId: string, actorUserId: string): Promise<AssistantConfig> {
    await this.prisma.organization.update({ where: { id: organizationId }, data: { widgetKey: newWidgetKey() } });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'assistant.widget_key_rotated',
      targetType: 'organization',
      targetId: organizationId,
    });
    return this.get(organizationId);
  }

  async resolveWidget(widgetKey: string): Promise<{ organizationId: string; organizationName: string; settings: AssistantSettings }> {
    const org = await this.prisma.organization.findUnique({ where: { widgetKey } });
    if (!org) throw new NotFoundException('This chat widget is not configured.');
    return { organizationId: org.id, organizationName: org.name, settings: readAssistantSettings(org.settings) };
  }

  async widgetConfig(widgetKey: string): Promise<WidgetConfig> {
    const { organizationName, settings } = await this.resolveWidget(widgetKey);
    return {
      organizationName,
      assistantName: settings.name,
      greeting: settings.greeting,
      brandColor: settings.brandColor,
    };
  }

  private async ensureWidgetKey(organizationId: string): Promise<string> {
    // Only set it if still empty, so concurrent first requests agree on one key.
    await this.prisma.organization.updateMany({
      where: { id: organizationId, widgetKey: null },
      data: { widgetKey: newWidgetKey() },
    });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return org.widgetKey!;
  }
}
