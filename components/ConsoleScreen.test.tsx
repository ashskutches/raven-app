import { describe, expect, it } from 'vitest';

import { autonomyStatus } from './ConsoleScreen';
import { MODE_STYLE } from './AutonomyBadge';

/* The console sits under the AutonomyBadge on the same screen. Two surfaces
   reading the same state must not describe it differently -- so these assert
   against MODE_STYLE rather than against a hand-copied string, which is the
   only version of the test that would still fail if the labels moved. */

describe('autonomyStatus', () => {
  it('does not call a commissioned Raven "running" -- she acts only when asked', () => {
    const s = autonomyStatus({ paused: false, mode: 'commissioned' });
    expect(s.text).toContain(MODE_STYLE.commissioned.label);
    expect(s.text).not.toMatch(/running/i);
    // Constrained is not a neutral fact on a demo screen; it gets a colour.
    expect(s.kind).toBe('warn');
  });

  it('prefers mode over the boolean when the two could disagree', () => {
    // `paused: false` is true of both commissioned and autonomous, so it can
    // never be the field that distinguishes them.
    expect(autonomyStatus({ paused: false, mode: 'autonomous' }).text)
      .toContain(MODE_STYLE.autonomous.label);
    expect(autonomyStatus({ paused: false, mode: 'commissioned' }).text)
      .toContain(MODE_STYLE.commissioned.label);
  });

  it('says nothing is held back only when she is genuinely unleashed', () => {
    expect(autonomyStatus({ paused: false, mode: 'autonomous' }).kind).toBe('dim');
  });

  it('still shouts about a paused Raven, and says what stopped', () => {
    const s = autonomyStatus({ paused: true, mode: 'paused' });
    expect(s.kind).toBe('warn');
    expect(s.text).toContain(MODE_STYLE.paused.label);
    expect(s.text).toMatch(/scheduled work is not running/);
  });

  it('falls back to the boolean for a backend too old to send a mode', () => {
    expect(autonomyStatus({ paused: true }).kind).toBe('warn');
    // The boolean can prove she is stopped but never that she is unleashed, so
    // the fallback must not promote "not paused" into "running".
    const s = autonomyStatus({ paused: false });
    expect(s.text).not.toMatch(/running/i);
    expect(s.text).toBe('not paused');
  });

  it('ignores a mode it does not recognise rather than printing it raw', () => {
    expect(autonomyStatus({ paused: true, mode: 'sabbatical' }).text)
      .toContain(MODE_STYLE.paused.label);
  });

  it('reports an unreadable read as unreadable instead of omitting the line', () => {
    expect(autonomyStatus(null).text).toBe('unreadable');
    expect(autonomyStatus({}).text).toBe('unreadable');
  });
});
