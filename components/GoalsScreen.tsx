'use client';

/**
 * GoalsScreen — Goals & Todos with Goal-Color Theming
 *
 * Layout:
 *   Left panel  → Quick-add todo input (with goal picker) + draggable todo board
 *   Right panel → Goals list (expandable, add new goals)
 *
 * Key feature: each Goal gets an assigned color from GOAL_PALETTE.
 * Todos linked to that goal inherit a tinted background + left border accent,
 * making it immediately clear which tasks belong to which goal.
 *
 * Raven can create goal-attached todos via manage_todo tool; they appear live.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Target, CheckCircle, Circle, ChevronDown, ChevronUp,
  GripVertical, Trash2, RotateCcw, X, CheckSquare, Sparkles, Pencil, Check, Star,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/* ── Types ─────────────────────────────────────────────────── */

interface Todo {
  id: string;
  title: string;
  notes: string | null;
  status: 'active' | 'done' | 'archived';
  priority: number;
  starred: boolean;
  recurrence: 'daily' | null;
  position: number;
  goal_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  category: string | null;
  why: string | null;
  target_date: string | null;
}

/* ── Goal Color Palette ─────────────────────────────────────── */
// Each goal gets a color slot deterministically (by insertion order index).
// Colors chosen for dark-mode glassmorphism: vivid but not harsh.

const GOAL_PALETTE = [
  { bg: 'rgba(99,102,241,0.12)',   border: 'rgba(99,102,241,0.5)',  text: '#818cf8', dot: '#6366f1' },  // indigo
  { bg: 'rgba(236,72,153,0.10)',   border: 'rgba(236,72,153,0.5)',  text: '#f472b6', dot: '#ec4899' },  // pink
  { bg: 'rgba(20,184,166,0.10)',   border: 'rgba(20,184,166,0.5)',  text: '#2dd4bf', dot: '#14b8a6' },  // teal
  { bg: 'rgba(245,158,11,0.10)',   border: 'rgba(245,158,11,0.5)',  text: '#fbbf24', dot: '#f59e0b' },  // amber
  { bg: 'rgba(239,68,68,0.09)',    border: 'rgba(239,68,68,0.45)',  text: '#f87171', dot: '#ef4444' },  // red
  { bg: 'rgba(34,197,94,0.09)',    border: 'rgba(34,197,94,0.45)',  text: '#4ade80', dot: '#22c55e' },  // green
  { bg: 'rgba(168,85,247,0.10)',   border: 'rgba(168,85,247,0.5)',  text: '#c084fc', dot: '#a855f7' },  // purple
  { bg: 'rgba(59,130,246,0.10)',   border: 'rgba(59,130,246,0.5)',  text: '#60a5fa', dot: '#3b82f6' },  // blue
  { bg: 'rgba(251,146,60,0.10)',   border: 'rgba(251,146,60,0.5)',  text: '#fb923c', dot: '#f97316' },  // orange
  { bg: 'rgba(6,182,212,0.09)',    border: 'rgba(6,182,212,0.45)',  text: '#22d3ee', dot: '#06b6d4' },  // cyan
];

function getGoalColor(index: number) {
  return GOAL_PALETTE[index % GOAL_PALETTE.length];
}

/* ── Priority colors ────────────────────────────────────────── */

const PRIORITY_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  5: { bg: 'rgba(251,113,133,0.15)', text: '#fb7185', label: 'Urgent' },
  4: { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24', label: 'High'   },
  3: { bg: 'rgba(167,139,250,0.15)', text: '#a78bfa', label: 'Normal' },
  2: { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', label: 'Low'    },
  1: { bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.38)', label: 'Someday' },
};

const STATUS_BG: Record<string, string> = {
  active:      'rgba(255,255,255,0.04)',
  in_progress: 'rgba(99,102,241,0.06)',
  achieved:    'rgba(52,211,153,0.06)',
  abandoned:   'rgba(255,255,255,0.02)',
  draft:       'rgba(255,255,255,0.02)',
};

/* ── Main Component ─────────────────────────────────────────── */

export default function GoalsScreen() {
  const [todos, setTodos]               = useState<Todo[]>([]);
  const [goals, setGoals]               = useState<Goal[]>([]);
  const [loading, setLoading]           = useState(true);

  // Todo quick-add state
  const [newTitle, setNewTitle]           = useState('');
  const [newGoalId, setNewGoalId]         = useState<string>('');
  const [newIsDaily, setNewIsDaily]       = useState(false);
  const [addingTodo, setAddingTodo]       = useState(false);

  // Goal panel state
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [showDone, setShowDone]         = useState(false);
  const [goalTitle, setGoalTitle]       = useState('');
  const [goalWhy, setGoalWhy]           = useState('');
  const [goalDesc, setGoalDesc]         = useState('');
  const [goalCategory, setGoalCategory] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('');
  const [showGoalDetails, setShowGoalDetails] = useState(false);
  const [addingGoal, setAddingGoal]     = useState(false);
  const [deletingGoal, setDeletingGoal] = useState<string | null>(null);
  const goalInputRef = useRef<HTMLInputElement>(null);

  // drag state
  const dragId   = useRef<string | null>(null);
  const dragOver = useRef<string | null>(null);

  /* ── Goal color map (stable order → stable colors) ── */
  const goalColorMap = useRef<Map<string, number>>(new Map());
  const getGoalColorFor = (goalId: string): (typeof GOAL_PALETTE)[0] => {
    if (!goalColorMap.current.has(goalId)) {
      goalColorMap.current.set(goalId, goalColorMap.current.size);
    }
    return getGoalColor(goalColorMap.current.get(goalId)!);
  };

  /* ── Fetch ── */
  const fetchAll = useCallback(async () => {
    try {
      const [todosRes, goalsRes] = await Promise.all([
        apiFetch('/todos'),
        apiFetch('/goals?status=active'),
      ]);
      if (todosRes.ok) setTodos(await todosRes.json() as Todo[]);
      if (goalsRes.ok) setGoals(await goalsRes.json() as Goal[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 15_000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // Seed color map when goals load
  useEffect(() => {
    goals.forEach((g, i) => {
      if (!goalColorMap.current.has(g.id)) {
        goalColorMap.current.set(g.id, i);
      }
    });
  }, [goals]);

  /* ── Add goal ── */
  const addGoal = async () => {
    const title = goalTitle.trim();
    if (!title) return;
    setAddingGoal(true);
    try {
      const res = await apiFetch('/goals', {
        method: 'POST',
        body: JSON.stringify({
          title,
          why: goalWhy.trim() || undefined,
          description: goalDesc.trim() || undefined,
          category: goalCategory.trim() || undefined,
          target_date: goalTargetDate || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json() as { id: string };

      const newGoal: Goal = {
        id: created.id,
        title,
        description: goalDesc.trim() || null,
        status: 'active',
        progress: 0,
        category: goalCategory.trim() || null,
        why: goalWhy.trim() || null,
        target_date: goalTargetDate || null,
      };
      setGoals(prev => {
        const updated = [newGoal, ...prev];
        // Assign color index immediately
        updated.forEach((g, i) => {
          if (!goalColorMap.current.has(g.id)) goalColorMap.current.set(g.id, i);
        });
        return updated;
      });
      setGoalTitle(''); setGoalWhy(''); setGoalDesc('');
      setGoalCategory(''); setGoalTargetDate(''); setShowGoalDetails(false);
    } catch (err) {
      console.error('Failed to create goal:', err);
    } finally { setAddingGoal(false); }
  };

  /* ── Delete goal ── */
  const deleteGoal = async (id: string) => {
    setDeletingGoal(id);
    try {
      await apiFetch(`/goals/${id}`, { method: 'DELETE' });
      setGoals(prev => prev.filter(g => g.id !== id));
      if (expandedGoal === id) setExpandedGoal(null);
    } finally { setDeletingGoal(null); }
  };

  /* ── Toggle goal achieved ── */
  const toggleGoalAchieved = async (goal: Goal) => {
    const newStatus = goal.status === 'achieved' ? 'active' : 'achieved';
    const newProgress = newStatus === 'achieved' ? 100 : goal.progress;
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, status: newStatus, progress: newProgress } : g));
    await apiFetch(`/goals/${goal.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus, progress: newProgress }),
    }).catch(() => {});
  };

  /* ── Update goal progress ── */
  const updateGoalProgress = async (goalId: string, progress: number) => {
    const clamped = Math.max(0, Math.min(100, progress));
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, progress: clamped } : g));
    await apiFetch(`/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify({ progress: clamped }) }).catch(() => {});
  };

  /* ── Add todo ── */
  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAddingTodo(true);
    try {
      const res = await apiFetch('/todos', {
        method: 'POST',
        body: JSON.stringify({
          title,
          goal_id: newGoalId || null,
          recurrence: newIsDaily ? 'daily' : null,
        }),
      });
      if (res.ok) {
        const created = await res.json() as Todo;
        setTodos(prev => [...prev, created]);
      }
      setNewTitle('');
      if (!newIsDaily) setNewGoalId(''); // daily todos don't belong to goals
    } finally { setAddingTodo(false); }
  };

  const handleInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTodo(); }
    if (e.key === 'Escape') { setNewTitle(''); }
  };

  /* ── Toggle starred ── */
  const toggleStar = async (todo: Todo) => {
    const newStarred = !todo.starred;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, starred: newStarred } : t));
    await apiFetch(`/todos/${todo.id}`, { method: 'PATCH', body: JSON.stringify({ starred: newStarred }) }).catch(() => {});
  };

  /* ── Toggle done ── */
  const toggleTodo = async (todo: Todo) => {
    const newStatus = todo.status === 'done' ? 'active' : 'done';
    setTodos(prev => prev.map(t =>
      t.id === todo.id ? { ...t, status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null } : t
    ));
    await apiFetch(`/todos/${todo.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
  };

  /* ── Delete todo ── */
  const deleteTodo = async (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    await apiFetch(`/todos/${id}`, { method: 'DELETE' });
  };

  /* ── Drag-and-drop reorder ── */
  const onDragStart = (id: string) => { dragId.current = id; };
  const onDragEnter = (id: string) => { dragOver.current = id; };

  const onDragEnd = async () => {
    const from = dragId.current;
    const to   = dragOver.current;
    dragId.current = null;
    dragOver.current = null;
    if (!from || !to || from === to) return;

    const active = todos.filter(t => t.status === 'active');
    const fromIdx = active.findIndex(t => t.id === from);
    const toIdx   = active.findIndex(t => t.id === to);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...active];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const withPositions = reordered.map((t, i) => ({ ...t, position: i + 1 }));
    const done = todos.filter(t => t.status !== 'active');
    setTodos([...withPositions, ...done]);

    await apiFetch('/todos/reorder', {
      method: 'POST',
      body: JSON.stringify({ order: withPositions.map(t => ({ id: t.id, position: t.position })) }),
    });
  };

  /* ── Derived ── */
  // Three visually distinct categories:
  //   1. Daily (green) — recurrence='daily', active ones only
  //   2. Starred — one-off, starred
  //   3. Regular — everything else active
  const activeTodos   = todos.filter(t => t.status === 'active');
  const dailyTodos    = activeTodos
    .filter(t => t.recurrence === 'daily')
    .sort((a, b) => a.position - b.position);
  const starredTodos  = activeTodos
    .filter(t => t.recurrence !== 'daily' && t.starred)
    .sort((a, b) => a.position - b.position);
  const regularTodos  = activeTodos
    .filter(t => t.recurrence !== 'daily' && !t.starred)
    .sort((a, b) => a.position - b.position);
  const allActive     = [...dailyTodos, ...starredTodos, ...regularTodos];

  const doneTodos = todos
    .filter(t => t.status === 'done')
    .sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime());

  const activeGoals = goals.filter(g => ['active', 'in_progress'].includes(g.status));

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'float 2s ease-in-out infinite' }}>🎯</div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 0 }}>

      {/* ── Todo board (main panel) ─────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--color-border)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckSquare size={18} color="var(--color-lavender)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' }}>Todos</h2>
            {allActive.length > 0 && (
              <span style={{ background: 'rgba(167,139,250,0.18)', color: 'var(--color-lavender)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, marginLeft: 4 }}>
                {allActive.length}
              </span>
            )}
            {dailyTodos.length > 0 && (
              <span style={{ background: 'rgba(16,185,129,0.18)', color: '#10b981', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100 }}>
                ↺ {dailyTodos.length} daily
              </span>
            )}
          </div>

          {/* Goal legend — only show when not in daily mode */}
          {activeGoals.length > 0 && !newIsDaily && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {activeGoals.map(g => {
                const c = getGoalColorFor(g.id);
                const linked = activeTodos.filter(t => t.goal_id === g.id).length;
                return (
                  <button
                    key={g.id}
                    onClick={() => setNewGoalId(newGoalId === g.id ? '' : g.id)}
                    title={`Filter/attach to: ${g.title}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: newGoalId === g.id ? c.bg : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${newGoalId === g.id ? c.border : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 20, padding: '3px 10px 3px 7px', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                    <span style={{ color: newGoalId === g.id ? c.text : 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.title}
                    </span>
                    {linked > 0 && (
                      <span style={{ color: newGoalId === g.id ? c.text : 'rgba(255,255,255,0.28)', fontSize: 10, marginLeft: 2 }}>{linked}</span>
                    )}
                  </button>
                );
              })}
              {newGoalId && (
                <button onClick={() => setNewGoalId('')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '3px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                  clear ×
                </button>
              )}
            </div>
          )}

          {/* Quick-add input */}
          <QuickAdd
            value={newTitle}
            onChange={setNewTitle}
            onSubmit={addTodo}
            onKeyDown={handleInputKey}
            loading={addingTodo}
            isDaily={newIsDaily}
            onDailyToggle={() => setNewIsDaily(d => !d)}
            selectedGoalId={newGoalId}
            goals={activeGoals}
            goalColorFor={getGoalColorFor}
          />
        </div>

        {/* Todo list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 24px' }}>
          {allActive.length === 0 && doneTodos.length === 0 ? (
            <EmptyTodos />
          ) : (
            <>
              {/* ─── Daily section (green) ─── */}
              {dailyTodos.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.8px' }}>↺ Daily</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(16,185,129,0.2)' }} />
                    <span style={{ fontSize: 10, color: 'rgba(16,185,129,0.5)' }}>resets 9am</span>
                  </div>
                  <AnimatePresence>
                    {dailyTodos.map(todo => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        goals={goals}
                        goalColorFor={getGoalColorFor}
                        onToggle={toggleTodo}
                        onStar={toggleStar}
                        onDelete={deleteTodo}
                        onDragStart={onDragStart}
                        onDragEnter={onDragEnter}
                        onDragEnd={onDragEnd}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* ─── Starred + Regular ─── */}
              {(starredTodos.length > 0 || regularTodos.length > 0) && (
                <div>
                  {dailyTodos.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Todos</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                    </div>
                  )}
                  <AnimatePresence>
                    {[...starredTodos, ...regularTodos].map(todo => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        goals={goals}
                        goalColorFor={getGoalColorFor}
                        onToggle={toggleTodo}
                        onStar={toggleStar}
                        onDelete={deleteTodo}
                        onDragStart={onDragStart}
                        onDragEnter={onDragEnter}
                        onDragEnd={onDragEnd}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {doneTodos.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <button
                    onClick={() => setShowDone(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, padding: '4px 0', marginBottom: 10, fontFamily: 'var(--font-sans)', letterSpacing: '0.5px', textTransform: 'uppercase' }}
                  >
                    {showDone ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    Completed ({doneTodos.length})
                  </button>
                  <AnimatePresence>
                    {showDone && doneTodos.map(todo => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        goals={goals}
                        goalColorFor={getGoalColorFor}
                        onToggle={toggleTodo}
                        onStar={toggleStar}
                        onDelete={deleteTodo}
                        done
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Goals panel (right column) ──────────────────────── */}
      <div style={{ width: 308, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Target size={16} color="var(--color-gold)" />
            <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.2px' }}>Active Goals</h2>
            {activeGoals.length > 0 && (
              <span style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--color-gold)', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 100, marginLeft: 'auto' }}>
                {activeGoals.length}
              </span>
            )}
          </div>

          {/* New Goal quick-add */}
          <div style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid var(--color-border)', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
              <Sparkles size={14} color="var(--color-gold)" style={{ flexShrink: 0 }} />
              <input
                ref={goalInputRef}
                id="goal-quick-add"
                placeholder="New goal..."
                value={goalTitle}
                onChange={e => setGoalTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addGoal(); }
                  if (e.key === 'Escape') { setGoalTitle(''); setShowGoalDetails(false); }
                }}
                onFocus={() => setShowGoalDetails(true)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 13.5 }}
                aria-label="New goal title"
              />
              {goalTitle.trim() && (
                <button
                  id="goal-add-btn"
                  onClick={addGoal}
                  disabled={addingGoal}
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'white', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: addingGoal ? 0.5 : 1, flexShrink: 0 }}
                >
                  {addingGoal ? '...' : 'Add'}
                </button>
              )}
            </div>
            <AnimatePresence>
              {showGoalDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input id="goal-why" placeholder="Why does this matter to you?" value={goalWhy} onChange={e => setGoalWhy(e.target.value)}
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 10px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 12.5, outline: 'none', width: '100%', boxSizing: 'border-box' }} aria-label="Goal why" />
                    <textarea id="goal-description" placeholder="Description (optional)" value={goalDesc} onChange={e => setGoalDesc(e.target.value)} rows={2}
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 10px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 12.5, outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} aria-label="Goal description" />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input id="goal-category" placeholder="Category" value={goalCategory} onChange={e => setGoalCategory(e.target.value)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 10px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} aria-label="Goal category" />
                      <input id="goal-target-date" type="date" value={goalTargetDate} onChange={e => setGoalTargetDate(e.target.value)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 10px', color: goalTargetDate ? 'var(--color-text)' : 'var(--color-text-subtle)', fontFamily: 'var(--font-sans)', fontSize: 12, outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} aria-label="Goal target date" />
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button id="goal-cancel-btn"
                        onClick={() => { setGoalTitle(''); setGoalWhy(''); setGoalDesc(''); setGoalCategory(''); setGoalTargetDate(''); setShowGoalDetails(false); }}
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', fontSize: 12, cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button id="goal-save-btn" onClick={addGoal} disabled={!goalTitle.trim() || addingGoal}
                        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 6, padding: '5px 14px', color: 'white', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, cursor: !goalTitle.trim() || addingGoal ? 'not-allowed' : 'pointer', opacity: !goalTitle.trim() || addingGoal ? 0.5 : 1 }}>
                        {addingGoal ? 'Saving...' : 'Create Goal'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 24px' }}>
          {activeGoals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🎯</div>
              <p style={{ fontSize: 13 }}>No active goals. Tell Raven what you're working toward in chat.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeGoals.map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  color={getGoalColorFor(goal.id)}
                  expanded={expandedGoal === goal.id}
                  onToggle={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
                  todoCount={todos.filter(t => t.goal_id === goal.id && t.status === 'active').length}
                  onDelete={deleteGoal}
                  onAchieve={toggleGoalAchieved}
                  onProgressChange={updateGoalProgress}
                  deleting={deletingGoal === goal.id}
                  onAddTodo={() => setNewGoalId(newGoalId === goal.id ? '' : goal.id)}
                  isSelected={newGoalId === goal.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Quick-add input ────────────────────────────────────────── */

function QuickAdd({
  value, onChange, onSubmit, onKeyDown, loading,
  isDaily, onDailyToggle,
  selectedGoalId, goals, goalColorFor,
}: {
  value: string; onChange: (v: string) => void;
  onSubmit: () => void; onKeyDown: (e: React.KeyboardEvent) => void;
  loading: boolean;
  isDaily: boolean; onDailyToggle: () => void;
  selectedGoalId: string;
  goals: Goal[];
  goalColorFor: (id: string) => typeof GOAL_PALETTE[0];
}) {
  const selGoal   = !isDaily ? goals.find(g => g.id === selectedGoalId) : undefined;
  const goalColor = selGoal ? goalColorFor(selGoal.id) : null;

  const bg     = isDaily ? 'rgba(16,185,129,0.08)' : goalColor ? goalColor.bg : 'rgba(255,255,255,0.05)';
  const border = isDaily ? 'rgba(16,185,129,0.3)'  : goalColor ? goalColor.border : 'var(--color-border)';

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderLeft: isDaily ? '3px solid #10b981' : undefined,
      borderRadius: 12, padding: '10px 14px', marginBottom: 4,
      display: 'flex', alignItems: 'center', gap: 10,
      transition: 'all 0.2s',
    }}>
      {isDaily ? (
        <span style={{ fontSize: 13, color: '#10b981', flexShrink: 0 }}>↺</span>
      ) : goalColor && selGoal ? (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: goalColor.dot, flexShrink: 0 }} />
      ) : (
        <Plus size={15} color="var(--color-text-subtle)" />
      )}
      <input
        id="todo-quick-add"
        placeholder={isDaily ? 'Add a daily habit...' : selGoal ? `Add todo for "${selGoal.title}"...` : 'Add a todo... (Enter to save)'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 14 }}
        aria-label="New todo title"
      />

      {/* Daily toggle */}
      <button
        id="todo-daily-toggle"
        onClick={onDailyToggle}
        aria-label={isDaily ? 'Switch to regular todo' : 'Make this a daily todo'}
        title={isDaily ? 'Daily — click to switch to regular' : 'Make this repeat daily'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', borderRadius: 100, fontSize: 11, fontWeight: 700,
          border: `1px solid ${isDaily ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
          background: isDaily ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
          color: isDaily ? '#10b981' : 'var(--color-text-subtle)',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        }}
      >
        ↺ Daily
      </button>

      {value.trim() && (
        <button
          id="todo-add-btn"
          onClick={onSubmit}
          disabled={loading}
          style={{
            background: isDaily
              ? 'linear-gradient(135deg, #10b981, #059669)'
              : goalColor ? `linear-gradient(135deg, ${goalColor.dot}, ${goalColor.dot}cc)` : 'linear-gradient(135deg, #6366f1, #7c3aed)',
            border: 'none', borderRadius: 6, padding: '4px 10px', color: 'white',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '...' : 'Add'}
        </button>
      )}
    </div>
  );
}

/* ── Individual Todo Card ───────────────────────────────────── */

function TodoCard({
  todo, goals, goalColorFor, onToggle, onStar, onDelete, done = false,
  onDragStart, onDragEnter, onDragEnd,
}: {
  todo: Todo; goals: Goal[];
  goalColorFor: (id: string) => typeof GOAL_PALETTE[0];
  onToggle: (t: Todo) => void;
  onStar: (t: Todo) => void;
  onDelete: (id: string) => void;
  done?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnter?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const linkedGoal = goals.find(g => g.id === todo.goal_id);
  const goalColor  = linkedGoal ? goalColorFor(linkedGoal.id) : null;

  // ── Colour priority: daily > starred > goal > plain ──
  const isDaily   = todo.recurrence === 'daily' && !done;
  const isStarred = todo.starred && !done && !isDaily;

  const cardBg = done
    ? 'rgba(255,255,255,0.02)'
    : isDaily
      ? 'rgba(16,185,129,0.07)'
      : isStarred
        ? 'rgba(251,191,36,0.07)'
        : goalColor
          ? goalColor.bg
          : hovered ? 'rgba(255,255,255,0.065)' : 'rgba(255,255,255,0.04)';

  const leftBorderColor = done
    ? 'transparent'
    : isDaily
      ? '#10b981'
      : isStarred
        ? '#f59e0b'
        : goalColor
          ? goalColor.dot
          : 'transparent';

  const cardBorderColor = done
    ? 'var(--color-border)'
    : isDaily
      ? 'rgba(16,185,129,0.3)'
      : isStarred
        ? 'rgba(251,191,36,0.35)'
        : goalColor
          ? (hovered ? goalColor.border : goalColor.border.replace('0.5', '0.2'))
          : hovered ? 'rgba(255,255,255,0.14)' : 'var(--color-border)';

  const hasAccentBorder = isDaily || isStarred || (!!goalColor && !done);

  // Title colour: green for daily
  const titleColor = done
    ? 'var(--color-text-subtle)'
    : isDaily
      ? '#a7f3d0'
      : 'var(--color-text)';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: done ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
      transition={{ duration: 0.2 }}
      draggable={!done}
      onDragStart={() => onDragStart?.(todo.id)}
      onDragEnter={() => onDragEnter?.(todo.id)}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: `10px 10px 10px ${hasAccentBorder ? '10px' : '12px'}`,
        marginBottom: 5, borderRadius: 10, cursor: done ? 'default' : 'grab',
        background: cardBg,
        border: `1px solid ${cardBorderColor}`,
        borderLeft: hasAccentBorder ? `3px solid ${leftBorderColor}` : `1px solid ${cardBorderColor}`,
        transition: 'background 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      {!done && (
        <div style={{ opacity: hovered ? 0.4 : 0.1, transition: 'opacity 0.12s', flexShrink: 0 }}>
          <GripVertical size={13} color="var(--color-text-subtle)" />
        </div>
      )}

      {/* Checkbox */}
      <button
        id={`todo-check-${todo.id}`}
        onClick={() => onToggle(todo)}
        aria-label={done ? 'Mark as active' : 'Mark as done'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
      >
        {done
          ? <CheckCircle size={16} color="var(--color-emerald)" />
          : <Circle size={16} color={isDaily ? '#10b981' : goalColor ? goalColor.text : hovered ? 'var(--color-lavender)' : 'var(--color-text-subtle)'} style={{ transition: 'color 0.12s' }} />
        }
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13.5, fontWeight: (todo.starred && !done) || isDaily ? 600 : 500,
          lineHeight: 1.4, color: done ? 'var(--color-text-subtle)' : titleColor,
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {isDaily && !done && <span style={{ fontSize: 11, color: '#34d399', flexShrink: 0 }}>↺</span>}
          {todo.title}
        </p>
        {todo.notes && !done && (
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4 }}>{todo.notes}</p>
        )}
        {/* Goal badge */}
        {linkedGoal && goalColor && !done && (
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: goalColor.bg, color: goalColor.text, border: `1px solid ${goalColor.border.replace('0.5', '0.2')}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: goalColor.dot, flexShrink: 0 }} />
              {linkedGoal.title}
            </span>
          </div>
        )}
      </div>

      {/* Star button — always visible if starred, hover-reveal if not */}
      {!done && (
        <button
          id={`todo-star-${todo.id}`}
          onClick={e => { e.stopPropagation(); onStar(todo); }}
          aria-label={todo.starred ? 'Unstar todo' : 'Star todo'}
          title={todo.starred ? 'Unstar' : 'Star — mark as important today'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 3, flexShrink: 0,
            opacity: todo.starred ? 1 : hovered ? 0.5 : 0,
            transition: 'opacity 0.12s, color 0.12s',
            color: todo.starred ? '#f59e0b' : 'var(--color-text-subtle)',
          }}
        >
          <Star size={14} fill={todo.starred ? '#f59e0b' : 'none'} stroke={todo.starred ? '#f59e0b' : 'currentColor'} />
        </button>
      )}

      {/* Delete + restore actions */}
      <div style={{ display: 'flex', gap: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}>
        {done && (
          <button id={`todo-restore-${todo.id}`} onClick={() => onToggle(todo)} aria-label="Restore"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: 'var(--color-text-subtle)' }}>
            <RotateCcw size={12} />
          </button>
        )}
        <button id={`todo-delete-${todo.id}`} onClick={() => onDelete(todo.id)} aria-label="Delete todo"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: 'var(--color-text-subtle)' }}>
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Goal Card (right panel) ────────────────────────────────── */

function GoalCard({ goal, color, expanded, onToggle, todoCount, onDelete, onAchieve, onProgressChange, deleting, onAddTodo, isSelected }: {
  goal: Goal;
  color: typeof GOAL_PALETTE[0];
  expanded: boolean; onToggle: () => void; todoCount: number;
  onDelete: (id: string) => void;
  onAchieve: (goal: Goal) => void;
  onProgressChange: (id: string, progress: number) => void;
  deleting: boolean;
  onAddTodo: () => void;
  isSelected: boolean;
}) {
  const [hovered, setHovered]                 = useState(false);
  const [editingProgress, setEditingProgress] = useState(false);
  const [progressInput, setProgressInput]     = useState(String(goal.progress));

  const commitProgress = () => {
    const n = parseInt(progressInput, 10);
    if (!isNaN(n)) onProgressChange(goal.id, n);
    setEditingProgress(false);
  };

  const bg = goal.status === 'achieved' ? STATUS_BG.achieved : isSelected ? color.bg : STATUS_BG.active;
  const borderColor = isSelected ? color.border : hovered ? 'rgba(255,255,255,0.14)' : 'var(--color-border)';

  return (
    <motion.div
      layout
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${color.dot}`,
        borderRadius: 12, overflow: 'hidden',
        opacity: deleting ? 0.4 : 1,
        transition: 'border-color 0.15s, background 0.15s, opacity 0.2s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <button
          id={`goal-expand-${goal.id}`}
          onClick={onToggle}
          aria-expanded={expanded}
          style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', fontFamily: 'var(--font-sans)' }}
        >
          {/* Color dot + achieve toggle */}
          <button
            id={`goal-achieve-${goal.id}`}
            onClick={e => { e.stopPropagation(); onAchieve(goal); }}
            aria-label={goal.status === 'achieved' ? 'Reopen goal' : 'Mark achieved'}
            title={goal.status === 'achieved' ? 'Reopen goal' : 'Mark achieved'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, paddingTop: 1, flexShrink: 0 }}
          >
            {goal.status === 'achieved'
              ? <CheckCircle size={15} color={color.text} />
              : <Circle size={15} color={hovered ? color.text : color.dot} style={{ transition: 'color 0.12s' }} />
            }
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 5, color: goal.status === 'achieved' ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: goal.status === 'achieved' ? 'line-through' : 'none' }}>
              {goal.title}
            </p>
            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${goal.progress}%`, background: goal.status === 'achieved' ? `linear-gradient(90deg, ${color.dot}, ${color.text})` : `linear-gradient(90deg, ${color.dot}, ${color.text})`, borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>
              {editingProgress ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }} onClick={e => e.stopPropagation()}>
                  <input
                    id={`goal-progress-input-${goal.id}`}
                    type="number" min={0} max={100} value={progressInput}
                    onChange={e => setProgressInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitProgress(); if (e.key === 'Escape') setEditingProgress(false); }}
                    autoFocus
                    style={{ width: 38, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4, padding: '1px 4px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 10, textAlign: 'right', outline: 'none' }}
                    aria-label="Progress percentage"
                  />
                  <button id={`goal-progress-save-${goal.id}`} onClick={commitProgress} aria-label="Save progress"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: color.text }}>
                    <Check size={11} />
                  </button>
                </div>
              ) : (
                <button
                  id={`goal-progress-edit-${goal.id}`}
                  onClick={e => { e.stopPropagation(); setProgressInput(String(goal.progress)); setEditingProgress(true); }}
                  aria-label="Edit progress" title="Edit progress"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontFamily: 'var(--font-sans)' }}
                >
                  <span style={{ color: color.text }}>{goal.progress}%</span>
                  {hovered && <Pencil size={9} style={{ opacity: 0.5 }} />}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            {todoCount > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: color.bg, color: color.text }}>
                {todoCount} task{todoCount > 1 ? 's' : ''}
              </span>
            )}
            {expanded ? <ChevronUp size={13} color="var(--color-text-subtle)" /> : <ChevronDown size={13} color="var(--color-text-subtle)" />}
          </div>
        </button>

        {/* Delete */}
        <button id={`goal-delete-${goal.id}`} onClick={() => onDelete(goal.id)} aria-label="Delete goal" title="Delete goal" disabled={deleting}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '14px 12px 14px 0', color: 'var(--color-text-subtle)', opacity: hovered ? 0.6 : 0, transition: 'opacity 0.12s, color 0.12s', flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fb7185')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-subtle)')}>
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {goal.why && <p style={{ fontSize: 12, color: color.text, fontStyle: 'italic', lineHeight: 1.5 }}>"{goal.why}"</p>}
              {goal.description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>{goal.description}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {goal.category && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-muted)' }}>{goal.category}</span>}
                {goal.target_date && <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>🗓 {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {/* Add todo button */}
                <button
                  id={`goal-add-todo-${goal.id}`}
                  onClick={onAddTodo}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${color.border.replace('0.5', '0.3')}`, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, background: isSelected ? color.bg : 'transparent', color: color.text, transition: 'all 0.12s' }}
                >
                  {isSelected ? '← Adding tasks here' : '+ Add tasks'}
                </button>
                <button id={`goal-achieve-action-${goal.id}`} onClick={() => onAchieve(goal)}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, background: goal.status === 'achieved' ? 'rgba(255,255,255,0.08)' : 'rgba(52,211,153,0.12)', color: goal.status === 'achieved' ? 'var(--color-text-muted)' : 'var(--color-emerald)', transition: 'all 0.12s' }}>
                  {goal.status === 'achieved' ? '↩ Reopen' : '✓ Mark Achieved'}
                </button>
                <button id={`goal-delete-action-${goal.id}`} onClick={() => onDelete(goal.id)} disabled={deleting}
                  style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, background: 'rgba(251,113,133,0.1)', color: '#fb7185', transition: 'all 0.12s' }}>
                  {deleting ? '...' : 'Delete'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Empty state ────────────────────────────────────────────── */

function EmptyTodos() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-text-muted)' }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Nothing on the list</p>
      <p style={{ fontSize: 13, lineHeight: 1.6 }}>
        Add a todo above, or click a goal chip to tag new tasks to it.<br />
        Tell Raven in chat and she'll add them for you.
      </p>
    </div>
  );
}
