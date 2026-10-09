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
    /* Vitest's 5s default is a wall-clock budget, and it was sized for a suite
       whose slowest case took ~200ms. The guild-picker cap tests now render
       thousands of member rows and take ~2s each on their own, which leaves
       barely 2x of headroom -- and `vitest run` runs these files in parallel
       forks on a 4-core box, where a 3x slowdown from contention is routine.
       The result was a suite that failed a different test on every run: a
       ~50ms synchronous hook test in lib/speech.test.ts was once starved past
       40s. Nothing was wrong with any of them. Budget for the contention
       instead, so a timeout again means a hang rather than a busy machine. */
    testTimeout: 20_000,
    /* Node 25+ ships its own global localStorage, which is undefined unless
       --localstorage-file is given, and it shadows jsdom's -- so every
       `localStorage.clear()` in a test throws. Turn Node's off and let jsdom's
       through. The flag exists from Node 22; Node 20 would reject it. */
    execArgv:
      Number(process.versions.node.split('.')[0]) >= 22
        ? ['--no-experimental-webstorage']
        : [],
  },
});
