/**
 * Organization roles and the permissions they grant.
 *
 * Platform-level administration (the "Super Admin" role in the requirements) is a
 * flag on the user, not an organization role, so it is not listed here. End
 * customers who talk to the chat widget are not platform users either.
 */
export const ORG_ROLES = ['OWNER', 'ADMIN', 'AGENT', 'VIEWER'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  AGENT: 'Support agent',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  OWNER: 'Full access, including billing, integrations and organization settings.',
  ADMIN: 'Manages the team, knowledge base, conversations and support settings.',
  AGENT: 'Handles conversations and support tickets.',
  VIEWER: 'Read-only access to dashboards and reports.',
};

const ALL: readonly OrgRole[] = ORG_ROLES;
const MANAGERS: readonly OrgRole[] = ['OWNER', 'ADMIN'];
const STAFF: readonly OrgRole[] = ['OWNER', 'ADMIN', 'AGENT'];

export const PERMISSIONS = {
  'org:read': ALL,
  'org:update': ['OWNER'],
  'org:delete': ['OWNER'],
  'billing:read': MANAGERS,
  'billing:manage': ['OWNER'],
  'members:read': ALL,
  'members:manage': MANAGERS,
  'audit:read': MANAGERS,
  'knowledge:read': STAFF,
  'knowledge:manage': MANAGERS,
  'conversations:read': STAFF,
  'conversations:reply': STAFF,
  'assistant:manage': MANAGERS,
  'tickets:manage': STAFF,
  'approvals:read': STAFF,
  'approvals:decide': MANAGERS,
  'agent:read': STAFF,
  'analytics:read': ALL,
  'integrations:manage': ['OWNER'],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

/** Roles a member with `actorRole` may grant to others (by invitation or role change). */
export function assignableRoles(actorRole: OrgRole): OrgRole[] {
  if (actorRole === 'OWNER') return [...ORG_ROLES];
  if (actorRole === 'ADMIN') return ['ADMIN', 'AGENT', 'VIEWER'];
  return [];
}

/** Whether `actorRole` may change or remove a member who currently holds `targetRole`. */
export function canManageMember(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (!hasPermission(actorRole, 'members:manage')) return false;
  // Only owners can change or remove other owners.
  return targetRole !== 'OWNER' || actorRole === 'OWNER';
}
