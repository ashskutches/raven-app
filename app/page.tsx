'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, BookOpen, LayoutDashboard, Target, Repeat, Sun } from 'lucide-react';
import ChatScreen from '@/components/ChatScreen';
import LibraryScreen from '@/components/LibraryScreen';
import DashboardScreen from '@/components/DashboardScreen';
import GoalsScreen from '@/components/GoalsScreen';
import HabitsScreen from '@/components/HabitsScreen';
import CheckInScreen from '@/components/CheckInScreen';
import AuthGate from '@/components/AuthGate';

type Screen = 'chat' | 'library' | 'dashboard' | 'goals' | 'habits' | 'checkin';

const NAV = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'habits', label: 'Habits', icon: Repeat },
  { id: 'checkin', label: 'Daily Check-in', icon: Sun },
  { id: 'library', label: "Raven's Library", icon: BookOpen },
] as const;

const SCREEN_TITLES: Record<Screen, string> = {
  chat: 'Chat with Raven',
  dashboard: 'Dashboard',
  goals: 'Goals',
  habits: 'Habits & Streaks',
  checkin: 'Daily Check-in',
  library: "Raven's Library",
};

export default function Home() {
  const [screen, setScreen] = useState<Screen>('chat');

  return (
    <AuthGate>
      <div className="app-layout">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="raven-icon">🦅</div>
            <span className="logo-text">Raven</span>
          </div>

          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${screen === id ? 'active' : ''}`}
              onClick={() => setScreen(id as Screen)}
              aria-label={label}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        {/* ── Main ─────────────────────────────────────────────── */}
        <main className="main-content">
          {/* Topbar */}
          <header className="topbar">
            <h1 className="topbar-title">{SCREEN_TITLES[screen]}</h1>
            <div className="topbar-status">
              <span className="status-dot" />
              Raven is online
            </div>
          </header>

          {/* Animated screen transitions */}
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
              {screen === 'dashboard' && <DashboardScreen />}
              {screen === 'goals'     && <GoalsScreen />}
              {screen === 'habits'    && <HabitsScreen />}
              {screen === 'checkin'   && <CheckInScreen />}
              {screen === 'library'   && <LibraryScreen />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </AuthGate>
  );
}
