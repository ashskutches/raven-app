import * as React from 'react';
import { describe, expect, it } from 'vitest';

/* A guard on the harness rather than on the product.

   react/index.js and react-dom/test-utils.js each pick their CJS build from
   process.env.NODE_ENV at require time, and React 19's production build ships
   no act(). So a suite that inherits NODE_ENV=production loads production
   React, @testing-library finds no React.act, falls back to the removed
   react-dom/test-utils shim, and every renderHook/render in the suite dies
   with "React.act is not a function" — a stack trace inside node_modules that
   names nothing about the code under test.

   These two assertions turn that into one legible failure. */
describe('test harness', () => {
  it('does not run the suite against a production build', () => {
    expect(process.env.NODE_ENV).not.toBe('production');
  });

  it('resolves a React build that exports act()', () => {
    expect(typeof React.act).toBe('function');
  });

  /* The per-test budget is wall clock, not CPU, and `vitest run` runs this
     suite's files in parallel forks. On a 4-core box that means the slowest
     cases -- the guild-picker tests that render thousands of member rows,
     ~2s each on their own -- compete for cores with everything else, and a
     3x stretch is ordinary. Under Vitest's 5000ms default that landed inside
     the budget: the suite failed, but a different test each run, and every
     one of them passed when run alone. Reading the effective budget off the
     running task rather than the config file means this fails whatever moved
     it -- a config edit, a CLI --testTimeout, an inherited default change. */
  it('gives each test room for the contention a parallel run creates', (ctx) => {
    const SLOWEST_TEST_ALONE_MS = 2_100;

    expect(ctx.task.timeout).toBeGreaterThanOrEqual(SLOWEST_TEST_ALONE_MS * 5);
  });
});
