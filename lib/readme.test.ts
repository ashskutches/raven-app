// @vitest-environment node
//
// This file reads README.md and package.json off disk. The suite's default
// environment is jsdom, and a jsdom file's `node:fs` can come back as Vite's
// browser stub -- an object whose every export is undefined. `readFileSync`
// is then not a function, it throws at module scope, and the file reports
// "0 test" with no failing assertion naming the cause. Nothing below touches
// the DOM, so pin the environment rather than depend on that resolution.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import vitestConfig from '../vitest.config';

// The README once carried a blanket "npm test does not run here — it is the
// toolchain and not your change" warning that outlived the toolchain it described.
// A contributor who believes a stale line like that skips the suite entirely, so
// the claims the README makes about running the suite are asserted here.

const root = join(__dirname, '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const jsdomPkg = JSON.parse(
  readFileSync(join(root, 'node_modules', 'jsdom', 'package.json'), 'utf8'),
);

describe('README "Verifying a change"', () => {
  const section = readme.slice(readme.indexOf('## Verifying a change'));

  it('lists every command it calls a gate', () => {
    expect(section).toContain('npm test');
    expect(section).toContain('npx tsc --noEmit');
    expect(section).toContain('npm run build');
  });

  it('only documents commands package.json actually defines', () => {
    expect(pkg.scripts.test).toBeTruthy();
    expect(pkg.scripts.build).toBeTruthy();
  });

  it('quotes the Node range jsdom currently declares, not a remembered one', () => {
    // Bumping jsdom changes this range; the README paragraph explaining why an
    // old Node dies inside node_modules has to move with it.
    expect(jsdomPkg.engines?.node).toBeTruthy();
    expect(section).toContain(jsdomPkg.engines.node);
  });

  it('does not tell anyone a failing suite is somebody else\'s problem', () => {
    expect(section).not.toMatch(/toolchain and not your change/i);
  });

  // This section used to enumerate what the suite covered -- "the speech buffer,
  // the parked-utterance seam, and WorkScreen lane grouping" -- and every test
  // file added after that sentence was written left it a shorter list than the
  // truth. A contributor about to change ConsoleScreen's abort path read three
  // unrelated subjects and concluded nothing pinned the behaviour they were
  // changing, while ConsoleScreen.test.tsx sat beside the file they had open.
  // The enumeration is gone; a navigation rule replaced it, and these two
  // assertions are what stop *that* from going stale in turn.

  it('names the environment vitest is actually configured with', () => {
    expect(vitestConfig.test?.environment).toBe('jsdom');
    expect(section).toContain('jsdom by default');
  });

  it('points at a colocation rule every component test actually follows', () => {
    expect(section).toContain('components/<Screen>.test.tsx');

    const dir = join(root, 'components');
    // Recursive, because the drift this guards against is a test file moving
    // *out* of components/ into components/__tests__/. Vitest's include glob is
    // `components/**/*.test.tsx`, so a nested file still runs and fails nothing
    // -- it just stops being where the README says to look. A non-recursive
    // readdir would simply not see it.
    const tests = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
      (f) => f.endsWith('.test.tsx'),
    );
    // An empty glob would satisfy the loop below without proving anything.
    expect(tests.length).toBeGreaterThan(0);

    for (const test of tests) {
      expect(test, `${test} is not directly beside the component it covers`).not.toMatch(
        /[\/]/,
      );
      const subject = join(dir, test.replace(/\.test\.tsx$/, '.tsx'));
      expect(existsSync(subject), `${test} has no sibling component`).toBe(true);
    }
  });
});
