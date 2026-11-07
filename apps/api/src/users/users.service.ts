import { Injectable } from '@nestjs/common';
import type { Me } from '@groundline/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthClaims } from '../auth/token-verifier.service.js';

const SYNC_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class UsersService {
  /** userId -> last time the profile row was synced from the token, to avoid a write per request. */
  private readonly synced = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Makes sure an application profile exists for the Supabase user behind a verified token.
   * Profiles are created lazily on the first authenticated request after sign-up.
   */
  async ensureProfile(claims: AuthClaims): Promise<void> {
    const last = this.synced.get(claims.sub);
    if (last && Date.now() - last < SYNC_TTL_MS) return;

    const email = (claims.email ?? '').toLowerCase();
    const fullName = claims.user_metadata?.full_name?.trim() || null;
    await this.prisma.user.upsert({
      where: { id: claims.sub },
      create: { id: claims.sub, email, fullName },
      update: { email },
    });
    this.synced.set(claims.sub, Date.now());
    if (this.synced.size > 10_000) this.synced.clear();
  }

  async getMe(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { organization: { select: { id: true, name: true, slug: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt.toISOString(),
      organizations: user.memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }

  async updateProfile(userId: string, data: { fullName: string }): Promise<Me> {
    await this.prisma.user.update({ where: { id: userId }, data: { fullName: data.fullName } });
    return this.getMe(userId);
  }
}
