// @vitest-environment node
//
// This file reads README.md and package.json off disk. The suite's default
// environment is jsdom, and a jsdom file's `node:fs` can come back as Vite's
// browser stub -- an object whose every export is undefined. `readFileSync`
// is then not a function, it throws at module scope, and the file reports
// "0 test" with no failing assertion naming the cause. Nothing below touches
// the DOM, so pin the environment rather than depend on that resolution.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
});
