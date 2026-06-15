'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Target, BookOpen, TrendingUp } from 'lucide-react';

type Fact = { key: string; value: string };
type Goal = { title: string; status: string; progress: number };
type LibraryStats = { total: number; byType: Record<string, number> };

const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'http://localhost:4000';

export default function DashboardScreen() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [libStats, setLibStats] = useState<LibraryStats>({ total: 0, byType: {} });
  const [health, setHealth] = useState<{ status: string; uptime: number } | null>(null);

  useEffect(() => {
    // Health check
    fetch(`${RAVEN_API}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => null);

    // Facts
    fetch(`${RAVEN_API}/library?type=user_fact&limit=10`)
      .then(r => r.json())
      .then((data: Array<{ title: string; summary: string }>) => {
        setFacts(data.map(d => ({ key: d.title, value: d.summary || '' })));
      })
      .catch(() => null);

    // Goals from library goal_context
    fetch(`${RAVEN_API}/library?type=goal_context&limit=6`)
      .then(r => r.json())
      .then((data: Array<{ title: string; summary: string }>) => {
        setGoals(data.map(d => ({ title: d.title, status: 'active', progress: 0 })));
      })
      .catch(() => null);

    // Library stats
    fetch(`${RAVEN_API}/library`)
      .then(r => r.json())
      .then((data: Array<{ type: string }>) => {
        const byType: Record<string, number> = {};
        data.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
        setLibStats({ total: data.length, byType });
      })
      .catch(() => null);
  }, []);

  const statCards = [
    {
      label: 'Library Entries',
      value: libStats.total,
      icon: Brain,
      color: 'var(--color-lavender)',
    },
    {
      label: 'Facts About Ash',
      value: libStats.byType['user_fact'] ?? 0,
      icon: TrendingUp,
      color: 'var(--color-gold)',
    },
    {
      label: 'Goal Contexts',
      value: libStats.byType['goal_context'] ?? 0,
      icon: Target,
      color: 'var(--color-emerald)',
    },
    {
      label: 'Research Entries',
      value: libStats.byType['research'] ?? 0,
      icon: BookOpen,
      color: 'var(--color-indigo)',
    },
  ];

  return (
    <div className="dashboard-container">
      {/* Status banner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          padding: '16px 20px',
          background: 'rgba(52,211,153,0.06)',
          border: '1px solid rgba(52,211,153,0.15)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 14,
        }}
      >
        <span className="status-dot" />
        <span style={{ color: 'var(--color-text)' }}>
          <strong>Raven is online</strong>
          {health
            ? ` · Uptime: ${Math.floor(health.uptime / 60)}m`
            : ' · Connecting to API...'}
        </span>
      </motion.div>

      {/* Stat cards */}
      <div>
        <h2 className="section-title">
          <Brain size={18} style={{ color: 'var(--color-lavender)' }} />
          What Raven Knows
        </h2>
        <div className="dashboard-grid">
          {statCards.map((card, i) => (
            <motion.div
              key={card.label}
              className="stat-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="stat-label">{card.label}</div>
                <card.icon size={18} style={{ color: card.color, opacity: 0.7 }} />
              </div>
              <div className="stat-value">{card.value}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent facts */}
      {facts.length > 0 && (
        <div>
          <h2 className="section-title">
            <TrendingUp size={18} style={{ color: 'var(--color-gold)' }} />
            What Raven Knows About You
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {facts.slice(0, 6).map((f, i) => (
              <motion.div
                key={f.key}
                className="fact-chip"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <span className="fact-key">{f.key}</span>
                <span className="fact-value">{f.value}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <div>
          <h2 className="section-title">
            <Target size={18} style={{ color: 'var(--color-emerald)' }} />
            Active Goals
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {goals.map((g, i) => (
              <motion.div
                key={g.title}
                className="fact-chip"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <span className="fact-key" style={{ color: 'var(--color-emerald)' }}>
                  {g.status === 'achieved' ? '✅' : '🎯'} {g.title}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {facts.length === 0 && goals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🦅</div>
          <p style={{ fontSize: 15 }}>
            Raven's dashboard will fill up as you chat. Start a conversation and she'll begin learning about you.
          </p>
        </div>
      )}
    </div>
  );
}
