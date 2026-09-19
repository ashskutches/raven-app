import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  /* tsconfig's `@/*` path mapping is a Next.js compiler feature; vitest knows
     nothing about it, so a test importing any module that uses `@/` dies at
     transform time with "Failed to resolve import". Mirror the mapping here so
     the suite can reach the same modules the app does. */
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx'],
  },
});
