import type { OrgRole } from './roles.js';

/** Response shapes returned by the Groundline API. Dates are ISO-8601 strings. */

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp (seconds) at which the access token expires. */
  expiresAt: number;
}

export interface SignUpResult {
  /** True when the user must confirm their email address before signing in. */
  confirmationRequired: boolean;
  session: AuthSession | null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isPlatformAdmin: boolean;
  createdAt: string;
  organizations: OrganizationSummary[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserRef {
  id: string;
  email: string;
  fullName: string | null;
}

export interface Member {
  id: string;
  role: OrgRole;
  joinedAt: string;
  user: UserRef & { avatarUrl: string | null };
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy: UserRef | null;
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: OrgRole;
  invitedByName: string | null;
  expiresAt: string;
  status: InvitationStatus | 'EXPIRED';
}

export interface AcceptInvitationResult {
  organization: OrganizationSummary;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: UserRef | null;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OrganizationOverview {
  members: number;
  pendingInvitations: number;
  /** Filled in as later modules (knowledge base, chat, tickets) come online. */
  knowledgeSources: number;
  conversations: number;
  openTickets: number;
  recentActivity: AuditLogEntry[];
}

export interface ApiErrorBody {
  statusCode: number;
  error?: string;
  message: string | string[];
}
