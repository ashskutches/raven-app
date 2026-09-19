'use client';

/**
 * Raven — eight screens.
 *
 * v2 had thirteen nav items serving a life coach. v3 is a sidekick that gets
 * things done, and everything that did not serve that is gone rather than
 * hidden: Dashboard, Today, Goals, Library, Research, Activity, Cost, Finances,
 * Shopping, Evolution, About Ash, Habits, Check-in, Energy, Sleep, Decisions.
 *
 *   Work       give her a task, watch it run, answer what she asks
 *   Chat       talk to her
 *   Mind       what she thought without being asked
 *   Console    a REPL into her — the same pipe as Chat, with the work shown
 *   Approvals  decide the things she cannot do alone
 *   Blockages  what she could not do at all, and why
 *   People     who she is allowed to ask
 *   Settings   what she is connected to, what she runs on, what it costs
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { ListChecks, MessageSquare, ShieldQuestion, Users, Zap, SlidersHorizontal, Brain, TerminalSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api';

import WorkScreen      from '@/components/WorkScreen';
import ChatScreen      from '@/components/ChatScreen';
import ApprovalsScreen from '@/components/ApprovalsScreen';
import PeopleScreen    from '@/components/PeopleScreen';
import BlockagesScreen from '@/components/BlockagesScreen';
import SettingsScreen   from '@/components/SettingsScreen';
import MindScreen       from '@/components/MindScreen';
import ConsoleScreen    from '@/components/ConsoleScreen';
import AuthGate        from '@/components/AuthGate';

type Screen = 'work' | 'chat' | 'mind' | 'console' | 'approvals' | 'blockages' | 'people' | 'settings';

const VALID_SCREENS = new Set<Screen>(['work', 'chat', 'mind', 'console', 'approvals', 'blockages', 'people', 'settings']);

/**
 * Chat, Mind and Console lay themselves out full-height and scroll internally;
 * the rest are documents that scroll as one column. That column — gutter,
 * measure, bottom padding — belongs here rather than being re-guessed inside
 * each screen, which is how Work and Approvals ended up with no horizontal
 * padding at all while People padded itself to a different width.
 */
const FULL_HEIGHT_SCREENS = new Set<Screen>(['chat', 'mind', 'console']);

const SCREEN_TITLES: Record<Screen, string> = {
  work:      'Work',
  chat:      'Chat',
  mind:      'Mind',
  console:   'Console',
  approvals: 'Approvals',
  blockages: 'Blockages',
  people:    'People',
  settings:  'Settings',
};

/**
 * Mind sits next to Chat rather than at the end.
 *
 * It is the other half of the conversation: Chat is what she says when asked, Mind is
 * what she thought without being asked. It was cut in v3 as coach-era clutter, but the
 * table behind it never stopped filling — 194 unaddressed questions for Ash had piled
 * up with nowhere to appear. Buried at the bottom of the nav it would pile up again.
 *
 * Console follows them for the same reason in reverse: it is the third way of talking
 * to her, so it belongs with the other two rather than filed under tooling.
 */
const NAV_ITEMS: Array<{ id: Screen; label: string; icon: typeof ListChecks }> = [
  { id: 'work',      label: 'Work',      icon: ListChecks     },
  { id: 'chat',      label: 'Chat',      icon: MessageSquare  },
  { id: 'mind',      label: 'Mind',      icon: Brain          },
  { id: 'console',   label: 'Console',   icon: TerminalSquare },
  { id: 'approvals', label: 'Approvals', icon: ShieldQuestion },
  { id: 'blockages', label: 'Blockages', icon: Zap            },
  { id: 'people',    label: 'People',    icon: Users          },
  { id: 'settings',  label: 'Settings',  icon: SlidersHorizontal },
];

/**
 * The mark.
 *
 * This was the 🦅 emoji until 2026-09-16 — an eagle, rendered as a different bird on
 * every operating system, and the single cheapest-looking thing on a screen that gets
 * demoed.
 *
 * A raven head in profile: domed skull, a short heavy beak, and the throat hackles
 * breaking to a point below the jaw. Drawn against the plate at 21px rather than in
 * the abstract, because a mark that only works at 78px is the usual way this goes
 * wrong — an earlier pass with a longer, finer beak read as an arrowhead in the
 * sidebar and was fine on a slide. The beak is deliberately stubby for that reason.
 *
 * The eye is a filled disc in the plate's own shadow rather than a knocked-out hole:
 * a hole shows whatever the gradient is doing underneath it, which changes with the
 * plate and left the eye invisible over the light end.
 */
function RavenMark() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Raven">
      <path
        d="M11.4 3 C7.3 3 4.2 6.1 4.2 10.2 c0 2.2 1 4.1 2.5 5.4 L4.3 20.8 l5.8-2.3 c.5.1 1 .2 1.5.2 1.4 0 2.6-.4 3.7-1 L13.8 12.9 L20.2 11.8 L14 9.4 C13.6 5.8 12.8 3 11.4 3 Z"
        fill="#fff"
      />
      <circle cx="9.3" cy="8.5" r="1.3" fill="rgba(23,14,56,0.9)" />
    </svg>
  );
}

/** What the topbar knows. Null anywhere means "not read", never "fine". */
interface Vitals {
  model: string | null;
  register: string | null;
  paused: boolean | null;
  pending: number | null;
  reachable: boolean;
}

export default function ScreenPage() {
  const params = useParams();
  const router = useRouter();
  const [vitals, setVitals] = useState<Vitals>({
    model: null, register: null, paused: null, pending: null, reachable: true,
  });

  const raw = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const screen: Screen = raw && VALID_SCREENS.has(raw as Screen) ? (raw as Screen) : 'work';

  const navigate = useCallback((s: string) => {
    router.push(`/${VALID_SCREENS.has(s as Screen) ? s : 'work'}`);
  }, [router]);

  useEffect(() => {
    document.title = `${SCREEN_TITLES[screen]} — Raven`;
  }, [screen]);

  // The approvals badge is the one number worth carrying across every screen:
  // a queued action blocks a task until it is decided.
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await apiFetch('/approvals');
        if (!alive) return;
        if (!r.ok) { setVitals(v => ({ ...v, reachable: false })); return; }
        const items = (await r.json()) as unknown[];
        setVitals(v => ({ ...v, pending: items.length, reachable: true }));
      } catch {
        if (alive) setVitals(v => ({ ...v, reachable: false }));
      }
    }
    void poll();
    const t = setInterval(poll, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  /**
   * Model and register are read on mount, on navigation, and when something says it
   * changed them — not on a timer.
   *
   * `/settings` is a fat response (calendars, MCP servers, retractions, preferences)
   * and these two fields move about once a month, so polling it every twenty seconds
   * to watch a string that never changes would be the expensive way to be wrong. The
   * two places they DO change — Settings and the Console — announce it on the window,
   * which is both cheaper and immediate.
   */
  const loadIdentity = useCallback(async () => {
    const [sr, vr] = await Promise.all([
      apiFetch('/settings').then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/settings/voice').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const s = sr as { llm?: { current_model?: string }; autonomy?: { paused?: boolean } } | null;
    const v = vr as { register?: string } | null;
    setVitals(prev => ({
      ...prev,
      model: s?.llm?.current_model ?? null,
      paused: typeof s?.autonomy?.paused === 'boolean' ? s.autonomy.paused : null,
      register: v?.register ?? null,
    }));
  }, []);

  useEffect(() => { void loadIdentity(); }, [loadIdentity, screen]);

  useEffect(() => {
    const onChanged = () => { void loadIdentity(); };
    window.addEventListener('raven:identity-changed', onChanged);
    return () => window.removeEventListener('raven:identity-changed', onChanged);
  }, [loadIdentity]);

  // One tone for the pill. Amber beats green whenever something is actually waiting
  // or switched off — a status light that is always green is a decoration.
  const tone =
    !vitals.reachable ? 'is-unknown'
    : vitals.paused === true || (vitals.pending ?? 0) > 0 ? 'is-warn'
    : '';

  return (
    <AuthGate>
      <MotionConfig reducedMotion="user">
        <div className="app-layout">
          <nav className="sidebar">
            <div className="sidebar-logo">
              <div className="raven-icon"><RavenMark /></div>
              <span className="logo-text">Raven</span>
            </div>

            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`nav-${id}`}
                className={`nav-item ${screen === id ? 'active' : ''}`}
                onClick={() => navigate(id)}
                aria-label={label}
                aria-current={screen === id ? 'page' : undefined}
              >
                {screen === id && (
                  <motion.span
                    layoutId="nav-active"
                    className="nav-active-plate"
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                  />
                )}
                <Icon size={17} style={{ position: 'relative' }} />
                <span style={{ position: 'relative' }}>{label}</span>
                {id === 'approvals' && (vitals.pending ?? 0) > 0 && (
                  <span style={{
                    position: 'relative',
                    marginLeft: 'auto',
                    background: 'rgba(245,158,11,0.9)',
                    color: '#111',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '100px',
                    lineHeight: '16px',
                    minWidth: '18px',
                    textAlign: 'center',
                  }}>
                    {(vitals.pending ?? 0) > 99 ? '99+' : vitals.pending}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <main className="main-content">
            <header className="topbar">
              {/* Same measure as .screen--doc so the page title sits over the
                  left edge of the content rather than 100px off it. */}
              <div className={`topbar-inner ${FULL_HEIGHT_SCREENS.has(screen) ? 'topbar-inner--full' : ''}`.trim()}>
                <h1 className="topbar-title">{SCREEN_TITLES[screen]}</h1>

                {/*
                  * This said "Raven is online" beside a permanently green dot until
                  * 2026-09-16 — the same sentence whether she was reachable, paused,
                  * or sitting on nine approvals. It now carries the three facts that
                  * change what she will actually do, and says "unreachable" when it
                  * cannot read them rather than staying green.
                  */}
                <div className={`topbar-status ${tone}`.trim()}>
                  <span className="status-dot" />
                  {!vitals.reachable ? (
                    'raven-api unreachable'
                  ) : (
                    <>
                      {vitals.paused === true ? 'Autonomy paused' : 'Raven is online'}
                      {vitals.model && (
                        <>
                          <span className="topbar-status-sep">·</span>
                          {vitals.model}
                        </>
                      )}
                      {vitals.register && (
                        <>
                          <span className="topbar-status-sep">·</span>
                          {vitals.register}
                        </>
                      )}
                      {(vitals.pending ?? 0) > 0 && (
                        <>
                          <span className="topbar-status-sep">·</span>
                          {vitals.pending} to approve
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </header>

            <AnimatePresence mode="wait">
              <motion.div
                key={screen}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={`screen ${FULL_HEIGHT_SCREENS.has(screen) ? 'screen--full' : 'screen--doc'}`}
              >
                {screen === 'work'      && <WorkScreen />}
                {screen === 'chat'      && <ChatScreen />}
                {screen === 'mind'      && <MindScreen />}
                {screen === 'console'   && <ConsoleScreen />}
                {screen === 'approvals' && <ApprovalsScreen />}
                {screen === 'blockages' && <BlockagesScreen />}
                {screen === 'people'    && <PeopleScreen />}
                {screen === 'settings'  && <SettingsScreen />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </MotionConfig>
    </AuthGate>
  );
}
