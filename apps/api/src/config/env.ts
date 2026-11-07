import { z } from 'zod';

/**
 * Environment variables the API needs. Validated once at startup so a missing or
 * malformed value stops the process with a clear message instead of failing later.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_URL: z.url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // Supabase Auth. Locally this is the GoTrue container; in production a Supabase project
    // (https://<ref>.supabase.co/auth/v1).
    SUPABASE_AUTH_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().default(''),
    // Set for HS256-signed tokens (local GoTrue, legacy Supabase projects). When empty,
    // tokens are verified against the project's JWKS endpoint instead.
    SUPABASE_JWT_SECRET: z.string().default(''),

    SMTP_URL: z.string().default('smtp://localhost:1025'),
    MAIL_FROM: z.string().default('Groundline <no-reply@groundline.local>'),

    // Dodo Payments. Billing endpoints return 503 until the API key is set.
    DODO_PAYMENTS_API_KEY: z.string().default(''),
    DODO_PAYMENTS_WEBHOOK_KEY: z.string().default(''),
    DODO_PAYMENTS_ENVIRONMENT: z.enum(['test_mode', 'live_mode']).default('test_mode'),

    INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.SUPABASE_JWT_SECRET || env.SUPABASE_ANON_KEY, {
    message: 'Set SUPABASE_JWT_SECRET or SUPABASE_ANON_KEY in production',
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return result.data;
}
