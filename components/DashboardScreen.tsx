'use client';
import { apiFetch } from '../lib/api';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Target, BookOpen, Radio, Zap, MessageSquare,
  TrendingUp, Clock, AlertCircle, ChevronRight, RefreshCw,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────── */
type Goal     = { id: string; title: string; status: string; progress: number; category?: string };
type Thought  = { id: string; content: string; type: string; priority: number };
type Research = { id: string; topic: string; status: string; created_at: string };
type Activity = { id: string; type: string; description: string; created_at: string };
type LibStats = { total: number; byType: Record<string, number> };
type EvoSummary = { total_pending: number; critical: number };
type Health   = { status: string; uptime: number };

/* ─── Helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

/* ─── Section components ─────────────────────────────────────── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
      padding: '20px 22px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, color, title, count }: {
  icon: typeof Brain; color: string; title: string; count?: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <Icon size={15} style={{ color }} />
      <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </span>
      {count !== undefined && (
        <span style={{
          marginLeft: 4, fontSize: 11, fontWeight: 700,
          background: `${color}22`, color, borderRadius: 100,
          padding: '1px 7px',
        }}>{count}</span>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
type DashboardProps = { onNavigate: (screen: string) => void };

export default function DashboardScreen({ onNavigate }: DashboardProps) {
  const [health,    setHealth]    = useState<Health | null>(null);
  const [goals,     setGoals]     = useState<Goal[]>([]);
  const [thoughts,  setThoughts]  = useState<Thought[]>([]);
  const [research,  setResearch]  = useState<Research[]>([]);
  const [activity,  setActivity]  = useState<Activity[]>([]);
  const [libStats,  setLibStats]  = useState<LibStats>({ total: 0, byType: {} });
  const [evoSummary,setEvoSummary]= useState<EvoSummary>({ total_pending: 0, critical: 0 });
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthR, goalsR, thoughtsR, researchR, activityR, libR, evoR] = await Promise.allSettled([
        apiFetch('/health').then(r => r.json()),
        apiFetch('/goals?status=active&limit=5').then(r => r.json()),
        apiFetch('/mind?type=question_for_ash&addressed=false&limit=4').then(r => r.json()),
        apiFetch('/research/queue?status=pending&limit=5').then(r => r.json()),
        apiFetch('/activity?limit=6').then(r => r.json()),
        apiFetch('/library?limit=200').then(r => r.json()),
        apiFetch('/evolution/summary').then(r => r.json()),
      ]);

      if (healthR.status   === 'fulfilled') setHealth(healthR.value);
      if (goalsR.status    === 'fulfilled') setGoals(Array.isArray(goalsR.value) ? goalsR.value : []);
      if (thoughtsR.status === 'fulfilled') {
        const raw = thoughtsR.value;
        setThoughts(Array.isArray(raw) ? raw : (raw?.items ?? []));
      }
      if (researchR.status === 'fulfilled') setResearch(Array.isArray(researchR.value) ? researchR.value : []);
      if (activityR.status === 'fulfilled') setActivity(Array.isArray(activityR.value) ? activityR.value : []);
      if (libR.status      === 'fulfilled' && Array.isArray(libR.value)) {
        const data = libR.value as Array<{ type: string }>;
        const byType: Record<string, number> = {};
        data.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
        setLibStats({ total: data.length, byType });
      }
      if (evoR.status === 'fulfilled') setEvoSummary(evoR.value ?? { total_pending: 0, critical: 0 });
    } catch { /* non-critical */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uptimeMin = health ? Math.floor(health.uptime / 60) : null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      {/* ── Status banner ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          background: 'rgba(52,211,153,0.05)',
          border: '1px solid rgba(52,211,153,0.12)',
          borderRadius: 14, marginBottom: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="status-dot" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Raven is online</span>
          {uptimeMin !== null && (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              · up {uptimeMin < 60 ? `${uptimeMin}m` : `${Math.round(uptimeMin / 60)}h`}
            </span>
          )}
        </div>
        <button
          onClick={load}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </motion.div>

      {/* ── Alert: evolution critical items ────────────────────── */}
      <AnimatePresence>
        {evoSummary.critical > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 18px', marginBottom: 20,
              background: 'rgba(251,113,133,0.08)',
              border: '1px solid rgba(251,113,133,0.25)',
              borderRadius: 12, cursor: 'pointer',
            }}
            onClick={() => onNavigate('evolution')}
          >
            <AlertCircle size={16} style={{ color: '#fb7185', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#fda4af' }}>
              {evoSummary.critical} critical issue{evoSummary.critical > 1 ? 's' : ''} in the evolution queue
            </span>
            <ChevronRight size={14} style={{ marginLeft: 'auto', color: '#fb7185' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main grid ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* On Raven's mind */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <SectionHeader icon={Brain} color="var(--color-lavender)" title="On Raven's mind" count={thoughts.length} />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : thoughts.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Raven has no pending thoughts right now.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {thoughts.map(t => (
                  <div key={t.id} style={{
                    fontSize: 13, lineHeight: 1.55,
                    padding: '10px 14px',
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.12)',
                    borderRadius: 10,
                    color: 'var(--color-text)',
                  }}>
                    💭 {t.content}
                  </div>
                ))}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, alignSelf: 'flex-end', marginTop: 4 }}
                  onClick={() => onNavigate('mind')}
                >
                  See all <ChevronRight size={12} />
                </button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Active goals */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <SectionHeader icon={Target} color="var(--color-emerald)" title="Active Goals" count={goals.length} />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : goals.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No active goals yet. Tell Raven what you're working toward in chat.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {goals.map(g => (
                  <div key={g.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{g.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{g.progress}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${g.progress}%`,
                        background: 'linear-gradient(90deg, var(--color-emerald), var(--color-lavender))',
                        borderRadius: 2,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, alignSelf: 'flex-end', marginTop: 4 }}
                  onClick={() => onNavigate('goals')}
                >
                  Manage goals <ChevronRight size={12} />
                </button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Research queue */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <SectionHeader icon={BookOpen} color="var(--color-indigo)" title="Raven is Researching" count={research.length} />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : research.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Research queue is clear. Mention something in chat and Raven will pick it up.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {research.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>⏳</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>{r.topic}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{timeAgo(r.created_at)}</div>
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, alignSelf: 'flex-end', marginTop: 4 }}
                  onClick={() => onNavigate('library')}
                >
                  Full queue <ChevronRight size={12} />
                </button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Recent activity */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <SectionHeader icon={Radio} color="var(--color-gold)" title="Recent Activity" />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : activity.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No activity yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activity.slice(0, 5).map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Clock size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{timeAgo(a.created_at)}</div>
                      <div style={{ fontSize: 13 }}>{a.description}</div>
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, alignSelf: 'flex-end', marginTop: 4 }}
                  onClick={() => onNavigate('activity')}
                >
                  Full log <ChevronRight size={12} />
                </button>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* ── Knowledge base stat strip ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}
      >
        {[
          { label: 'Things Raven knows', value: libStats.total,                          icon: Brain,        color: 'var(--color-lavender)' },
          { label: 'Facts about Ash',    value: libStats.byType['user_fact'] ?? 0,       icon: TrendingUp,   color: 'var(--color-gold)'     },
          { label: 'Research entries',   value: libStats.byType['research'] ?? 0,        icon: BookOpen,     color: 'var(--color-indigo)'   },
          { label: 'Pending evolution',  value: evoSummary.total_pending,                icon: Zap,          color: 'var(--color-rose)'     },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.05 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-label">{s.label}</div>
              <s.icon size={16} style={{ color: s.color, opacity: 0.7 }} />
            </div>
            <div className="stat-value">{s.value}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Quick actions ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
      >
        <button className="btn btn-primary" onClick={() => onNavigate('chat')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageSquare size={14} /> Talk to Raven
        </button>
        <button className="btn btn-ghost" onClick={() => onNavigate('goals')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Target size={14} /> Review Goals
        </button>
        <button className="btn btn-ghost" onClick={() => onNavigate('library')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BookOpen size={14} /> Browse Research
        </button>
      </motion.div>
    </div>
  );
}
