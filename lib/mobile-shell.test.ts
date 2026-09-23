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

/* ──────────────────────────────────────────────────────────────
   Cutouts are the one thing here that reading a declaration cannot
   settle. `viewport-fit=cover` stops the window at the display edge
   rather than at the safe area, so whether the shell clears a sensor
   housing is arithmetic over the boxes — and it can be satisfied on
   the shell or on the child that owns that edge, by padding or by
   margin. So resolve the cascade at a given window width and add up
   what actually insets the edge, rather than looking for a property.
  ────────────────────────────────────────────────────────────── */

/** Split on top-level `seps`, so `env(a, b)` survives intact. */
function splitTop(value: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && seps.includes(ch)) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** A length in px, with env() taken from `insets`. Unresolvable (%, auto) is 0. */
function px(value: string, insets: Record<string, number>): number {
  const v = (value ?? '').trim();
  let m = /^(-?[\d.]+)px$/.exec(v);
  if (m) return Number(m[1]);
  if (v === '0') return 0;
  m = /^env\(\s*([\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
  if (m) return m[1] in insets ? insets[m[1]] : px(m[2] ?? '0', insets);
  m = /^(max|min)\((.+)\)$/.exec(v);
  if (m) {
    const args = splitTop(m[2], ',').map((a) => px(a, insets));
    return m[1] === 'max' ? Math.max(...args) : Math.min(...args);
  }
  m = /^calc\((.+)\)$/.exec(v);
  if (m) return splitTop(m[1], '+').reduce((sum, t) => sum + px(t, insets), 0);
  return 0;
}

/** Does this at-rule prelude hold for a plain window `width` px wide? */
function atRuleHolds(prelude: string, width: number): boolean {
  if (prelude.startsWith('@supports')) return true;
  if (!prelude.startsWith('@media')) return false;
  return [...prelude.matchAll(/\(\s*([\w-]+)\s*:\s*([^)]+)\)/g)].every(([, name, raw]) => {
    const n = Number(/^([\d.]+)px$/.exec(raw.trim())?.[1]);
    if (name === 'max-width') return width <= n;
    if (name === 'min-width') return width >= n;
    return false; // prefers-reduced-motion and friends are not this scenario
  });
}

/** Declarations applying to `selector` in a window `width` px wide, in source order. */
function declarations(source: string, selector: string, width: number): Array<[string, string]> {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Array<[string, string]> = [];
  const enclosing: boolean[] = [];
  let i = 0;
  let start = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ';') {
      i++;
      start = i;
      continue;
    }
    if (ch === '}') {
      enclosing.pop();
      i++;
      start = i;
      continue;
    }
    if (ch !== '{') {
      i++;
      continue;
    }
    const prelude = src.slice(start, i).trim();
    if (prelude.startsWith('@')) {
      enclosing.push(atRuleHolds(prelude, width));
      i++;
      start = i;
      continue;
    }
    let depth = 1;
    let j = i + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    if (enclosing.every(Boolean) && splitTop(prelude, ',').includes(selector)) {
      for (const decl of splitTop(src.slice(i + 1, j - 1), ';')) {
        const colon = decl.indexOf(':');
        if (colon > 0) out.push([decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()]);
      }
    }
    i = j;
    start = i;
  }
  return out;
}

/** px `decls` put between the element's own edge and its contents on `side`. */
function edgeInset(
  decls: Array<[string, string]>,
  side: 'left' | 'right',
  insets: Record<string, number>,
): number {
  const boxes = { margin: 0, padding: 0 };
  for (const [prop, value] of decls) {
    const box = prop.startsWith('margin') ? 'margin' : prop.startsWith('padding') ? 'padding' : null;
    if (!box) continue;
    const parts = splitTop(value, ' \t\n\r');
    if (!parts.length) continue;
    const rest = prop.slice(box.length);
    const logical = side === 'left' ? 'start' : 'end';
    if (rest === '') {
      // 1–4 value shorthand: top right bottom left
      boxes[box] = px(side === 'left' ? parts[3] ?? parts[1] ?? parts[0] : parts[1] ?? parts[0], insets);
    } else if (rest === '-inline') {
      boxes[box] = px(parts[side === 'left' ? 0 : 1] ?? parts[0], insets);
    } else if (rest === `-${side}` || rest === `-inline-${logical}`) {
      boxes[box] = px(parts[0], insets);
    }
  }
  return boxes.margin + boxes.padding;
}

describe('display cutouts', () => {
  /* iPhone 15 Pro held sideways: the CSS window is 852px wide — past the 720px
     breakpoint, so this is the rail layout, not the tab bar — and the sensor
     housing eats 59px of one end. Before viewport-fit=cover Safari handed the
     page an already-inset window; now it hands over the whole display and the
     stylesheet is the only thing left that can keep the nav out from under the
     housing. Either the shell or the element owning that edge may do it. */
  const LANDSCAPE = 852;
  const HOUSING = 59;

  const insetAt = (side: 'left' | 'right', env: Record<string, number>) =>
    ['.app-layout', side === 'left' ? '.sidebar' : '.main-content'].reduce(
      (sum, sel) => sum + edgeInset(declarations(css, sel, LANDSCAPE), side, env),
      0,
    );

  it('holds the rail and the content clear of the sensor housing', () => {
    const cutout = { 'safe-area-inset-left': HOUSING, 'safe-area-inset-right': HOUSING };
    // Housing on the left: the nav icons start at x=0 and sit under it.
    expect(insetAt('left', cutout)).toBeGreaterThanOrEqual(HOUSING);
    // Rotated the other way: the topbar and screen content are clipped instead.
    expect(insetAt('right', cutout)).toBeGreaterThanOrEqual(HOUSING);
  });

  it('costs a screen without a cutout nothing', () => {
    const flat = { 'safe-area-inset-left': 0, 'safe-area-inset-right': 0 };
    expect(insetAt('left', flat)).toBe(0);
    expect(insetAt('right', flat)).toBe(0);
  });
});
