'use client';

/**
 * THE LEASH, ON EVERY SCREEN
 * ══════════════════════════════════════════════════════════════════════════
 * Ash set Raven to commissioned-only on 15 September 2026 and asked to be able
 * to see it. This is that — in the topbar, so it is on Work, Chat, Mind,
 * Approvals, People and Settings alike rather than only where he went looking.
 *
 * The design problem is specific. A commissioned Raven looks *exactly* like a
 * broken one from the outside: the board stops moving, the messages thin out,
 * and nothing says why. The old indicator said "Raven is online", which stayed
 * true and stopped being the useful fact. So this states the constraint, and
 * carries the number that is otherwise invisible — how many of her own ideas
 * are parked behind it. That count is the honest cost of the setting, and it
 * belongs where the setting is, not buried in a work filter.
 */

import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Pause, Zap } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export type AutonomyMode = 'paused' | 'commissioned' | 'autonomous';

export interface Autonomy {
  mode: AutonomyMode;
  parked: number;
}

/**
 * How each mode presents. Kept as data so the badge, the Settings selector and
 * anything added later cannot drift into describing the same state differently.
 */
export const MODE_STYLE: Record<AutonomyMode, {
  label: string;
  detail: string;
  icon: typeof ShieldCheck;
  rgb: string;
}> = {
  commissioned: {
    label: 'On commission only',
    detail: 'She thinks and plans freely. Acting needs a task from you.',
    icon: ShieldCheck,
    rgb: '245,158,11',
  },
  autonomous: {
    label: 'Working autonomously',
    detail: 'Her standing mandates apply to her own ideas as well as your tasks.',
    icon: Zap,
    rgb: '52,211,153',
  },
  paused: {
    label: 'Paused',
    detail: 'Every scheduled job is stopped. Chat still works.',
    icon: Pause,
    rgb: '148,163,184',
  },
};

/**
 * Tightest first. The order is deliberate: the setting Ash is most likely to
 * want is the one he reads first, and the one that lets her act on her own
 * initiative is the one he has to travel to.
 */
export const MODE_ORDER: AutonomyMode[] = ['paused', 'commissioned', 'autonomous'];

/** The fuller explanation, for the Settings screen where there is room for it. */
export const MODE_BLURB: Record<AutonomyMode, string> = {
  paused:
    'Nothing runs. No scheduled jobs, no research, no work on her own tasks, no messages to you. '
    + 'She still answers when you talk to her.',
  commissioned:
    'She reads, researches, reviews your goals, forms opinions and writes work down — all of it unprompted. '
    + 'But anything that reaches the outside world, or any task she set herself, waits for you. '
    + 'Give her a task and she runs with it until it is done.',
  autonomous:
    'Her standing mandates apply to whatever she decides to do, not just to what you asked for. '
    + 'She can act on her own conclusions without checking first.',
};

export function useAutonomy(pollMs = 30_000): Autonomy | null {
  const [state, setState] = useState<Autonomy | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await apiFetch('/config/autonomy');
      if (!r.ok) return;
      const body = await r.json() as Partial<Autonomy>;
      // An unrecognised mode renders as commissioned rather than as nothing.
      // A badge that vanishes when the API returns something unexpected is the
      // one failure this component must not have — its whole job is to stop a
      // constrained Raven from looking like an unconstrained one.
      setState({
        mode: body.mode && body.mode in MODE_STYLE ? body.mode : 'commissioned',
        parked: typeof body.parked === 'number' ? body.parked : 0,
      });
    } catch { /* keep the last known state rather than flickering to nothing */ }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, pollMs);
    // Changing the mode in Settings has to move the badge now, not up to
    // `pollMs` later. Without this Ash clicks the setting, the pill above it
    // still reads the old mode, and the reasonable conclusion is that the click
    // did not take — which is the one wrong impression this control cannot
    // afford to give. An event rather than lifted state, so the badge stays
    // mountable anywhere without the tree knowing about it.
    window.addEventListener(AUTONOMY_CHANGED, poll);
    return () => {
      clearInterval(t);
      window.removeEventListener(AUTONOMY_CHANGED, poll);
    };
  }, [poll, pollMs]);

  return state;
}

/** Dispatch after a successful mode write, so every listener re-reads. */
export const AUTONOMY_CHANGED = 'raven:autonomy-changed';

export function announceAutonomyChange(): void {
  window.dispatchEvent(new Event(AUTONOMY_CHANGED));
}

/** The topbar pill. `onClick` takes Ash to Settings, where he can change it. */
export default function AutonomyBadge({ onClick }: { onClick?: () => void }) {
  const autonomy = useAutonomy();

  // Nothing until the first poll lands: a badge that says "autonomous" for one
  // frame before correcting itself is worse than a badge that arrives late.
  if (!autonomy) return null;

  const { label, detail, icon: Icon, rgb } = MODE_STYLE[autonomy.mode];
  const parked = autonomy.mode !== 'autonomous' && autonomy.parked > 0;

  return (
    <button
      onClick={onClick}
      title={`${detail}${parked ? `\n${autonomy.parked} task${autonomy.parked === 1 ? '' : 's'} she set herself are parked.` : ''}\n\nClick to change in Settings.`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12,
        fontWeight: 500,
        color: `rgb(${rgb})`,
        padding: '4px 12px',
        borderRadius: 100,
        background: `rgba(${rgb},0.08)`,
        border: `1px solid rgba(${rgb},0.22)`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <Icon size={13} />
      {label}
      {parked && (
        <span style={{
          background: `rgba(${rgb},0.18)`,
          borderRadius: 100,
          padding: '0 6px',
          fontSize: 10.5,
          fontWeight: 700,
          lineHeight: '16px',
        }}>
          {autonomy.parked} parked
        </span>
      )}
    </button>
  );
}
