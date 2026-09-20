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
});
