import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The monorepo keeps a single .env at the repository root.
for (const file of ['.env', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations can use their own URL: Prisma's migration engine takes TLS options in a
    // different form from the node-postgres driver the app uses.
    url: process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || '',
  },
});
