'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, BookOpen, LayoutDashboard } from 'lucide-react';
import ChatScreen from '@/components/ChatScreen';
import LibraryScreen from '@/components/LibraryScreen';
import DashboardScreen from '@/components/DashboardScreen';

type Screen = 'chat' | 'library' | 'dashboard';

const NAV = [
  { id: 'chat', label: 'Chat with Raven', icon: MessageSquare },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'library', label: "Raven's Library", icon: BookOpen },
] as const;

export default function Home() {
  const [screen, setScreen] = useState<Screen>('chat');

  return (
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
          <h1 className="topbar-title">
            {NAV.find(n => n.id === screen)?.label}
          </h1>
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
            {screen === 'chat' && <ChatScreen />}
            {screen === 'dashboard' && <DashboardScreen />}
            {screen === 'library' && <LibraryScreen />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
