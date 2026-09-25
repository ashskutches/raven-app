import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  /* tsconfig's "@/*" paths mapping is a compiler-only thing; Vitest resolves
     imports itself and would fail on `@/lib/api` without this. */
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    /* `app/**` is here because route handlers are testable code that nothing
       else covers -- /api/health's body is a contract another repo parses,
       and before this glob existed a test for it could not have run. */
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'components/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
    /* Vitest defaults NODE_ENV to 'test' only when the caller left it unset —
       an inherited value passes straight through. react and react-dom pick
       their CJS build from process.env.NODE_ENV at require time, and React 19's
       production build exports no act(), so a run started from any shell that
       exports NODE_ENV=production loses every rendering test to "React.act is
       not a function". Pin it, so the suite tests the code and not the shell.
       lib/test-env.test.ts guards this. */
    env: { NODE_ENV: 'test' },
  },
});
