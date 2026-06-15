'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Zap, BookOpen, Search, MessageSquare, Calendar, Wrench } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'https://raven-api-production.up.railway.app';

interface ActivityItem {
  id: string;
  action: string;
  summary: string;
  detail: Record<string, unknown>;
  status: 'success' | 'failed';
  created_at: string;
}

const ACTION_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  morning_briefing:  { icon: <span>☀️</span>, label: 'Morning Briefing', color: 'var(--color-gold, #f59e0b)' },
  evening_nudge:     { icon: <span>🌙</span>, label: 'Evening Check-in', color: 'var(--color-lavender)' },
  weekly_review:     { icon: <span>📊</span>, label: 'Weekly Review', color: 'var(--color-teal, #14b8a6)' },
  routine_run:       { icon: <Calendar size={14} />, label: 'Routine', color: 'var(--color-lavender)' },
  routine_created:   { icon: <Calendar size={14} />, label: 'Routine Created', color: '#a78bfa' },
  library_write:     { icon: <BookOpen size={14} />, label: 'Library Write', color: '#34d399' },
  research_stored:   { icon: <Search size={14} />, label: 'Research Stored', color: '#60a5fa' },
  fact_extracted:    { icon: <Zap size={14} />, label: 'Fact Extracted', color: '#f472b6' },
  proactive_message: { icon: <MessageSquare size={14} />, label: 'Proactive Message', color: '#fb923c' },
  tool_used:         { icon: <Wrench size={14} />, label: 'Tool Used', color: '#94a3b8' },
};

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'morning_briefing', label: 'Briefings' },
  { id: 'routine_run', label: 'Routines' },
  { id: 'research_stored', label: 'Research' },
  { id: 'library_write', label: 'Library' },
];

export default function ActivityScreen() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});

  const fetchActivity = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filter) params.set('action', filter);
      const r = await fetch(`${API}/activity?${params}`);
      if (!r.ok) return;
      const data = await r.json() as ActivityItem[];
      setItems(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await fetch(`${API}/activity/summary`);
      if (!r.ok) return;
      const data = await r.json() as { last_7_days: Record<string, number> };
      setSummary(data.last_7_days ?? {});
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchActivity, 30_000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  const totalActions = Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <div className="activity-screen">
      {/* Header stats */}
      <div className="activity-header">
        <div className="activity-stat-row">
          <div className="activity-stat">
            <span className="activity-stat-value">{totalActions}</span>
            <span className="activity-stat-label">actions this week</span>
          </div>
          {Object.entries(summary).slice(0, 4).map(([action, count]) => {
            const meta = ACTION_META[action];
            return (
              <div key={action} className="activity-stat">
                <span className="activity-stat-value" style={{ color: meta?.color }}>{count}</span>
                <span className="activity-stat-label">{meta?.label ?? action}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="activity-filters">
        {FILTERS.map(f => (
          <button
            key={f.id}
            className={`filter-chip ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="activity-feed">
        {loading ? (
          <div className="activity-empty">Loading activity...</div>
        ) : items.length === 0 ? (
          <div className="activity-empty">
            <span style={{ fontSize: 32 }}>📡</span>
            <p>No activity yet — Raven hasn&apos;t done anything autonomously yet.</p>
            <p style={{ fontSize: 12, opacity: 0.5 }}>Morning briefings, routines, and research will appear here.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map(item => {
              const meta = ACTION_META[item.action] ?? { icon: <Zap size={14} />, label: item.action, color: '#94a3b8' };
              const isExpanded = expanded === item.id;
              const hasDetail = Object.keys(item.detail ?? {}).length > 0;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`activity-item ${item.status === 'failed' ? 'activity-item--failed' : ''}`}
                >
                  <div className="activity-item-icon" style={{ color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div className="activity-item-body">
                    <div className="activity-item-header">
                      <span className="activity-item-label" style={{ color: meta.color }}>{meta.label}</span>
                      <span className="activity-item-time">
                        {new Date(item.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                      {item.status === 'failed'
                        ? <XCircle size={12} color="#f87171" />
                        : <CheckCircle size={12} color="#34d399" />
                      }
                    </div>
                    <p className="activity-item-summary">{item.summary}</p>
                    {hasDetail && (
                      <button
                        className="activity-expand-btn"
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Hide detail' : 'Show detail'}
                      </button>
                    )}
                    {isExpanded && (
                      <motion.pre
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="activity-detail"
                      >
                        {JSON.stringify(item.detail, null, 2)}
                      </motion.pre>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
