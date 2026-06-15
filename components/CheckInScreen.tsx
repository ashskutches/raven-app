'use client';
import { apiFetch } from '../lib/api.js';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Zap, Heart, TrendingUp } from 'lucide-react';

type CheckIn = {
  date: string;
  mood_score?: number;
  energy_score?: number;
  sleep_hours?: number;
  gratitude?: string;
  intention?: string;
  notes?: string;
};

type Stats = {
  total_check_ins: number;
  avg_mood: number | null;
  avg_energy: number | null;
  avg_sleep: number | null;
  trend: Array<{ date: string; mood: number; energy: number; sleep: number }>;
};

const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'http://localhost:4000';

export default function CheckInScreen() {
  const [today, setToday] = useState<CheckIn | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    mood_score: 7,
    energy_score: 7,
    sleep_hours: 7.5,
    gratitude: '',
    intention: '',
    notes: '',
  });

  useEffect(() => {
    apiFetch(`/checkin/today`)
      .then(r => r.json())
      .then(data => {
        if (data) {
          setToday(data);
          setForm({
            mood_score: data.mood_score ?? 7,
            energy_score: data.energy_score ?? 7,
            sleep_hours: data.sleep_hours ?? 7.5,
            gratitude: data.gratitude ?? '',
            intention: data.intention ?? '',
            notes: data.notes ?? '',
          });
          setSaved(true);
        }
      })
      .catch(() => null);

    apiFetch(`/checkin/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => null);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaved(true);
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  };

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 28px', maxWidth: 680 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Daily Check-in</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{todayLabel}</p>
      </div>

      {/* Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        <ScoreSlider
          label="Mood"
          icon={<Heart size={16} color="#fb7185" />}
          value={form.mood_score}
          onChange={v => setForm(f => ({ ...f, mood_score: v }))}
          emoji={getMoodEmoji(form.mood_score)}
        />
        <ScoreSlider
          label="Energy"
          icon={<Zap size={16} color="#fbbf24" />}
          value={form.energy_score}
          onChange={v => setForm(f => ({ ...f, energy_score: v }))}
          emoji={getEnergyEmoji(form.energy_score)}
        />
        <ScoreSlider
          label="Sleep"
          icon={<Moon size={16} color="#818cf8" />}
          value={form.sleep_hours}
          onChange={v => setForm(f => ({ ...f, sleep_hours: v }))}
          min={0}
          max={12}
          step={0.5}
          displayValue={`${form.sleep_hours}h`}
          emoji={getSleepEmoji(form.sleep_hours)}
        />
      </div>

      {/* Text fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
        <CheckInField
          label="🙏 Gratitude"
          placeholder="What are you grateful for today, even something small?"
          value={form.gratitude}
          onChange={v => setForm(f => ({ ...f, gratitude: v }))}
        />
        <CheckInField
          label="🎯 Today's Intention"
          placeholder="What's the one thing that would make today a win?"
          value={form.intention}
          onChange={v => setForm(f => ({ ...f, intention: v }))}
        />
        <CheckInField
          label="💭 Notes"
          placeholder="Anything on your mind? (optional)"
          value={form.notes}
          onChange={v => setForm(f => ({ ...f, notes: v }))}
        />
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={saving}
          style={{ padding: '10px 24px', fontSize: 14 }}
        >
          {saving ? 'Saving...' : saved ? 'Update Check-in' : 'Save Check-in'}
        </button>
        <AnimatePresence>
          {saved && !saving && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              style={{ fontSize: 13, color: '#34d399' }}
            >
              ✓ Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 30-day stats */}
      {stats && stats.total_check_ins > 0 && (
        <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} style={{ color: 'var(--color-lavender)' }} />
            30-Day Averages
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Avg Mood', value: stats.avg_mood, suffix: '/10', color: '#fb7185' },
              { label: 'Avg Energy', value: stats.avg_energy, suffix: '/10', color: '#fbbf24' },
              { label: 'Avg Sleep', value: stats.avg_sleep, suffix: 'h', color: '#818cf8' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '14px 16px',
              }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>
                  {stat.value !== null ? `${stat.value}${stat.suffix}` : '—'}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 10 }}>
            Based on {stats.total_check_ins} check-ins
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreSlider({
  label, icon, value, onChange, min = 1, max = 10, step = 1,
  displayValue, emoji,
}: {
  label: string; icon: React.ReactNode; value: number;
  onChange: (v: number) => void; min?: number; max?: number;
  step?: number; displayValue?: string; emoji: string;
}) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 14,
      padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 28, textAlign: 'center' }}>{emoji}</div>
      <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
        {displayValue ?? `${value}/10`}
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--color-lavender)', cursor: 'pointer' }}
        aria-label={label}
      />
    </div>
  );
}

function CheckInField({
  label, placeholder, value, onChange,
}: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</label>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '10px 14px',
          color: 'var(--color-text)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          resize: 'none',
          outline: 'none',
          lineHeight: 1.55,
          transition: 'border-color 0.2s',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--color-lavender)')}
        onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
      />
    </div>
  );
}

function getMoodEmoji(v: number) {
  if (v >= 9) return '🤩';
  if (v >= 7) return '😊';
  if (v >= 5) return '😐';
  if (v >= 3) return '😔';
  return '😞';
}
function getEnergyEmoji(v: number) {
  if (v >= 9) return '⚡';
  if (v >= 7) return '🔋';
  if (v >= 5) return '😴';
  if (v >= 3) return '🥱';
  return '💀';
}
function getSleepEmoji(v: number) {
  if (v >= 8) return '😴';
  if (v >= 7) return '🌙';
  if (v >= 6) return '😪';
  if (v >= 5) return '🥱';
  return '💤';
}
