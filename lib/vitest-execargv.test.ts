// @vitest-environment node
//
// This file spawns a real Node and imports vitest.config.ts, which calls
// fileURLToPath(new URL('.', import.meta.url)). Under the suite's default
// jsdom environment that import.meta.url is not a file: URL and the import
// throws before a test runs, so pin the environment -- the same reason
// lib/readme.test.ts pins it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  /* lib/test-env.test.ts carries the other half of this gate's coverage -- it
     asserts the flag reached the worker running it -- and the paragraph above
     that case describes the gate for whoever is reading the harness. It was
     written against the gate's first shape, an inline `major >= 22` ternary in
     vitest.config.ts, and said of it: no test, and no useful test possible.
     That branch and the one that replaced the ternary with `webstorageExecArgv`
     and wrote this file landed concurrently on disjoint files, so both merged
     clean and the paragraph survived a rewrite that falsified every clause of
     it.

     Left alone it is an instruction to delete this file. A maintainer who finds
     it and believes the comment beside the sibling case -- that the gate cannot
     usefully be tested -- removes the only coverage the boundary has, and the
     merge that made the comment false makes no sound. So assert the paragraph
     against the gate it describes, the way lib/readme.test.ts asserts the
     README's Node range against jsdom's own package.json: read the boundary off
     the function rather than off a remembered 22.4, so moving the gate takes
     the prose with it. */
  describe("the paragraph in lib/test-env.test.ts describing this gate", () => {
    const source = readFileSync(
      join(__dirname, 'test-env.test.ts'),
      'utf8',
    );
    // The gate's own boundary, derived: the lowest 22.x the flag survives.
    const boundary = (() => {
      for (let minor = 0; minor <= 99; minor += 1) {
        if (webstorageExecArgv(`22.${minor}.0`).length > 0) return `22.${minor}`;
      }
      throw new Error('the gate withholds the flag on every 22.x');
    })();

    it('does not tell a reader the gate is beyond testing', () => {
      expect(source).not.toMatch(/cannot\s+have\s+a\s+useful\s+one/i);
      expect(source).not.toMatch(/nothing here can exercise it/i);
    });

    it('points at the file that does cover it', () => {
      expect(source).toContain('vitest-execargv.test.ts');
    });

    it('quotes the boundary the gate implements, not the major it once used', () => {
      expect(source).toContain(boundary);
      // `>= 22` as a whole version -- the shape the gate shipped as and no
      // longer has. `>= 22.4` is the truth and must not trip this.
      expect(source).not.toMatch(/>=\s*22(?!\.)/);
    });
  });
});
