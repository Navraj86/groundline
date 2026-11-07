import type { Request } from 'express';
import type { OrgRole } from '@groundline/shared';
import type { AuthClaims } from './token-verifier.service.js';

export interface AuthContext {
  userId: string;
  email: string;
  accessToken: string;
  claims: AuthClaims;
}

export interface OrgContext {
  organizationId: string;
  memberId: string;
  role: OrgRole;
}

export interface AppRequest extends Request {
  auth?: AuthContext;
  org?: OrgContext;
}
