'use client';

/**
 * Raven — five screens.
 *
 * v2 had thirteen nav items serving a life coach. v3 is a sidekick that gets
 * things done, and everything that did not serve that is gone rather than
 * hidden: Dashboard, Today, Goals, Library, Research, Activity, Cost, Finances,
 * Shopping, Evolution, About Ash, Habits, Check-in, Energy, Sleep, Decisions.
 *
 *   Work       give her a task, watch it run, answer what she asks
 *   Chat       talk to her
 *   Approvals  decide the things she cannot do alone
 *   Blockages  what she could not do at all, and why
 *   People     who she is allowed to ask
 *   Settings   what she is connected to, what she runs on, what it costs
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListChecks, MessageSquare, ShieldQuestion, Users, Zap, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '@/lib/api';

import WorkScreen      from '@/components/WorkScreen';
import ChatScreen      from '@/components/ChatScreen';
import ApprovalsScreen from '@/components/ApprovalsScreen';
import PeopleScreen    from '@/components/PeopleScreen';
import BlockagesScreen from '@/components/BlockagesScreen';
import SettingsScreen   from '@/components/SettingsScreen';
import AuthGate        from '@/components/AuthGate';

type Screen = 'work' | 'chat' | 'approvals' | 'blockages' | 'people' | 'settings';

const VALID_SCREENS = new Set<Screen>(['work', 'chat', 'approvals', 'blockages', 'people', 'settings']);

const SCREEN_TITLES: Record<Screen, string> = {
  work:      'Work',
  chat:      'Chat',
  approvals: 'Approvals',
  blockages: 'Blockages',
  people:    'People',
  settings:  'Settings',
};

const NAV_ITEMS: Array<{ id: Screen; label: string; icon: typeof ListChecks }> = [
  { id: 'work',      label: 'Work',      icon: ListChecks     },
  { id: 'chat',      label: 'Chat',      icon: MessageSquare  },
  { id: 'approvals', label: 'Approvals', icon: ShieldQuestion },
  { id: 'blockages', label: 'Blockages', icon: Zap            },
  { id: 'people',    label: 'People',    icon: Users          },
  { id: 'settings',  label: 'Settings',  icon: SlidersHorizontal },
];

export default function ScreenPage() {
  const params = useParams();
  const router = useRouter();
  const [pendingApprovals, setPendingApprovals] = useState(0);

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
    async function poll() {
      try {
        const r = await apiFetch('/approvals');
        if (!r.ok) return;
        setPendingApprovals(((await r.json()) as unknown[]).length);
      } catch { /* silent */ }
    }
    poll();
    const t = setInterval(poll, 20_000);
    return () => clearInterval(t);
  }, []);

  return (
    <AuthGate>
      <div className="app-layout">
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="raven-icon">🦅</div>
            <span className="logo-text">Raven</span>
          </div>

          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`nav-${id}`}
              className={`nav-item ${screen === id ? 'active' : ''}`}
              onClick={() => navigate(id)}
              aria-label={label}
            >
              <Icon size={17} />
              {label}
              {id === 'approvals' && pendingApprovals > 0 && (
                <span style={{
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
                  {pendingApprovals > 99 ? '99+' : pendingApprovals}
                </span>
              )}
            </button>
          ))}
        </nav>

        <main className="main-content">
          <header className="topbar">
            <h1 className="topbar-title">{SCREEN_TITLES[screen]}</h1>
            <div className="topbar-status">
              <span className="status-dot" />
              Raven is online
            </div>
          </header>

          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
            >
              {screen === 'work'      && <WorkScreen />}
              {screen === 'chat'      && <ChatScreen />}
              {screen === 'approvals' && <ApprovalsScreen />}
              {screen === 'blockages' && <BlockagesScreen />}
              {screen === 'people'    && <PeopleScreen />}
              {screen === 'settings'  && <SettingsScreen />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </AuthGate>
  );
}
