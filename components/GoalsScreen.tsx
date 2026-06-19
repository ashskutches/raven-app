'use client';

/**
 * GoalsScreen — Goals & Todos
 *
 * Layout:
 *   Left panel  → Quick-add todo input + draggable todo board (active / done)
 *   Right panel → Goals list (read-only, expandable)
 *
 * Todos:
 *   - Drag-to-reorder (HTML5 drag, no external dep)
 *   - Check off → animates to done pile
 *   - Created instantly from input
 *   - Priority tag colours (1-5 → emerald → rose)
 *   - Linked goal badge if goal_id set
 *
 * Raven can create/complete todos via manage_todo tool; they appear here live.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Target, CheckCircle, Circle, ChevronDown, ChevronUp,
  GripVertical, Trash2, RotateCcw, X, CheckSquare,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/* ── Types ─────────────────────────────────────────────────── */

interface Todo {
  id: string;
  title: string;
  notes: string | null;
  status: 'active' | 'done' | 'archived';
  priority: number;
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

/* ── Constants ──────────────────────────────────────────────── */

const PRIORITY_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  5: { bg: 'rgba(251,113,133,0.15)', text: '#fb7185', label: 'Urgent' },
  4: { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24', label: 'High'   },
  3: { bg: 'rgba(167,139,250,0.15)', text: '#a78bfa', label: 'Normal' },
  2: { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', label: 'Low'    },
  1: { bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.38)', label: 'Someday' },
};

const STATUS_BG: Record<string, string> = {
  active:      'rgba(167,139,250,0.08)',
  in_progress: 'rgba(99,102,241,0.1)',
  achieved:    'rgba(52,211,153,0.08)',
  abandoned:   'rgba(255,255,255,0.04)',
  draft:       'rgba(255,255,255,0.04)',
};

/* ── Main Component ─────────────────────────────────────────── */

export default function GoalsScreen() {
  const [todos, setTodos]           = useState<Todo[]>([]);
  const [goals, setGoals]           = useState<Goal[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newTitle, setNewTitle]     = useState('');
  const [newPriority, setNewPriority] = useState(3);
  const [addingTodo, setAddingTodo] = useState(false);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [showDone, setShowDone]     = useState(false);

  // drag state
  const dragId    = useRef<string | null>(null);
  const dragOver  = useRef<string | null>(null);

  /* ── Fetch ── */
  const fetchAll = useCallback(async () => {
    try {
      const [trRes, gRes] = await Promise.all([
        apiFetch('/todos'),
        apiFetch('/goals?status=active'),
      ]);
      if (trRes.ok) setTodos(await trRes.json() as Todo[]);
      if (gRes.ok)  setGoals(await gRes.json() as Goal[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    // Poll every 15s so Raven-created todos appear without refresh
    const iv = setInterval(fetchAll, 15_000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  /* ── Add todo ── */
  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAddingTodo(true);
    try {
      const res = await apiFetch('/todos', {
        method: 'POST',
        body: JSON.stringify({ title, priority: newPriority }),
      });
      if (res.ok) {
        const created = await res.json() as Todo;
        setTodos(prev => [...prev, created]);
        setNewTitle('');
        setNewPriority(3);
      }
    } finally { setAddingTodo(false); }
  };

  const handleInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTodo(); }
    if (e.key === 'Escape') { setNewTitle(''); }
  };

  /* ── Toggle done ── */
  const toggleTodo = async (todo: Todo) => {
    const newStatus = todo.status === 'done' ? 'active' : 'done';
    // Optimistic update
    setTodos(prev => prev.map(t =>
      t.id === todo.id ? { ...t, status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null } : t
    ));
    await apiFetch(`/todos/${todo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
  };

  /* ── Delete ── */
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
    dragId.current  = null;
    dragOver.current = null;
    if (!from || !to || from === to) return;

    const active = todos.filter(t => t.status === 'active');
    const fromIdx = active.findIndex(t => t.id === from);
    const toIdx   = active.findIndex(t => t.id === to);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...active];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Reassign positions sequentially
    const withPositions = reordered.map((t, i) => ({ ...t, position: i + 1 }));
    const done = todos.filter(t => t.status !== 'active');
    setTodos([...withPositions, ...done]);

    await apiFetch('/todos/reorder', {
      method: 'POST',
      body: JSON.stringify({ order: withPositions.map(t => ({ id: t.id, position: t.position })) }),
    });
  };

  /* ── Derived lists ── */
  const activeTodos = todos
    .filter(t => t.status === 'active')
    .sort((a, b) => a.position - b.position || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <CheckSquare size={18} color="var(--color-lavender)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' }}>Todos</h2>
            {activeTodos.length > 0 && (
              <span style={{
                background: 'rgba(167,139,250,0.18)', color: 'var(--color-lavender)',
                fontSize: 11, fontWeight: 700, padding: '2px 8px',
                borderRadius: 100, marginLeft: 4,
              }}>
                {activeTodos.length}
              </span>
            )}
          </div>

          {/* Quick-add input */}
          <QuickAdd
            value={newTitle}
            onChange={setNewTitle}
            onSubmit={addTodo}
            onKeyDown={handleInputKey}
            priority={newPriority}
            onPriorityChange={setNewPriority}
            loading={addingTodo}
          />
        </div>

        {/* Todo list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
          {activeTodos.length === 0 && doneTodos.length === 0 ? (
            <EmptyTodos />
          ) : (
            <>
              {/* Active items — draggable */}
              <AnimatePresence>
                {activeTodos.map(todo => (
                  <TodoCard
                    key={todo.id}
                    todo={todo}
                    goals={goals}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    onDragStart={onDragStart}
                    onDragEnter={onDragEnter}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </AnimatePresence>

              {/* Done section */}
              {doneTodos.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <button
                    onClick={() => setShowDone(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, background: 'none',
                      border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
                      fontSize: 12, fontWeight: 600, padding: '4px 0', marginBottom: 10,
                      fontFamily: 'var(--font-sans)', letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}
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
                        onToggle={toggleTodo}
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
      <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Target size={16} color="var(--color-gold)" />
            <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.2px' }}>Active Goals</h2>
            {activeGoals.length > 0 && (
              <span style={{
                background: 'rgba(251,191,36,0.15)', color: 'var(--color-gold)',
                fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 100, marginLeft: 'auto',
              }}>
                {activeGoals.length}
              </span>
            )}
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
                  expanded={expandedGoal === goal.id}
                  onToggle={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
                  todoCount={todos.filter(t => t.goal_id === goal.id && t.status === 'active').length}
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
  value, onChange, onSubmit, onKeyDown, priority, onPriorityChange, loading,
}: {
  value: string; onChange: (v: string) => void;
  onSubmit: () => void; onKeyDown: (e: React.KeyboardEvent) => void;
  priority: number; onPriorityChange: (p: number) => void; loading: boolean;
}) {
  const pColor = PRIORITY_COLORS[priority];
  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
      borderRadius: 12, padding: '10px 12px', marginBottom: 4,
      display: 'flex', alignItems: 'center', gap: 8,
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
      onFocus={() => {}}
      className="todo-add-wrapper"
    >
      <Plus size={15} color="var(--color-text-subtle)" />
      <input
        id="todo-quick-add"
        placeholder="Add a todo... (Enter to save)"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 14,
        }}
        aria-label="New todo title"
      />

      {/* Priority selector */}
      <div style={{ display: 'flex', gap: 3 }}>
        {[1, 2, 3, 4, 5].map(p => (
          <button
            key={p}
            id={`priority-${p}`}
            onClick={() => onPriorityChange(p)}
            aria-label={`Priority ${p}`}
            style={{
              width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: priority === p ? PRIORITY_COLORS[p].bg : 'rgba(255,255,255,0.05)',
              transition: 'all 0.12s',
              fontSize: 10, fontWeight: 700, color: priority === p ? PRIORITY_COLORS[p].text : 'var(--color-text-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {value.trim() && (
        <button
          id="todo-add-btn"
          onClick={onSubmit}
          disabled={loading}
          style={{
            background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
            border: 'none', borderRadius: 6, padding: '4px 10px',
            color: 'white', fontFamily: 'var(--font-sans)', fontSize: 12,
            fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '...' : 'Add'}
        </button>
      )}

      {/* Priority label hint */}
      <span style={{ fontSize: 10, color: pColor.text, minWidth: 42, textAlign: 'right', fontWeight: 600 }}>
        {pColor.label}
      </span>
    </div>
  );
}

/* ── Individual Todo Card ───────────────────────────────────── */

function TodoCard({
  todo, goals, onToggle, onDelete, done = false,
  onDragStart, onDragEnter, onDragEnd,
}: {
  todo: Todo; goals: Goal[];
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
  done?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnter?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pColor = PRIORITY_COLORS[todo.priority] ?? PRIORITY_COLORS[3];
  const linkedGoal = goals.find(g => g.id === todo.goal_id);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: done ? 0.55 : 1, y: 0 }}
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
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px',
        marginBottom: 6, borderRadius: 10, cursor: done ? 'default' : 'grab',
        background: hovered && !done ? 'rgba(255,255,255,0.065)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hovered && !done ? 'rgba(255,255,255,0.14)' : 'var(--color-border)'}`,
        transition: 'background 0.12s, border-color 0.12s',
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      {!done && (
        <div style={{ paddingTop: 2, opacity: hovered ? 0.5 : 0.15, transition: 'opacity 0.12s', flexShrink: 0 }}>
          <GripVertical size={14} color="var(--color-text-subtle)" />
        </div>
      )}

      {/* Checkbox */}
      <button
        id={`todo-check-${todo.id}`}
        onClick={() => onToggle(todo)}
        aria-label={done ? 'Mark as active' : 'Mark as done'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, paddingTop: 1 }}
      >
        {done
          ? <CheckCircle size={17} color="var(--color-emerald)" />
          : <Circle size={17} color={hovered ? 'var(--color-lavender)' : 'var(--color-text-subtle)'} style={{ transition: 'color 0.12s' }} />
        }
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13.5, fontWeight: 500, lineHeight: 1.4,
          color: done ? 'var(--color-text-subtle)' : 'var(--color-text)',
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {todo.title}
        </p>
        {todo.notes && !done && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4 }}>
            {todo.notes}
          </p>
        )}
        <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Priority badge */}
          {todo.priority !== 3 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: pColor.bg, color: pColor.text,
            }}>
              {pColor.label}
            </span>
          )}
          {/* Linked goal */}
          {linkedGoal && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4,
              background: 'rgba(251,191,36,0.1)', color: 'var(--color-gold)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120,
            }}>
              🎯 {linkedGoal.title}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}>
        {done && (
          <button
            id={`todo-restore-${todo.id}`}
            onClick={() => onToggle(todo)}
            aria-label="Restore"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: 'var(--color-text-subtle)' }}
          >
            <RotateCcw size={13} />
          </button>
        )}
        <button
          id={`todo-delete-${todo.id}`}
          onClick={() => onDelete(todo.id)}
          aria-label="Delete todo"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: 'var(--color-text-subtle)' }}
        >
          <X size={13} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Goal Card (right panel) ────────────────────────────────── */

function GoalCard({ goal, expanded, onToggle, todoCount }: {
  goal: Goal; expanded: boolean; onToggle: () => void; todoCount: number;
}) {
  const bg = STATUS_BG[goal.status] ?? 'rgba(255,255,255,0.04)';
  return (
    <motion.div
      layout
      style={{
        background: bg, border: '1px solid var(--color-border)',
        borderRadius: 12, overflow: 'hidden',
      }}
    >
      <button
        id={`goal-expand-${goal.id}`}
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '13px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
          textAlign: 'left', fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ paddingTop: 2 }}>
          {goal.status === 'achieved'
            ? <CheckCircle size={15} color="var(--color-gold)" />
            : <Circle size={15} color="var(--color-lavender)" />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.35, marginBottom: 4 }}>
            {goal.title}
          </p>
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${goal.progress}%`,
                background: 'linear-gradient(90deg, #6366f1, #a78bfa)',
                borderRadius: 2, transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-text-subtle)', flexShrink: 0 }}>
              {goal.progress}%
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {todoCount > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(167,139,250,0.18)', color: 'var(--color-lavender)',
            }}>
              {todoCount} todo{todoCount > 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp size={13} color="var(--color-text-subtle)" /> : <ChevronDown size={13} color="var(--color-text-subtle)" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {goal.why && (
                <p style={{ fontSize: 12, color: 'var(--color-lavender)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{goal.why}"
                </p>
              )}
              {goal.description && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
                  {goal.description}
                </p>
              )}
              {goal.category && (
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 100,
                  background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-muted)',
                  width: 'fit-content',
                }}>
                  {goal.category}
                </span>
              )}
              {goal.target_date && (
                <p style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
                  🗓 {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
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
        Add a todo above, or tell Raven in chat what you need to do — she'll add it for you.
      </p>
    </div>
  );
}
