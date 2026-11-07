import { z } from 'zod';
import { ORG_ROLES } from './roles.js';

const email = z.email('Enter a valid email address').trim().toLowerCase().max(254);
// bcrypt (used by Supabase Auth) only considers the first 72 bytes of a password.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');
const personName = z.string().trim().min(1, 'Enter your name').max(100);
const orgName = z.string().trim().min(2, 'Must be at least 2 characters').max(80);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Must be at least 3 characters')
  .max(48, 'Must be at most 48 characters')
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens');

// ---- Auth ----------------------------------------------------------------------

/** A same-site path to continue to after an email link, e.g. back to an invitation. */
export const returnPathSchema = z
  .string()
  .max(300)
  .regex(/^\/(?![/\\])/, 'Must be a relative path');

export const signUpSchema = z.object({ fullName: personName, email, password, next: returnPathSchema.optional() });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({ email, password: z.string().min(1, 'Enter your password') });
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const refreshSessionSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;

export const resendConfirmationSchema = z.object({ email });
export type ResendConfirmationInput = z.infer<typeof resendConfirmationSchema>;

// ---- Profile -------------------------------------------------------------------

export const updateProfileSchema = z.object({ fullName: personName });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---- Organizations -------------------------------------------------------------

export const orgRoleSchema = z.enum(ORG_ROLES);

export const createOrganizationSchema = z.object({ name: orgName, slug: slug.optional() });
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({ name: orgName.optional(), slug: slug.optional() })
  .refine((v) => v.name !== undefined || v.slug !== undefined, 'Nothing to update');
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const inviteMemberSchema = z.object({ email, role: orgRoleSchema });
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({ role: orgRoleSchema });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/** Turns an organization name into a URL-friendly slug candidate. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
