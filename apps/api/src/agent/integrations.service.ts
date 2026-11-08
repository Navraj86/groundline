import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ActionsApiIntegrationInput,
  IdentitySettings,
  IntegrationView,
  SandboxIntegrationInput,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import { assertPublicUrl } from '../common/public-url.js';
import { SecretBox } from '../common/secret-box.service.js';
import type { Env } from '../config/env.js';
import type { Integration } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActionsApiConnector } from './connectors/actions-api.connector.js';
import type { CommerceConnector } from './connectors/connector.js';
import { SandboxConnector } from './connectors/sandbox.connector.js';

/** Connectors the agent's account tools use, and the widget identity secret. */
@Injectable()
export class IntegrationsService {
  private readonly allowPrivateUrls: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.allowPrivateUrls = config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  // ---- Connectors ----------------------------------------------------------------------

  async list(organizationId: string): Promise<IntegrationView[]> {
    const rows = await this.prisma.integration.findMany({ where: { organizationId } });
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    return (['SANDBOX', 'ACTIONS_API'] as const).map((kind) => this.toView(kind, byKind.get(kind)));
  }

  async setSandbox(organizationId: string, actorUserId: string, input: SandboxIntegrationInput): Promise<IntegrationView[]> {
    await this.prisma.integration.upsert({
      where: { organizationId_kind: { organizationId, kind: 'SANDBOX' } },
      create: { organizationId, kind: 'SANDBOX', enabled: input.enabled },
      update: { enabled: input.enabled },
    });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'integration.updated',
      targetType: 'integration',
      targetId: 'SANDBOX',
      metadata: { enabled: input.enabled },
    });
    return this.list(organizationId);
  }

  async setActionsApi(
    organizationId: string,
    actorUserId: string,
    input: ActionsApiIntegrationInput,
  ): Promise<IntegrationView[]> {
    await assertPublicUrl(input.baseUrl, { allowPrivate: this.allowPrivateUrls });
    const existing = await this.prisma.integration.findUnique({
      where: { organizationId_kind: { organizationId, kind: 'ACTIONS_API' } },
    });
    await this.prisma.integration.upsert({
      where: { organizationId_kind: { organizationId, kind: 'ACTIONS_API' } },
      create: {
        organizationId,
        kind: 'ACTIONS_API',
        enabled: input.enabled,
        config: { baseUrl: input.baseUrl },
        secret: this.secrets.encrypt(SecretBox.generate('gls')),
      },
      update: {
        enabled: input.enabled,
        config: { baseUrl: input.baseUrl },
        ...(existing?.secret ? {} : { secret: this.secrets.encrypt(SecretBox.generate('gls')) }),
      },
    });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'integration.updated',
      targetType: 'integration',
      targetId: 'ACTIONS_API',
      metadata: { enabled: input.enabled, baseUrl: input.baseUrl },
    });
    return this.list(organizationId);
  }

  async rotateActionsApiSecret(organizationId: string, actorUserId: string): Promise<IntegrationView[]> {
    await this.prisma.integration.update({
      where: { organizationId_kind: { organizationId, kind: 'ACTIONS_API' } },
      data: { secret: this.secrets.encrypt(SecretBox.generate('gls')) },
    });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'integration.secret_rotated',
      targetType: 'integration',
      targetId: 'ACTIONS_API',
    });
    return this.list(organizationId);
  }

  /**
   * The connector account tools use: the organization's own Actions API when it's
   * enabled, otherwise the sandbox store when that's enabled, otherwise none.
   */
  async connectorFor(organizationId: string): Promise<CommerceConnector | null> {
    const rows = await this.prisma.integration.findMany({ where: { organizationId, enabled: true } });
    const actions = rows.find((r) => r.kind === 'ACTIONS_API');
    const baseUrl = (actions?.config as { baseUrl?: string } | undefined)?.baseUrl;
    if (actions && baseUrl && actions.secret) {
      await assertPublicUrl(baseUrl, { allowPrivate: this.allowPrivateUrls });
      return new ActionsApiConnector(organizationId, baseUrl, this.secrets.decrypt(actions.secret));
    }
    if (rows.some((r) => r.kind === 'SANDBOX')) return new SandboxConnector(this.prisma, organizationId);
    return null;
  }

  // ---- Identity verification --------------------------------------------------------------

  async identity(organizationId: string): Promise<IdentitySettings> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return {
      enabled: Boolean(org.identitySecret),
      secret: org.identitySecret ? this.secrets.decrypt(org.identitySecret) : null,
    };
  }

  /** Enables identity verification with a fresh secret (also used to rotate it). */
  async rotateIdentitySecret(organizationId: string, actorUserId: string): Promise<IdentitySettings> {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { identitySecret: this.secrets.encrypt(SecretBox.generate('gli')) },
    });
    await this.audit.record({ organizationId, actorUserId, action: 'identity.secret_rotated', targetType: 'organization' });
    return this.identity(organizationId);
  }

  async disableIdentity(organizationId: string, actorUserId: string): Promise<IdentitySettings> {
    await this.prisma.organization.update({ where: { id: organizationId }, data: { identitySecret: null } });
    await this.audit.record({ organizationId, actorUserId, action: 'identity.disabled', targetType: 'organization' });
    return this.identity(organizationId);
  }

  private toView(kind: 'SANDBOX' | 'ACTIONS_API', row: Integration | undefined): IntegrationView {
    return {
      kind,
      enabled: row?.enabled ?? false,
      baseUrl: (row?.config as { baseUrl?: string } | undefined)?.baseUrl ?? null,
      secret: row?.secret ? this.secrets.decrypt(row.secret) : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }
}
