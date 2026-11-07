import { describe, expect, it } from 'vitest';
import { assignableRoles, canManageMember, hasPermission } from './roles.js';
import { createOrganizationSchema, slugify } from './schemas.js';

describe('roles', () => {
  it('limits organization settings to owners', () => {
    expect(hasPermission('OWNER', 'org:update')).toBe(true);
    expect(hasPermission('ADMIN', 'org:update')).toBe(false);
  });

  it('lets owners and admins manage members', () => {
    expect(hasPermission('OWNER', 'members:manage')).toBe(true);
    expect(hasPermission('ADMIN', 'members:manage')).toBe(true);
    expect(hasPermission('AGENT', 'members:manage')).toBe(false);
    expect(hasPermission('VIEWER', 'members:manage')).toBe(false);
  });

  it('prevents admins from granting or touching the owner role', () => {
    expect(assignableRoles('ADMIN')).not.toContain('OWNER');
    expect(assignableRoles('OWNER')).toContain('OWNER');
    expect(canManageMember('ADMIN', 'OWNER')).toBe(false);
    expect(canManageMember('ADMIN', 'AGENT')).toBe(true);
    expect(canManageMember('OWNER', 'OWNER')).toBe(true);
  });

  it('gives agents and viewers no assignable roles', () => {
    expect(assignableRoles('AGENT')).toEqual([]);
    expect(assignableRoles('VIEWER')).toEqual([]);
  });
});

describe('slugs', () => {
  it('slugifies organization names', () => {
    expect(slugify('Acme Support, Inc.')).toBe('acme-support-inc');
    expect(slugify('  Café   Déjà Vu ')).toBe('cafe-deja-vu');
  });

  it('rejects malformed slugs', () => {
    expect(createOrganizationSchema.safeParse({ name: 'Acme', slug: 'Bad Slug' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: 'Acme', slug: 'acme-co' }).success).toBe(true);
  });
});
