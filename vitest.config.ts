import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx'],
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
