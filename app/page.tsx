'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MessageSquare, User, Target, BookOpen,
  Brain, Radio, Zap, DollarSign,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

import DashboardScreen    from '@/components/DashboardScreen';
import ChatScreen         from '@/components/ChatScreen';
import AshProfileScreen   from '@/components/AshProfileScreen';
import GoalsScreen        from '@/components/GoalsScreen';
import ResearchLibraryScreen from '@/components/ResearchLibraryScreen';
import MindScreen         from '@/components/MindScreen';
import ActivityScreen     from '@/components/ActivityScreen';
import EvolutionScreen    from '@/components/EvolutionScreen';
import CostScreen         from '@/components/CostScreen';
import AuthGate           from '@/components/AuthGate';

type Screen = 'dashboard' | 'chat' | 'profile' | 'goals' | 'library' | 'mind' | 'activity' | 'evolution' | 'cost';

const SCREEN_TITLES: Record<Screen, string> = {
  dashboard: 'Command Center',
  chat:      'Chat with Raven',
  profile:   'About Ash',
  goals:     'Goals',
  library:   'Research & Library',
  mind:      "Raven's Mind",
  activity:  'Activity',
  evolution: 'Evolution Queue',
  cost:      'Cost',
};

const NAV_ITEMS: Array<{ id: Screen; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'chat',      label: 'Chat',       icon: MessageSquare   },
  { id: 'profile',   label: 'About Ash',  icon: User            },
  { id: 'goals',     label: 'Goals',      icon: Target          },
  { id: 'library',   label: 'Research',   icon: BookOpen        },
  { id: 'mind',      label: 'Mind',       icon: Brain           },
  { id: 'activity',  label: 'Activity',   icon: Radio           },
  { id: 'evolution', label: 'Evolve',     icon: Zap             },
  { id: 'cost',      label: 'Cost',       icon: DollarSign      },
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [evolutionCount, setEvolutionCount] = useState(0);

  useEffect(() => {
    async function fetchEvolution() {
      try {
        const r = await apiFetch('/evolution/summary');
        if (!r.ok) return;
        const data = await r.json() as { total_pending: number };
        setEvolutionCount(data.total_pending ?? 0);
      } catch { /* silent */ }
    }
    fetchEvolution();
    const interval = setInterval(fetchEvolution, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AuthGate>
      <div className="app-layout">
        {/* Sidebar */}
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
              onClick={() => setScreen(id)}
              aria-label={label}
            >
              <Icon size={17} />
              {label}
              {id === 'evolution' && evolutionCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'rgba(251,113,133,0.85)',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '100px',
                  lineHeight: '16px',
                  minWidth: '18px',
                  textAlign: 'center',
                }}>
                  {evolutionCount > 99 ? '99+' : evolutionCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Main */}
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
              {screen === 'dashboard' && <DashboardScreen onNavigate={(s) => setScreen(s as Screen)} />}
              {screen === 'chat'      && <ChatScreen />}
              {screen === 'profile'   && <AshProfileScreen />}
              {screen === 'goals'     && <GoalsScreen />}
              {screen === 'library'   && <ResearchLibraryScreen />}
              {screen === 'mind'      && <MindScreen />}
              {screen === 'activity'  && <ActivityScreen />}
              {screen === 'evolution' && <EvolutionScreen onResolved={() => setEvolutionCount(c => Math.max(0, c - 1))} />}
              {screen === 'cost'      && <CostScreen />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </AuthGate>
  );
}
