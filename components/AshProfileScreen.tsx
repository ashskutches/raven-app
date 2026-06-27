'use client';

/**
 * AshProfileScreen — Raven's model of Ash
 *
 * Redesigned: no accordion rows. All sections open, card-based layout,
 * full-height scrollable, clean visual hierarchy.
 */

import { apiFetch } from '../lib/api';
import { useEffect, useState, useCallback } from 'react';
import {
  User, Target, Heart, Users, Lightbulb, Star,
  RefreshCw, Brain, ChevronRight, TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Fact {
  key:             string;
  value:           string;
  confidence?:     number;
  last_updated_at?: string;
}

interface LibraryEntry {
  id:          string;
  title:       string;
  type:        string;
  content:     string;
  summary?:    string;
  tags?:       string[];
  confidence?: number;
  updated_at:  string;
}

interface Goal {
  id:           string;
  title:        string;
  description?: string;
  status:       string;
  progress:     number;
  why?:         string;
  target_date?: string;
}

/* ── Section config ──────────────────────────────────────────────────────── */

const SECTION_CONFIG = {
  facts:        { icon: Brain,     label: 'Key Facts',          color: '#a78bfa', gradient: 'linear-gradient(135deg, #6366f1, #7c3aed)' },
  goals:        { icon: Target,    label: 'Active Goals',       color: '#60a5fa', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  user_fact:    { icon: Heart,     label: 'About Ash',          color: '#f472b6', gradient: 'linear-gradient(135deg, #ec4899, #db2777)' },
  insight:      { icon: Lightbulb, label: "Raven's Insights",   color: '#fbbf24', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  family:       { icon: Users,     label: 'People & Family',    color: '#34d399', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
  goal_context: { icon: Star,      label: 'Goal Context',       color: '#fb923c', gradient: 'linear-gradient(135deg, #f97316, #ea580c)' },
} as const;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function SectionHeader({ sectionKey, count }: { sectionKey: keyof typeof SECTION_CONFIG; count: number }) {
  const cfg = SECTION_CONFIG[sectionKey];
  const Icon = cfg.icon;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: cfg.gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} color="#fff" />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
        {cfg.label}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
        background: `${cfg.color}20`, color: cfg.color, marginLeft: 2,
      }}>
        {count}
      </span>
    </div>
  );
}

function FactCard({ fact }: { fact: Fact }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        color: '#a78bfa', textTransform: 'uppercase', marginBottom: 6,
      }}>
        {fact.key.replace(/_/g, ' ')}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--color-text)', lineHeight: 1.55, fontWeight: 500 }}>
        {fact.value}
      </div>
      {fact.last_updated_at && (
        <div style={{ fontSize: 10.5, color: 'var(--color-text-subtle)', marginTop: 8 }}>
          Updated {new Date(fact.last_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, index }: { goal: Goal; index: number }) {
  const pct = Math.min(100, Math.max(0, goal.progress));
  const color = pct >= 75 ? '#34d399' : pct >= 40 ? '#60a5fa' : '#a78bfa';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: '18px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.4 }}>
            {goal.title}
          </div>
          {goal.description && (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.55 }}>
              {goal.description}
            </div>
          )}
        </div>
        <div style={{
          fontSize: 20, fontWeight: 800, color,
          flexShrink: 0, lineHeight: 1,
        }}>
          {pct}%
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 5, borderRadius: 100,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: index * 0.05 + 0.2, ease: 'easeOut' }}
          style={{ height: '100%', background: color, borderRadius: 100 }}
        />
      </div>

      {goal.why && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(96,165,250,0.07)',
          borderLeft: '3px solid rgba(96,165,250,0.4)',
          borderRadius: '0 8px 8px 0',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', marginBottom: 3, letterSpacing: '0.04em' }}>WHY</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{goal.why}</div>
        </div>
      )}

      {goal.target_date && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10 }}>
          <TrendingUp size={11} color="var(--color-text-subtle)" />
          <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
            Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function EntryCard({ entry, index, accentColor }: { entry: LibraryEntry; index: number; accentColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (entry.summary || entry.content).length > 200;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6, lineHeight: 1.4 }}>
        {entry.title}
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        {isLong && !expanded
          ? (entry.summary || entry.content).slice(0, 200) + '…'
          : (entry.summary || entry.content)}
      </div>

      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginTop: 8, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 11.5, color: accentColor,
            fontFamily: 'var(--font-sans)', padding: 0,
          }}
        >
          {expanded ? 'Show less' : 'Read more'}
          <ChevronRight size={11} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </button>
      )}

      {entry.tags && entry.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
          {entry.tags.slice(0, 5).map(t => (
            <span key={t} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
              background: `${accentColor}15`, color: accentColor,
            }}>
              {t}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--color-text-subtle)', marginTop: 10 }}>
        {new Date(entry.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        {entry.confidence != null && ` · ${Math.round(entry.confidence * 100)}% confidence`}
      </div>
    </motion.div>
  );
}

/* ── Main Screen ─────────────────────────────────────────────────────────── */

export default function AshProfileScreen() {
  const [facts, setFacts]                   = useState<Fact[]>([]);
  const [goals, setGoals]                   = useState<Goal[]>([]);
  const [libraryByType, setLibraryByType]   = useState<Record<string, LibraryEntry[]>>({});
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [factsRes, goalsRes, libraryRes] = await Promise.all([
        apiFetch(`/library/facts`),
        apiFetch(`/goals?status=active,in_progress`),
        apiFetch(`/library?types=user_fact,insight,family,goal_context&limit=100`),
      ]);
      if (factsRes.ok) setFacts(await factsRes.json() as Fact[]);
      if (goalsRes.ok) setGoals(await goalsRes.json() as Goal[]);
      if (libraryRes.ok) {
        const entries = await libraryRes.json() as LibraryEntry[];
        const byType: Record<string, LibraryEntry[]> = {};
        for (const e of entries) {
          if (!byType[e.type]) byType[e.type] = [];
          byType[e.type].push(e);
        }
        setLibraryByType(byType);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: 'var(--color-text-subtle)',
      }}>
        <Brain size={32} style={{ opacity: 0.3 }} />
        <p style={{ fontSize: 13 }}>Loading Ash&apos;s profile...</p>
      </div>
    );
  }

  const totalEntries = Object.values(libraryByType).flat().length;
  const hasAnything = facts.length > 0 || goals.length > 0 || totalEntries > 0;

  if (!hasAnything) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: 'var(--color-text-subtle)',
      }}>
        <User size={36} style={{ opacity: 0.25 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>No profile yet</p>
        <p style={{ fontSize: 12, textAlign: 'center', maxWidth: 240 }}>
          Chat with Raven — she&apos;ll build a model of you over time.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Topbar ── */}
      <div style={{
        padding: '18px 28px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>
            🧠
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.2 }}>About Ash</h1>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginTop: 1 }}>
              {facts.length} facts · {goals.length} goals · {totalEntries} entries
            </p>
          </div>
        </div>
        <button
          id="profile-refresh"
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 9px', cursor: 'pointer',
            color: 'var(--color-text-subtle)', opacity: refreshing ? 0.4 : 1,
          }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, padding: '20px 28px 40px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── Key Facts ── */}
        {facts.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <SectionHeader sectionKey="facts" count={facts.length} />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10,
            }}>
              {facts.map(f => <FactCard key={f.key} fact={f} />)}
            </div>
          </motion.section>
        )}

        {/* ── Active Goals ── */}
        {goals.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <SectionHeader sectionKey="goals" count={goals.length} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {goals.map((g, i) => <GoalCard key={g.id} goal={g} index={i} />)}
            </div>
          </motion.section>
        )}

        {/* ── Library sections ── */}
        {(['user_fact', 'insight', 'family', 'goal_context'] as const).map((type, sectionIdx) => {
          const entries = libraryByType[type];
          if (!entries?.length) return null;
          const cfg = SECTION_CONFIG[type];
          return (
            <motion.section
              key={type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + sectionIdx * 0.05 }}
            >
              <SectionHeader sectionKey={type} count={entries.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <AnimatePresence>
                  {entries.map((e, i) => (
                    <EntryCard key={e.id} entry={e} index={i} accentColor={cfg.color} />
                  ))}
                </AnimatePresence>
              </div>
            </motion.section>
          );
        })}

      </div>
    </div>
  );
}
