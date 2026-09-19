import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx'],
    /* vitest only defaults NODE_ENV to 'test' when the caller left it unset —
       it will not override an inherited one. Run the suite from a shell that
       exports NODE_ENV=production (the Dockerfile's runner stage, a station
       job) and node resolves react/index.js to the production build, which
       ships no `act`; @testing-library then falls through to the removed
       react-dom/test-utils shim and every render throws "React.act is not a
       function". Pin it so the suite tests the code, not the shell. */
    env: { NODE_ENV: 'test' },
  },
});
