// @vitest-environment node
//
// This file spawns a real Node, and imports vitest.config.ts, which calls
// fileURLToPath(new URL('.', import.meta.url)). Under the suite's default
// jsdom environment `node:child_process` can resolve to Vite's browser stub,
// where spawnSync is undefined, and that import.meta.url is not a file: URL
// so the config throws at module scope -- either way the file reports no
// failing assertion naming the cause. Pin the environment, the same reason
// lib/readme.test.ts pins it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as vitestConfigModule from '../vitest.config';
import { webstorageExecArgv } from './webstorage-execargv';

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

  /* The gate lives in its own module, and that placement is the assertion.

     Vite loads vitest.config.ts as a rollup entry module. Exporting this
     function from there alongside the config made it a mixed-exports entry,
     and rollup then printed "[MIXED_EXPORTS] Entry module \"vitest.config.ts\"
     is using named (including \"default\", \"webstorageExecArgv\") and default
     exports together" above every single `npm test` -- the first of the three
     gates README.md documents. The warning named the config and described
     nothing a contributor could act on, which is how a startup warning that
     does matter gets scrolled past. Moving the function here removed it; this
     case is what stops the next helper from putting it back. */
  it('leaves vitest.config.ts a default-only module', () => {
    expect(Object.keys(vitestConfigModule)).toEqual(['default']);
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
    const CONFIG = 'vitest.config.ts';
    const source = readFileSync(
      join(__dirname, 'test-env.test.ts'),
      'utf8',
    );
    /* The module the gate is exported from, read off the config's own import
       rather than spelled out here -- the same derivation as `boundary`, for
       the same reason: a gate that moves again takes this assertion, and so
       the prose, with it. */
    const gateModule = (() => {
      const config = readFileSync(join(__dirname, '..', CONFIG), 'utf8');
      const specifier = config.match(
        /import\s*\{[^}]*\bwebstorageExecArgv\b[^}]*\}\s*from\s*'([^']+)'/,
      )?.[1];

      if (!specifier) {
        throw new Error(`${CONFIG} no longer imports webstorageExecArgv`);
      }

      return `${specifier.replace(/^\.\//, '')}.ts`;
    })();

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

    /* The paragraph was written when the gate was a named export of the config,
       and the commit that moved it to its own module -- to stop the
       [MIXED_EXPORTS] warning the sibling case above pins -- landed on disjoint
       files and merged clean, exactly as the drift the paragraph itself
       narrates. So the prose now sends a reader adding a second harness helper
       to put it in the config "beside" a gate that is not there, which turns
       that sibling case red and brings the warning back. */
    it('names the module the gate is exported from, not the config importing it', () => {
      expect(source).toContain(gateModule);
      // Prose placing an export in the config, within a clause of naming it.
      // The truthful wording -- the config imports the gate and wires it into
      // test.execArgv -- keeps the two far apart.
      expect(source).not.toMatch(
        new RegExp(`${CONFIG.replace(/\./g, '\\.')}[\\s\\S]{0,40}export`, 'i'),
      );
    });

    it('quotes the boundary the gate implements, not the major it once used', () => {
      expect(source).toContain(boundary);
      // `>= 22` as a whole version -- the shape the gate shipped as and no
      // longer has. `>= 22.4` is the truth and must not trip this.
      expect(source).not.toMatch(/>=\s*22(?!\.)/);
    });
  });

  /* The other paragraph in that file -- the one justifying the sessionStorage
     half of the storage case -- drifted the same way and needs the same pin.

     It was written to say why the sessionStorage assertions earn their keep,
     and reached for a concrete leak to make the case: an AuthGate test's
     `raven_auth` outliving ChatScreen.test.tsx's afterEach and surfacing
     through ChatScreen's prefill read. None of that holds against this tree.
     There is no AuthGate test; `raven_auth` is not the key the prefill path
     reads, so it could never come back from that getItem; and the clear does
     reach the write, because in the very state being described there is one
     store, not two -- the sibling paragraph above the localStorage case says
     so itself, populateGlobal sets global.window = global.

     That makes the paragraph self-refuting to anyone who checks it, which is
     the whole danger: a maintainer debugging an order-dependent storage
     failure follows it, finds every hook false, concludes the scenario cannot
     arise, and deletes the sessionStorage half as speculative -- removing the
     only guard against a vitest that adds localStorage to KEYS but not
     sessionStorage, which is the divergence the paragraph's last sentence
     exists to cover. The real mechanism is simpler and still live: Node's
     store is process-wide and outlives the per-file jsdom window.

     So assert the paragraph against the code it points at, the way the
     describe above asserts the execArgv one: read the prefill key off
     ChatScreen and the test files off disk, so prose naming something the
     repo does not have fails here rather than misleading someone at 1am. */
  describe('the sessionStorage paragraph in lib/test-env.test.ts', () => {
    const root = join(__dirname, '..');
    const source = readFileSync(join(__dirname, 'test-env.test.ts'), 'utf8');
    const chatTest = readFileSync(
      join(root, 'components', 'ChatScreen.test.tsx'),
      'utf8',
    );

    /* Sliced off the sentence that opens the paragraph rather than off line
       numbers, so editing anything above it does not move the assertion. */
    const paragraph = (() => {
      const start = source.indexOf('sessionStorage is the same hole');

      if (start < 0) {
        throw new Error(
          'lib/test-env.test.ts no longer explains the sessionStorage half',
        );
      }

      const end = source.indexOf('*/', start);

      return source.slice(start, end === -1 ? undefined : end);
    })();

    // The key the read path the paragraph describes actually looks up, read
    // off the component rather than spelled out here.
    const prefillKey = (() => {
      const chat = readFileSync(join(root, 'components', 'ChatScreen.tsx'), 'utf8');
      const key = chat.match(/sessionStorage\.getItem\('([^']+)'\)/)?.[1];

      if (!key) {
        throw new Error('ChatScreen no longer reads a sessionStorage key');
      }

      return key;
    })();

    it('quotes only a key the read path it describes can return', () => {
      expect(paragraph).toContain(prefillKey);

      // Storage-key-shaped literals the paragraph quotes. A leaked key that is
      // not the one getItem asks for can never come back from that call, so
      // naming one describes a leak that cannot happen.
      const quoted = new Set(
        [...paragraph.matchAll(/[`']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)[`']/g)].map(
          (m) => m[1],
        ),
      );

      expect([...quoted]).toEqual([prefillKey]);
    });

    it('blames only test files the repo has', () => {
      const named = new Set<string>();

      // Named outright -- "ChatScreen.test.tsx's afterEach".
      for (const m of paragraph.matchAll(/\b([A-Z][A-Za-z0-9]*)\.test\.tsx?\b/g)) {
        named.add(m[1]);
      }
      // Named in prose -- "an AuthGate test writes".
      for (const m of paragraph.matchAll(/\ban?\s+([A-Z][A-Za-z0-9]*)\s+test\b/g)) {
        named.add(m[1]);
      }

      // Not vacuous: the paragraph has to point somewhere to be worth reading.
      expect(named.size).toBeGreaterThan(0);

      for (const component of named) {
        expect(
          existsSync(join(root, 'components', `${component}.test.tsx`)),
          `the paragraph blames a ${component} test; there is no components/${component}.test.tsx`,
        ).toBe(true);
      }
    });

    it('does not say the cleanup it names misses the store the write landed in', () => {
      // Derived: the afterEach the paragraph points at does clear sessionStorage.
      expect(chatTest).toMatch(/afterEach\(\(\) => \{[\s\S]*?sessionStorage\.clear\(\)/);
      // And there is only one store for it to miss -- the file says so itself,
      // two paragraphs up, which is what makes the opposition below false.
      expect(source).toContain('global.window = global');

      expect(paragraph).not.toMatch(
        /\bstore,?\s*not\s+the\s+window'?s\b|\bnot\s+the\s+window'?s\s+(?:own\s+)?store\b/i,
      );
    });
  });
});
