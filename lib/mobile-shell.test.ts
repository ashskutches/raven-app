import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The phone layout is CSS, and jsdom has no layout engine — it will not tell us
 * that the sidebar is 232px of a 375px screen. What it can be held to is the
 * contract the stylesheet makes, which is where every one of these regressions
 * actually happened: a rule quietly dropped, not a rule quietly miscomputed.
 *
 * So this reads globals.css and asserts the handful of things that, if any one of
 * them goes, put the console back to being unusable on a phone. It cannot prove
 * the result looks right; open it at 375px for that.
 */

/* Vitest roots at the package directory; `import.meta.url` does not survive the
   jsdom transform as a file: URL. */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const css = read('app/globals.css');
const shell = read('app/[screen]/page.tsx');

/** Body of every `@media (max-width: 720px)` block, concatenated. */
function phoneRules(source: string): string {
  const out: string[] = [];
  const opener = /@media\s*\(max-width:\s*720px\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = opener.exec(source))) {
    let depth = 1;
    let i = opener.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    out.push(source.slice(opener.lastIndex, i - 1));
  }
  return out.join('\n');
}

/** Declarations of the first rule in `source` whose selector list is `selector`. */
function block(source: string, selector: string): string {
  const at = source.indexOf(selector);
  expect(at, `no rule for \`${selector}\``).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', at);
  return source.slice(open + 1, source.indexOf('}', open));
}

describe('phone shell', () => {
  const phone = phoneRules(css);

  it('turns the rail into a bottom bar instead of leaving it beside the content', () => {
    expect(block(phone, '.app-layout')).toMatch(/flex-direction:\s*column/);

    const sidebar = block(phone, '.sidebar {');
    expect(sidebar).toMatch(/flex-direction:\s*row/);
    expect(sidebar).toMatch(/width:\s*100%/);
    // It is the bottom edge now, so the divider moves to the top of it.
    expect(sidebar).toMatch(/border-top:/);
    // The home indicator overlaps the last ~34px of an iPhone screen.
    expect(sidebar).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom\)/);
  });

  it('gives every tab a thumb-sized target', () => {
    const min = /min-height:\s*(\d+)px/.exec(block(phone, '.nav-item {'));
    expect(min, 'no min-height on .nav-item').not.toBeNull();
    expect(Number(min![1])).toBeGreaterThanOrEqual(44);
  });

  it('keeps focused fields at 16px so iOS does not zoom the page in', () => {
    // The screens size their inputs from style attributes, so the rule has to
    // carry !important or it loses to every one of them.
    expect(phone).toMatch(/input,\s*\n?\s*textarea,\s*\n?\s*select\s*\{\s*font-size:\s*16px\s*!important/);
  });

  it('measures the shell in dvh, not vh', () => {
    // 100vh on a phone is the screen plus the browser toolbar, which puts the
    // tab bar below the fold on a page that never scrolls.
    expect(block(css, '.app-layout {')).toMatch(/height:\s*100dvh/);
  });

  it('styles the approvals count from the stylesheet so the tab bar can move it', () => {
    expect(shell).toMatch(/className="nav-badge"/);
    expect(phone).toMatch(/\.nav-badge\s*\{/);
  });
});
