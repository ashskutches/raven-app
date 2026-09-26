// @vitest-environment node
//
// This file reads globals.css and page.tsx off disk. The suite's default
// environment is jsdom, and a jsdom file's `node:fs` can come back as Vite's
// browser stub -- an object whose every export is undefined. `readFileSync`
// is then not a function, it throws at module scope, and the file reports
// "0 test" with no failing assertion naming the cause. Nothing below touches
// the DOM, so pin the environment rather than depend on that resolution.
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

  /* The 16px field rule used to live in this block and was asserted here by
     matching its text. It is scoped to the pointer now, which a text match
     cannot tell from being scoped to nothing — see `touch fields` below. */

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

/* A window to resolve the cascade against. Width alone was enough while every
   at-rule here keyed off width, but the field-zoom rule below keys off the
   pointer instead — the same phone is coarse at both 393px and 852px. */
type Device = { width: number; pointer: 'fine' | 'coarse' };

/** Does this at-rule prelude hold on `device`? */
function atRuleHolds(prelude: string, device: Device): boolean {
  if (prelude.startsWith('@supports')) return true;
  if (!prelude.startsWith('@media')) return false;
  return [...prelude.matchAll(/\(\s*([\w-]+)\s*:\s*([^)]+)\)/g)].every(([, name, raw]) => {
    const value = raw.trim();
    if (name === 'pointer') return value === device.pointer;
    const n = Number(/^([\d.]+)px$/.exec(value)?.[1]);
    if (name === 'max-width') return device.width <= n;
    if (name === 'min-width') return device.width >= n;
    return false; // prefers-reduced-motion and friends are not this scenario
  });
}

/** Declarations applying to `selector` on `device`, in source order. */
function declarations(source: string, selector: string, device: Device): Array<[string, string]> {
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
      enclosing.push(atRuleHolds(prelude, device));
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

/* One iPhone 15 Pro, both ways up, and the desk it is not. Portrait is under
   the 720px breakpoint and landscape is over it, which is the whole point:
   rules the phone needs in both orientations cannot be written against width. */
const PORTRAIT: Device = { width: 393, pointer: 'coarse' };
const LANDSCAPE: Device = { width: 852, pointer: 'coarse' };
const DESKTOP: Device = { width: 1440, pointer: 'fine' };

/** The declaration of `prop` that wins for `selector` on `device`, if any. */
function resolved(selector: string, prop: string, device: Device): string | undefined {
  const hits = declarations(css, selector, device).filter(([p]) => p === prop);
  return hits.length ? hits[hits.length - 1][1] : undefined;
}

/* ──────────────────────────────────────────────────────────────
   iOS decides whether to zoom a focused field by the field's type
   size, and it does that on any touch window — not only ones under
   720px. The same iPhone that is 393px upright is 852px sideways,
   so a width breakpoint covers one orientation of the device it was
   written for. Resolve these against the pointer instead.
  ────────────────────────────────────────────────────────────── */
describe('touch fields', () => {
  for (const [orientation, device] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ] as const) {
    it(`holds a focused field at 16px in ${orientation}, so iOS does not zoom the page in`, () => {
      for (const sel of ['input', 'textarea', 'select']) {
        // The screens size their fields from style attributes — 15px on the Work
        // task title, 14 on the People form, 12 on feedback — so the rule has to
        // carry !important or it loses to every one of them.
        expect(resolved(sel, 'font-size', device), `\`${sel}\` in ${orientation}`)
          .toBe('16px !important');
      }
    });
  }

  it('reads the console transcript back at the size its input types at', () => {
    // A 12.5px transcript under a forced-16px prompt shows the line visibly
    // smaller than the caret that produced it, so these move together.
    for (const [orientation, device] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
      for (const sel of ['.console-scroll', '.console-caret']) {
        expect(resolved(sel, 'font-size', device), `\`${sel}\` in ${orientation}`).toBe('16px');
      }
    }
  });

  it('leaves a mouse-driven window at its authored sizes', () => {
    // None of this is a desktop concern, and 16px console text there would be
    // a visible regression rather than a fix.
    expect(resolved('input', 'font-size', DESKTOP)).toBeUndefined();
    expect(resolved('textarea', 'font-size', DESKTOP)).toBe('14px');
    expect(resolved('.console-scroll', 'font-size', DESKTOP)).toBe('12.5px');
    expect(resolved('.console-caret', 'font-size', DESKTOP)).toBe('12.5px');
  });
});

describe('display cutouts', () => {
  /* iPhone 15 Pro held sideways: the CSS window is 852px wide — past the 720px
     breakpoint, so this is the rail layout, not the tab bar — and the sensor
     housing eats 59px of one end. Before viewport-fit=cover Safari handed the
     page an already-inset window; now it hands over the whole display and the
     stylesheet is the only thing left that can keep the nav out from under the
     housing. Either the shell or the element owning that edge may do it. */
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

/* ──────────────────────────────────────────────────────────────
   The approvals count is the one box in the tab bar whose width comes
   from data rather than from the stylesheet, and the tab bar is the one
   place it has no room. In the rail it sits at the end of a 232px row
   and `margin-left: auto` keeps it there at any width; stacked, it is
   pinned to a point inside a tab an eighth of a phone wide and grows
   from there. Nothing clips it — `.app-layout`'s `overflow: hidden` is
   the shell edge, and the `overflow: hidden` on the tab labels excludes
   this span by name — so a pill anchored too far right does not get
   trimmed, it lands on the next tab.

   jsdom has no layout engine and cannot measure text, so this resolves
   the cascade by hand the way the cutout arithmetic above does, with a
   glyph advance stood in for the font. The conclusion does not turn on
   that estimate: '99+' is ~18px of glyphs in any sans at 10px/700, and
   a centre-anchored pill misses by ~9px.
  ────────────────────────────────────────────────────────────── */
describe('approvals count on a phone', () => {
  /** Widest label the badge ever renders — page.tsx caps the count at '99+'. */
  const WIDEST = '99+';

  /** Tabs across the bar, from the array the shell actually maps over. */
  const TABS = (() => {
    const literal = /const NAV_ITEMS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(shell);
    expect(literal, 'no NAV_ITEMS array in the shell').not.toBeNull();
    return [...literal![1].matchAll(/\bid:\s*'/g)].length;
  })();

  /** A length, possibly a percentage of `basis`. `auto` and unknowns are null. */
  function len(value: string | undefined, basis: number): number | null {
    const v = (value ?? '').trim();
    const pct = /^(-?[\d.]+)%$/.exec(v);
    if (pct) return (Number(pct[1]) / 100) * basis;
    const abs = /^(-?[\d.]+)px$/.exec(v);
    if (abs) return Number(abs[1]);
    return v === '0' ? 0 : null;
  }

  /** Every declaration applying to `selector` on `device`, later winning. */
  function resolve(selector: string, device: Device): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [prop, value] of declarations(css, selector, device)) out[prop] = value;
    return out;
  }

  /** Horizontal padding, from the shorthand or the long-hands. */
  function paddingX(d: Record<string, string>): number {
    let left = 0;
    let right = 0;
    if (d.padding) {
      const p = splitTop(d.padding, ' \t\n\r');
      right = len(p[1] ?? p[0], 0) ?? 0;
      left = len(p[3] ?? p[1] ?? p[0], 0) ?? 0;
    }
    left = len(d['padding-left'], 0) ?? left;
    right = len(d['padding-right'], 0) ?? right;
    return left + right;
  }

  /** The badge's edges, in px from the left edge of its tab. */
  function badgeBox(label: string, screen: number, tab: number) {
    // A phone, so the pointer is coarse: some of what reaches the tab bar is
    // scoped to the pointer rather than to the window's width.
    const d = resolve('.nav-badge', { width: screen, pointer: 'coarse' });
    expect(d.position, 'the badge is not pinned on a phone').toBe('absolute');

    // Inter's digits and '+' run about 0.6em, and the global reset makes
    // min-width a border-box width, so padding is inside it.
    const glyphs = label.length * (len(d['font-size'], 0) ?? 0) * 0.6;
    const width = Math.max(len(d['min-width'], tab) ?? 0, glyphs + paddingX(d));

    const right = len(d.right, tab);
    if (right !== null) return { left: tab - right - width, right: tab - right };
    const left = (len(d.left, tab) ?? 0) + (len(d['margin-left'], tab) ?? 0);
    return { left, right: left + width };
  }

  // 375px is an iPhone 12–16 held upright; 320px is an SE, and the narrowest
  // screen that still gets this layout rather than a horizontal scrollbar.
  // Portrait, so `.app-layout`'s safe-area padding is zero and the eight
  // `flex: 1 1 0` tabs divide the whole window.
  for (const screen of [375, 320]) {
    const tab = screen / TABS;

    it(`keeps a ${WIDEST} count inside its own tab at ${screen}px`, () => {
      const box = badgeBox(WIDEST, screen, tab);
      expect(
        box.right,
        `'${WIDEST}' runs ${(box.right - tab).toFixed(1)}px past its ${tab.toFixed(1)}px tab`,
      ).toBeLessThanOrEqual(tab);
      expect(box.left, `'${WIDEST}' runs past the left edge of its tab`).toBeGreaterThanOrEqual(0);
    });

    it(`keeps it on the icon's shoulder at ${screen}px`, () => {
      // It is a count on the approvals icon, not a second element beside it —
      // a fix that recentres the pill under the label has lost the point.
      expect(badgeBox(WIDEST, screen, tab).right).toBeGreaterThan(tab / 2);
    });
  }
});
