import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Background workers only run in specs that opt in, on their own queue namespace, so a
    // local dev server sharing the same Redis never picks up test jobs.
    env: { WORKERS_ENABLED: 'false', QUEUE_PREFIX: 'groundline-e2e' },
  },
});
