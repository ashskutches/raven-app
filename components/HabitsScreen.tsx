'use client';
import { apiFetch } from '../lib/api.js';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Flame, Plus, Check } from 'lucide-react';

type Habit = {
  id: string;
  name: string;
  description?: string;
  frequency: string;
  category?: string;
  active: boolean;
  streak_current: number;
  streak_best: number;
  completed_today: boolean;
};

const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'http://localhost:4000';

export default function HabitsScreen() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', category: '', frequency: 'daily' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/habits`).then(r => r.json());
      setHabits(Array.isArray(data) ? data : []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const complete = async (id: string) => {
    setCompleting(id);
    try {
      await apiFetch(`/habits/${id}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
      await load();
    } catch { /* silent */ } finally {
      setCompleting(null);
    }
  };

  const createHabit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/habits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ name: '', description: '', category: '', frequency: 'daily' });
      await load();
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  };

  const completedCount = habits.filter(h => h.completed_today).length;
  const totalCount = habits.length;

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Stats bar */}
      <div style={{
        padding: '12px 28px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Flame size={18} color="#fbbf24" />
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            Today:{' '}
            <strong style={{ color: completedCount === totalCount && totalCount > 0 ? '#34d399' : 'var(--color-text)' }}>
              {completedCount}/{totalCount}
            </strong>
          </span>
        </div>
        {completedCount === totalCount && totalCount > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}
          >
            🔥 All done! Perfect day.
          </motion.span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} aria-label="Add habit">
          <Plus size={14} /> New Habit
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Create form */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginBottom: 24,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>🔁 New Habit</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <HabitInput placeholder="Habit name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
              <HabitInput placeholder="Description (optional)" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
              <div style={{ display: 'flex', gap: 10 }}>
                <HabitInput placeholder="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} />
                <select
                  value={form.frequency}
                  onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                    borderRadius: 8, padding: '8px 12px', color: 'var(--color-text)',
                    fontFamily: 'var(--font-sans)', fontSize: 14,
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createHabit} disabled={saving || !form.name.trim()}>
                  {saving ? 'Creating...' : 'Add Habit'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading habits...</p>
        ) : habits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔁</div>
            <p style={{ fontSize: 15 }}>No habits yet. Start small — even one habit tracked consistently beats ten aspirations.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {habits.map((habit, i) => (
              <motion.div
                key={habit.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 20px',
                  background: habit.completed_today ? 'rgba(52,211,153,0.06)' : 'var(--color-surface)',
                  border: `1px solid ${habit.completed_today ? 'rgba(52,211,153,0.2)' : 'var(--color-border)'}`,
                  borderRadius: 14,
                  transition: 'all 0.2s',
                }}
              >
                {/* Complete button */}
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => !habit.completed_today && complete(habit.id)}
                  disabled={habit.completed_today || completing === habit.id}
                  aria-label={habit.completed_today ? 'Completed' : 'Mark complete'}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: habit.completed_today ? 'default' : 'pointer',
                    background: habit.completed_today ? '#34d399' : 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.2s',
                  }}
                >
                  {habit.completed_today ? <Check size={16} color="white" /> : <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />}
                </motion.button>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 600, fontSize: 14,
                    textDecoration: habit.completed_today ? 'line-through' : 'none',
                    color: habit.completed_today ? 'var(--color-text-muted)' : 'var(--color-text)',
                  }}>
                    {habit.name}
                  </div>
                  {habit.category && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-subtle)', textTransform: 'capitalize' }}>
                      {habit.category} · {habit.frequency}
                    </span>
                  )}
                </div>

                {/* Streak */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Flame size={14} color={habit.streak_current > 0 ? '#fbbf24' : 'var(--color-text-subtle)'} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: habit.streak_current > 0 ? '#fbbf24' : 'var(--color-text-subtle)' }}>
                      {habit.streak_current}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-subtle)' }}>best: {habit.streak_best}</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HabitInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, width: '100%',
        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
        borderRadius: 8, padding: '8px 12px', color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
      }}
    />
  );
}
