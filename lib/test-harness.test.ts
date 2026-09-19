import * as React from 'react';
import { describe, expect, it } from 'vitest';

/* A guard on the harness itself, not on any application code.

   `react/index.js` and `react-dom/test-utils.js` pick their CJS build from
   `process.env.NODE_ENV` at require time, and React's *production* build does
   not export `act`. When the suite inherits NODE_ENV=production from the shell
   — the Dockerfile runner stage sets it, and CI images commonly do —
   @testing-library/react finds no `React.act`, falls back to the deprecated
   `react-dom/test-utils.act`, and that shim calls `React.act(callback)` and
   dies with `TypeError: React.act is not a function` before a single assertion
   runs. Every rendering test fails for a reason unrelated to the code it
   covers.

   vitest.config.ts pins NODE_ENV so the suite cannot inherit it. These two
   assertions fail loudly and legibly if that pin is ever removed. */
describe('test harness', () => {
  it('does not run against React production builds', () => {
    expect(process.env.NODE_ENV).not.toBe('production');
  });

  it('resolves a React build that exports act()', () => {
    expect(typeof React.act).toBe('function');
  });
});
