import * as React from 'react';
import { describe, expect, it } from 'vitest';

/* @testing-library/react reaches for `React.act`, and React only ships `act`
   in its development build — `react/cjs/react.production.js` does not export
   it. Node picks the build from `process.env.NODE_ENV` at import time, and
   vitest keeps an NODE_ENV it was handed rather than forcing its own. So an
   ambient `NODE_ENV=production` (a station shell, a Docker runner stage, a CI
   job that exports it) makes every render in the suite die with
   "React.act is not a function" — the suite reports a product bug when the
   only thing wrong is the environment it was started in.

   vitest.config.ts pins NODE_ENV for the run. This asserts the pin holds, so
   a regression surfaces as one legible failure instead of a stack per test. */
describe('test environment', () => {
  it('runs against React development build, which is the one with act()', () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    expect(typeof React.act).toBe('function');
  });
});
