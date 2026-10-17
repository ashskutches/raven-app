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

  /* Node 25+ defines a global localStorage of its own, and vitest's jsdom
     environment cannot replace it: populateGlobal only copies a window key
     that already exists on the global if that key is on its own KEYS list,
     and localStorage is not on it (Storage and StorageEvent are, the instance
     is not). So Node's wins, and reading it without --localstorage-file does
     not give undefined -- the getter throws "The argument
     '--localstorage-file' is an invalid localStorage location". The config
     passes --no-experimental-webstorage to every worker to get it out of the
     way.

     Nothing had held that in place. The flag itself is covered by the version
     gate's own test, but deleting the execArgv line from the config,
     reordering it out of `test`, or switching `pool` to 'threads' leaves that
     green, because none of it reads the environment the suite actually got.
     The first symptom was a product test instead: ChatScreen.test.tsx's
     afterEach dying on `localStorage.clear()`, which names the chat screen
     and not the harness.

     So ask the running environment, the way the timeout case asks the running
     task. Both halves of the claim matter: it has to be there, and it has to
     be jsdom's -- Node's throws on access with no --localstorage-file, and is
     functional but still not jsdom's with one. `Storage` IS on vitest's KEYS
     list, so the constructor in scope here is jsdom's, which is what makes
     the instance check discriminate. (window.localStorage would not:
     populateGlobal sets global.window = global, so it is the same reference
     either way.) Verified by running the suite under
     --experimental-webstorage on Node 24, which is the same state Node 25
     boots into: this case fails, and so does ChatScreen. */
  it("exposes jsdom's localStorage, not the one Node 25+ brings", () => {
    // Throws rather than returning undefined when Node's is the one in scope;
    // that TypeError names --localstorage-file, so let it be the failure.
    const storage = globalThis.localStorage as Storage | undefined;

    expect(typeof storage?.clear).toBe('function');
    expect(storage).toBeInstanceOf(Storage);
  });
});
