'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, BookOpen, LayoutDashboard, Target, Repeat, Sun, Zap, Radio, Calendar, Brain, FlaskConical, User } from 'lucide-react';
import ChatScreen from '@/components/ChatScreen';
import LibraryScreen from '@/components/LibraryScreen';
import DashboardScreen from '@/components/DashboardScreen';
import GoalsScreen from '@/components/GoalsScreen';
import HabitsScreen from '@/components/HabitsScreen';
import CheckInScreen from '@/components/CheckInScreen';
import EvolutionScreen from '@/components/EvolutionScreen';
import ActivityScreen from '@/components/ActivityScreen';
import RoutinesScreen from '@/components/RoutinesScreen';
import MindScreen from '@/components/MindScreen';
import ResearchScreen from '@/components/ResearchScreen';
import AshProfileScreen from '@/components/AshProfileScreen';
import AuthGate from '@/components/AuthGate';

type Screen = 'chat' | 'library' | 'dashboard' | 'goals' | 'habits' | 'checkin' | 'evolution' | 'activity' | 'routines' | 'mind' | 'research' | 'profile';

const SCREEN_TITLES: Record<Screen, string> = {
  chat:       'Chat with Raven',
  dashboard:  'Dashboard',
  goals:      'Goals',
  habits:     'Habits & Streaks',
  checkin:    'Daily Check-in',
  library:    "Raven's Library",
  evolution:  'Evolution Queue',
  activity:   'Activity Feed',
  routines:   "Raven's Routines",
  mind:       "Raven's Mind",
  research:   'Research Queue',
  profile:    'About Ash',
};

const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'https://raven-api-production.up.railway.app';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('chat');
  const [evolutionCount, setEvolutionCount] = useState(0);

  // Poll evolution queue summary for nav badge
  useEffect(() => {
    async function fetchSummary() {
      try {
        const r = await fetch(`${RAVEN_API}/evolution/summary`);
        if (!r.ok) return;
        const data = await r.json() as { total_pending: number; critical: number };
        setEvolutionCount(data.total_pending ?? 0);
      } catch { /* silent */ }
    }
    fetchSummary();
    const interval = setInterval(fetchSummary, 30_000);
    return () => clearInterval(interval);
  }, []);

  const NAV = [
    { id: 'chat',      label: 'Chat',        icon: MessageSquare,    badge: 0 },
    { id: 'profile',   label: 'About Ash',   icon: User,             badge: 0 },
    { id: 'mind',      label: 'Mind',        icon: Brain,            badge: 0 },
    { id: 'research',  label: 'Research',    icon: FlaskConical,     badge: 0 },
    { id: 'activity',  label: 'Activity',    icon: Radio,            badge: 0 },
    { id: 'routines',  label: 'Routines',    icon: Calendar,         badge: 0 },
    { id: 'library',   label: 'Library',     icon: BookOpen,         badge: 0 },
    { id: 'goals',     label: 'Goals',       icon: Target,           badge: 0 },
    { id: 'habits',    label: 'Habits',      icon: Repeat,           badge: 0 },
    { id: 'checkin',   label: 'Check-in',    icon: Sun,              badge: 0 },
    { id: 'dashboard', label: 'Dashboard',   icon: LayoutDashboard,  badge: 0 },
    { id: 'evolution', label: 'Evolve',      icon: Zap,              badge: evolutionCount },
  ] as const;

  return (
    <AuthGate>
      <div className="app-layout">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="raven-icon">🦅</div>
            <span className="logo-text">Raven</span>
          </div>

          {NAV.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              className={`nav-item ${screen === id ? 'active' : ''}`}
              onClick={() => setScreen(id as Screen)}
              aria-label={label}
            >
              <Icon size={17} />
              {label}
              {badge > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: id === 'evolution' ? 'rgba(251,113,133,0.85)' : 'rgba(167,139,250,0.85)',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '100px',
                  lineHeight: '16px',
                  minWidth: '18px',
                  textAlign: 'center',
                }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* ── Main ─────────────────────────────────────────────── */}
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
              style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              {screen === 'chat'      && <ChatScreen />}
              {screen === 'profile'   && <AshProfileScreen />}
              {screen === 'mind'      && <MindScreen />}
              {screen === 'research'  && <ResearchScreen />}
              {screen === 'activity'  && <ActivityScreen />}
              {screen === 'library'   && <LibraryScreen />}
              {screen === 'routines'  && <RoutinesScreen />}
              {screen === 'goals'     && <GoalsScreen />}
              {screen === 'habits'    && <HabitsScreen />}
              {screen === 'checkin'   && <CheckInScreen />}
              {screen === 'dashboard' && <DashboardScreen />}
              {screen === 'evolution' && <EvolutionScreen onResolved={() => setEvolutionCount(c => Math.max(0, c - 1))} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </AuthGate>
  );
}
