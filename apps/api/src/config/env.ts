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
    // Run background job workers in this process. Set to false on API instances when a
    // separate worker process (dist/worker.js) handles jobs.
    WORKERS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

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

    // S3-compatible object storage. Leave S3_ENDPOINT empty for AWS S3.
    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('groundline-uploads'),
    S3_ACCESS_KEY: z.string().default(''),
    S3_SECRET_KEY: z.string().default(''),

    // Internal AI service (retrieval and answers).
    AI_SERVICE_URL: z.url().default('http://localhost:8000'),
    AI_SERVICE_TOKEN: z.string().default(''),
    // Signs widget visitor tokens. Required in production.
    WIDGET_TOKEN_SECRET: z.string().default(''),
    // Express "trust proxy" setting, so rate limits see the real client IP behind the web app.
    TRUST_PROXY: z.string().default('loopback'),

    // 32-byte key (base64) for encrypting stored secrets such as connector signing keys.
    ENCRYPTION_KEY: z.string().default(''),

    INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.SUPABASE_JWT_SECRET || env.SUPABASE_ANON_KEY, {
    message: 'Set SUPABASE_JWT_SECRET or SUPABASE_ANON_KEY in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || Buffer.from(env.ENCRYPTION_KEY, 'base64').length === 32, {
    message: 'Set ENCRYPTION_KEY to 32 random bytes, base64-encoded, in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.WIDGET_TOKEN_SECRET.length >= 32, {
    message: 'Set WIDGET_TOKEN_SECRET (at least 32 characters) in production',
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
