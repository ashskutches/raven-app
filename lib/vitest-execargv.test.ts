// @vitest-environment node
//
// This file spawns a real Node and imports vitest.config.ts, which calls
// fileURLToPath(new URL('.', import.meta.url)). Under the suite's default
// jsdom environment that import.meta.url is not a file: URL and the import
// throws before a test runs, so pin the environment -- the same reason
// lib/readme.test.ts pins it.
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { webstorageExecArgv } from '../vitest.config';

/* A guard on the harness rather than on the product.

   execArgv is handed to every forks-pool worker. Node does not ignore a flag
   it does not know -- it prints "bad option" and exits 9 before loading
   anything, so a flag passed to a Node too old for it takes down the entire
   suite at startup: "Worker exited unexpectedly during starting state", a
   stack trace wholly inside node_modules, "Test Files no tests". Nothing in
   it names the config line responsible.

   --no-experimental-webstorage only exists from v22.4.0, where Web Storage
   landed. The gate shipped as `major >= 22`, which handed the flag to every
   22.0-22.3 as well, and this repo pins no Node version -- no engines field,
   no .nvmrc, no CI workflow -- so nothing kept a contributor off one. */
describe('vitest execArgv', () => {
  it('withholds the webstorage flag from Nodes released before it', () => {
    expect(webstorageExecArgv('22.0.0')).toEqual([]);
    expect(webstorageExecArgv('22.3.1')).toEqual([]);
    expect(webstorageExecArgv('20.19.0')).toEqual([]);
  });

  it('passes it from v22.4.0, where Web Storage landed', () => {
    const flag = ['--no-experimental-webstorage'];

    expect(webstorageExecArgv('22.4.0')).toEqual(flag);
    expect(webstorageExecArgv('22.11.0')).toEqual(flag);
    expect(webstorageExecArgv('24.19.0')).toEqual(flag);
    // The version this is all for: Node 25+ defines localStorage itself and
    // shadows jsdom's.
    expect(webstorageExecArgv('25.0.0')).toEqual(flag);
  });

  // The two cases above encode a remembered release boundary; this one asks
  // the Node actually running the suite, so the gate is wrong exactly once --
  // here, legibly -- rather than in every worker at startup.
  it('only gives the running Node flags that Node accepts', () => {
    const argv = webstorageExecArgv(process.versions.node);
    const probe = spawnSync(process.execPath, [...argv, '-e', '0'], {
      encoding: 'utf8',
    });

    expect(
      probe.status,
      `node ${process.versions.node} rejected ${argv.join(' ')}: ${probe.stderr}`,
    ).toBe(0);
  });
});
