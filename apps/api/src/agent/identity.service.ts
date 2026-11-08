import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { SecretBox } from '../common/secret-box.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const claimsSchema = z.object({
  sub: z.string().min(1).max(200),
  email: z.email().max(254).optional(),
  name: z.string().max(200).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Verifies widget identity tokens. The organization's server signs a short-lived HS256
 * JWT (`sub`, optional `email`, `name`, `attributes`, and `exp`) with its identity secret
 * and passes it to the widget, so tools can act for that customer and nobody else.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
  ) {}

  /** Returns the verified customer's id, creating or refreshing the customer record. */
  async verifyAndUpsert(organizationId: string, token: string): Promise<{ customerId: string; email: string | null; name: string | null }> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (!org.identitySecret) throw new UnauthorizedException('Identity verification is not enabled for this chat.');

    let claims: z.infer<typeof claimsSchema>;
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(this.secrets.decrypt(org.identitySecret)), {
        algorithms: ['HS256'],
        requiredClaims: ['sub', 'exp'],
      });
      claims = claimsSchema.parse(payload);
    } catch {
      throw new UnauthorizedException('The identity token is invalid or has expired.');
    }

    const values = {
      email: claims.email?.toLowerCase() ?? null,
      name: claims.name ?? null,
      lastSeenAt: new Date(),
      ...(claims.attributes ? { attributes: claims.attributes as Prisma.InputJsonValue } : {}),
    };
    const customer = await this.prisma.customer.upsert({
      where: { organizationId_externalId: { organizationId, externalId: claims.sub } },
      create: { organizationId, externalId: claims.sub, ...values },
      update: values,
    });
    return { customerId: customer.id, email: customer.email, name: customer.name };
  }
}
