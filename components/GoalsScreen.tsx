'use client';
import { apiFetch } from '../lib/api';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Plus, CheckCircle, Circle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

type Goal = {
  id: string;
  title: string;
  description?: string;
  type: string;
  category?: string;
  status: string;
  target_date?: string;
  progress: number;
  milestones: Array<{ label: string; done: boolean }>;
  why?: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: 'rgba(52,211,153,0.15)',
  in_progress: 'rgba(99,102,241,0.15)',
  achieved: 'rgba(251,191,36,0.15)',
  abandoned: 'rgba(255,255,255,0.05)',
  draft: 'rgba(255,255,255,0.05)',
};

const STATUS_TEXT: Record<string, string> = {
  active: '#34d399',
  in_progress: '#818cf8',
  achieved: '#fbbf24',
  abandoned: 'rgba(255,255,255,0.3)',
  draft: 'rgba(255,255,255,0.3)',
};


export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('active');

  const [form, setForm] = useState({ title: '', description: '', why: '', category: '', target_date: '', type: 'smart' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const url = filter === 'all' ? `/goals` : `/goals?status=${filter}`;
      const r = await apiFetch(url);
      const data = await r.json();
      setGoals(Array.isArray(data) ? data : []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const createGoal = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ title: '', description: '', why: '', category: '', target_date: '', type: 'smart' });
      await load();
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  };

  const updateProgress = async (id: string, delta: number, note: string) => {
    await apiFetch(`/goals/${id}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, progress_delta: delta }),
    });
    await load();
  };

  const archiveGoal = async (id: string, status: 'achieved' | 'abandoned') => {
    await apiFetch(`/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  };

  const FILTERS = ['active', 'in_progress', 'achieved', 'all'];

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Sub-toolbar */}
      <div style={{
        padding: '12px 28px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <div className="library-tabs" style={{ margin: 0 }}>
          {FILTERS.map(f => (
            <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} aria-label="Add goal">
          <Plus size={14} /> New Goal
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
        {/* Create form */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                overflow: 'hidden',
                marginBottom: 24,
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🎯 New Goal</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <GoalInput placeholder="Goal title *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
                <GoalInput placeholder="Why does this matter to you?" value={form.why} onChange={v => setForm(f => ({ ...f, why: v }))} />
                <GoalInput placeholder="Description (optional)" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} multiline />
                <div style={{ display: 'flex', gap: 10 }}>
                  <GoalInput placeholder="Category (e.g. Health)" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} />
                  <input
                    type="date"
                    value={form.target_date}
                    onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '8px 12px', color: 'var(--color-text)',
                      fontFamily: 'var(--font-sans)', fontSize: 14,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={createGoal} disabled={saving || !form.title.trim()}>
                    {saving ? 'Creating...' : 'Create Goal'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Goal list */}
        {loading ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading goals...</p>
        ) : goals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
            <p style={{ fontSize: 15 }}>No {filter === 'all' ? '' : filter} goals yet. Create your first goal or tell Raven what you're working toward in chat.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {goals.map((goal, i) => (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  background: STATUS_COLORS[goal.status] ?? 'var(--color-surface)',
                  border: `1px solid ${STATUS_TEXT[goal.status] ?? 'var(--color-border)'}30`,
                  borderRadius: 16,
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div
                  style={{ padding: '18px 20px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }}
                  onClick={() => setExpanded(expanded === goal.id ? null : goal.id)}
                >
                  <div style={{ paddingTop: 3 }}>
                    {goal.status === 'achieved'
                      ? <CheckCircle size={20} style={{ color: '#fbbf24' }} />
                      : <Circle size={20} style={{ color: STATUS_TEXT[goal.status] }} />
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{goal.title}</div>
                    {goal.category && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px',
                        background: 'rgba(255,255,255,0.07)',
                        borderRadius: 100, color: 'var(--color-text-muted)',
                      }}>{goal.category}</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ width: 80, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${goal.progress}%`,
                        background: `linear-gradient(90deg, ${STATUS_TEXT[goal.status]}, var(--color-lavender))`,
                        borderRadius: 3,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 28 }}>
                      {goal.progress}%
                    </span>
                    {expanded === goal.id ? <ChevronUp size={16} color="var(--color-text-subtle)" /> : <ChevronDown size={16} color="var(--color-text-subtle)" />}
                  </div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {expanded === goal.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div style={{ padding: '16px 20px 20px 54px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {goal.why && (
                          <p style={{ fontSize: 13, color: 'var(--color-lavender)', fontStyle: 'italic' }}>
                            "{goal.why}"
                          </p>
                        )}
                        {goal.description && (
                          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{goal.description}</p>
                        )}
                        {goal.target_date && (
                          <p style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>
                            🗓 Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}

                        {/* Quick actions */}
                        {goal.status !== 'achieved' && goal.status !== 'abandoned' && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 12 }}
                              onClick={() => updateProgress(goal.id, 10, 'Progress update +10%')}
                            >
                              +10% progress
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 12 }}
                              onClick={() => updateProgress(goal.id, 25, 'Major milestone reached +25%')}
                            >
                              +25% milestone
                            </button>
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: 12 }}
                              onClick={() => archiveGoal(goal.id, 'achieved')}
                            >
                              ✅ Mark Achieved
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 12, color: 'var(--color-rose)' }}
                              onClick={() => archiveGoal(goal.id, 'abandoned')}
                            >
                              <Trash2 size={12} /> Archive
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalInput({ placeholder, value, onChange, multiline }: {
  placeholder: string; value: string;
  onChange: (v: string) => void; multiline?: boolean;
}) {
  const style: React.CSSProperties = {
    flex: 1, width: '100%',
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
    borderRadius: 8, padding: '8px 12px', color: 'var(--color-text)',
    fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
    resize: 'none',
  };
  return multiline
    ? <textarea placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={{ ...style, minHeight: 72 }} />
    : <input placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={style} />;
}
