import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx'],
    /* Pin NODE_ENV rather than inheriting it. React and react-dom pick their
       CJS build from process.env.NODE_ENV at require time, and the production
       build has no React.act — so a suite inheriting NODE_ENV=production (the
       Dockerfile runner stage, most CI images) dies in @testing-library's
       act shim before any assertion runs. 'test' is what Vitest already
       defaults to when the shell leaves NODE_ENV unset. */
    env: { NODE_ENV: 'test' },
  },
});
