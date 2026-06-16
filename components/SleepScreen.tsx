'use client';
import { apiFetch } from '../lib/api';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Clock, Target, TrendingUp, RefreshCw, Save, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────── */
interface SleepToday {
  date: string;
  sleep_duration_hours: number;
  sleep_quality_rating: number;
  wake_ups_count: number;
  cpap_usage_hours: number;
  notes: string;
}

interface SleepHistoryEntry {
  date?: string;
  logged_at?: string;
  sleep_duration_hours: number;
  sleep_quality_rating: number;
  wake_ups_count?: number;
  cpap_usage_hours?: number;
}

interface SleepCorrelation {
  sample_size: number;
  correlations: {
    sleep_hours_vs_energy: { coefficient: number; interpretation: string };
    sleep_quality_vs_energy: { coefficient: number; interpretation: string };
    cpap_hours_vs_energy: { coefficient: number; interpretation: string };
  };
  paired_data: unknown[];
}

interface SleepGoals {
  target_sleep_minutes: number;
  target_bed_time: string;
  target_wake_time: string;
  max_ahi_threshold: number;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function getQualityColor(rating: number): string {
  if (rating >= 8) return '#34d399';
  if (rating >= 6) return '#fbbf24';
  if (rating >= 4) return '#f97316';
  return '#ef4444';
}

function getDurationColor(hours: number): string {
  if (hours >= 7.5) return '#34d399';
  if (hours >= 6) return '#fbbf24';
  if (hours >= 4) return '#f97316';
  return '#ef4444';
}

function getCorrelationColor(interpretation: string): { bg: string; color: string; border: string } {
  const interp = interpretation.toLowerCase();
  if (interp.includes('positive') || interp.includes('strong positive') || interp.includes('moderate positive')) {
    return { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' };
  }
  if (interp.includes('negative') || interp.includes('strong negative') || interp.includes('moderate negative')) {
    return { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.3)' };
  }
  return { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.12)' };
}

function minutesToHoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getSleepEmoji(hours: number): string {
  if (hours >= 8) return '😴';
  if (hours >= 7) return '🌙';
  if (hours >= 6) return '😪';
  if (hours >= 4) return '🥱';
  return '💤';
}

/* ── Sub-components ──────────────────────────────────────────── */
function SleepBar({ entry }: { entry: SleepHistoryEntry }) {
  const heightPct = (entry.sleep_duration_hours / 12) * 100;
  const barColor = getQualityColor(entry.sleep_quality_rating);
  const dateStr = entry.date ?? entry.logged_at ?? '';
  const label = dateStr
    ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div
      title={`${label}: ${entry.sleep_duration_hours}h sleep, quality ${entry.sleep_quality_rating}/10`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}
    >
      <div style={{ height: 70, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${heightPct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            width: '100%',
            background: barColor,
            borderRadius: '3px 3px 0 0',
            boxShadow: `0 0 6px ${barColor}50`,
            minHeight: 3,
          }}
        />
      </div>
      <span style={{ fontSize: 9, color: 'var(--color-text-subtle)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
        {label.split(' ')[1]}
      </span>
    </div>
  );
}

function SliderField({
  label, value, onChange, min, max, step, displayValue, accentColor, emoji,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
  displayValue: string; accentColor: string; emoji: string;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--color-border)',
      borderRadius: 14,
      padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: accentColor }}>{displayValue}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor, cursor: 'pointer' }}
        aria-label={label}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-subtle)' }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function SleepScreen() {
  const [today, setToday] = useState<SleepToday | null>(null);
  const [history, setHistory] = useState<SleepHistoryEntry[]>([]);
  const [correlation, setCorrelation] = useState<SleepCorrelation | null>(null);
  const [goals, setGoals] = useState<SleepGoals | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showGoalsEdit, setShowGoalsEdit] = useState(false);

  const [form, setForm] = useState({
    sleep_duration_hours: 7.5,
    sleep_quality_rating: 7,
    wake_ups_count: 0,
    cpap_usage_hours: 0,
    notes: '',
  });

  const [goalsForm, setGoalsForm] = useState<SleepGoals>({
    target_sleep_minutes: 450,
    target_bed_time: '22:30',
    target_wake_time: '06:30',
    max_ahi_threshold: 5,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayRes, histRes, corrRes, goalsRes] = await Promise.all([
        apiFetch('/sleep/today'),
        apiFetch('/sleep/history?days=14'),
        apiFetch('/sleep/correlation?days=30'),
        apiFetch('/sleep/goals'),
      ]);

      if (todayRes.ok) {
        const td = await todayRes.json() as SleepToday;
        if (td && td.sleep_duration_hours != null) {
          setToday(td);
          setForm({
            sleep_duration_hours: td.sleep_duration_hours ?? 7.5,
            sleep_quality_rating: td.sleep_quality_rating ?? 7,
            wake_ups_count: td.wake_ups_count ?? 0,
            cpap_usage_hours: td.cpap_usage_hours ?? 0,
            notes: td.notes ?? '',
          });
          setSaved(true);
        }
      }

      if (histRes.ok) {
        const hist = await histRes.json() as SleepHistoryEntry[];
        setHistory(Array.isArray(hist) ? hist : []);
      }

      if (corrRes.ok) {
        const corr = await corrRes.json() as SleepCorrelation;
        setCorrelation(corr);
      }

      if (goalsRes.ok) {
        const g = await goalsRes.json() as SleepGoals;
        setGoals(g);
        setGoalsForm(g);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sleep data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLog = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/sleep/log', {
        method: 'POST',
        body: JSON.stringify({
          sleep_duration_hours: form.sleep_duration_hours,
          sleep_quality_rating: form.sleep_quality_rating,
          wake_ups_count: form.wake_ups_count || undefined,
          cpap_usage_hours: form.cpap_usage_hours || undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log sleep');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGoals = async () => {
    try {
      const res = await apiFetch('/sleep/goals', {
        method: 'POST',
        body: JSON.stringify(goalsForm),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowGoalsEdit(false);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save goals');
    }
  };

  if (loading) {
    return (
      <div className="sleep-screen" style={{ flex: 1, overflowY: 'auto', padding: '32px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <RefreshCw size={28} color="var(--color-indigo-bright, #818cf8)" />
          </motion.div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading sleep data…</p>
        </div>
      </div>
    );
  }

  const correlationEntries = correlation?.correlations
    ? [
        { label: 'Sleep Hours → Energy', data: correlation.correlations.sleep_hours_vs_energy },
        { label: 'Sleep Quality → Energy', data: correlation.correlations.sleep_quality_vs_energy },
        { label: 'CPAP Hours → Energy', data: correlation.correlations.cpap_hours_vs_energy },
      ]
    : [];

  return (
    <div className="sleep-screen" style={{ flex: 1, overflowY: 'auto', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 13,
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={14} />
            {error}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16 }}
              aria-label="Dismiss error"
            >×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 4 }}>🌙 Sleep Tracker</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13.5 }}>
          {today
            ? `Last logged for ${today.date} — update anytime`
            : "Log last night's sleep to track your CPAP and quality patterns"}
        </p>
      </div>

      {/* Quick Log Form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Moon size={15} color="#818cf8" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Log Last Night</span>
          {saved && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#34d399', fontWeight: 600 }}>
              ✓ Logged
            </span>
          )}
        </div>

        {/* Sliders grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <SliderField
            label="Sleep Duration"
            value={form.sleep_duration_hours}
            onChange={v => setForm(f => ({ ...f, sleep_duration_hours: v }))}
            min={0}
            max={12}
            step={0.5}
            displayValue={`${form.sleep_duration_hours}h`}
            accentColor={getDurationColor(form.sleep_duration_hours)}
            emoji={getSleepEmoji(form.sleep_duration_hours)}
          />
          <SliderField
            label="Sleep Quality"
            value={form.sleep_quality_rating}
            onChange={v => setForm(f => ({ ...f, sleep_quality_rating: v }))}
            min={1}
            max={10}
            step={1}
            displayValue={`${form.sleep_quality_rating}/10`}
            accentColor={getQualityColor(form.sleep_quality_rating)}
            emoji={form.sleep_quality_rating >= 8 ? '✨' : form.sleep_quality_rating >= 6 ? '😊' : form.sleep_quality_rating >= 4 ? '😐' : '😣'}
          />
        </div>

        {/* CPAP + Wake-ups */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              CPAP Usage (hours)
            </label>
            <input
              type="number"
              min={0}
              max={12}
              step={0.5}
              value={form.cpap_usage_hours}
              onChange={e => setForm(f => ({ ...f, cpap_usage_hours: parseFloat(e.target.value) || 0 }))}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '10px 14px',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                outline: 'none',
              }}
              aria-label="CPAP usage hours"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              Wake-ups Count
            </label>
            <input
              type="number"
              min={0}
              max={20}
              step={1}
              value={form.wake_ups_count}
              onChange={e => setForm(f => ({ ...f, wake_ups_count: parseInt(e.target.value) || 0 }))}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '10px 14px',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                outline: 'none',
              }}
              aria-label="Wake-ups count"
            />
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Notes (optional)
          </label>
          <textarea
            placeholder="How did you sleep? Any disturbances, dreams, or CPAP issues?"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
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
            onFocus={e => (e.target.style.borderColor = '#818cf8')}
            onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleLog} disabled={saving} style={{ gap: 6 }}>
            <Save size={13} />
            {saving ? 'Saving…' : saved ? 'Update Sleep' : 'Log Sleep'}
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
      </motion.div>

      {/* History Chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingUp size={15} color="#818cf8" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>14-Day Sleep History</span>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-subtle)', fontSize: 13 }}>
            No sleep history yet — start logging to see trends
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 85, marginBottom: 12 }}>
              {history.slice(-14).map((entry, i) => (
                <SleepBar key={i} entry={entry} />
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                { label: '≥8h Great', color: '#34d399' },
                { label: '6–8h OK', color: '#fbbf24' },
                { label: '4–6h Poor', color: '#f97316' },
                { label: '<4h Bad', color: '#ef4444' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>{l.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-subtle)' }}>
              <span>
                Avg duration: {(history.reduce((a, b) => a + b.sleep_duration_hours, 0) / history.length).toFixed(1)}h
              </span>
              <span>
                Avg quality: {(history.reduce((a, b) => a + b.sleep_quality_rating, 0) / history.length).toFixed(1)}/10
              </span>
            </div>
          </>
        )}
      </motion.div>

      {/* Two-column: Correlations + Goals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Correlations */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--color-border)',
            borderRadius: 18,
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={15} color="var(--color-emerald)" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Sleep ↔ Energy Correlation</span>
          </div>

          {!correlation ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-subtle)', fontSize: 13 }}>
              Not enough data yet (need 5+ paired days)
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginBottom: 4 }}>
                Based on {correlation.sample_size} days of paired data
              </p>
              {correlationEntries.map(({ label, data }) => {
                const { bg, color, border } = getCorrelationColor(data?.interpretation ?? '');
                const coeff = data?.coefficient ?? 0;
                return (
                  <div key={label} style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color }}>{coeff.toFixed(2)}</span>
                    </div>
                    <span style={{ fontSize: 11, color, fontWeight: 500 }}>{data?.interpretation}</span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Goals */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--color-border)',
            borderRadius: 18,
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={15} color="var(--color-gold)" />
              <span style={{ fontSize: 14, fontWeight: 700 }}>Sleep Goals</span>
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => setShowGoalsEdit(e => !e)}
            >
              {showGoalsEdit ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Edit
            </button>
          </div>

          <AnimatePresence>
            {showGoalsEdit ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'target_sleep_minutes', label: 'Target Sleep (minutes)', type: 'number', min: 0, max: 720, step: 15 },
                    { key: 'target_bed_time', label: 'Target Bed Time', type: 'time', min: undefined, max: undefined, step: undefined },
                    { key: 'target_wake_time', label: 'Target Wake Time', type: 'time', min: undefined, max: undefined, step: undefined },
                    { key: 'max_ahi_threshold', label: 'Max AHI Threshold', type: 'number', min: 0, max: 30, step: 0.5 },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 5 }}>
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={goalsForm[field.key as keyof SleepGoals]}
                        onChange={e => setGoalsForm(f => ({
                          ...f,
                          [field.key]: field.type === 'number' ? parseFloat(e.target.value) : e.target.value,
                        }))}
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 8,
                          padding: '8px 10px',
                          color: 'var(--color-text)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13,
                          outline: 'none',
                          colorScheme: 'dark',
                        }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handleSaveGoals}>
                      <Save size={12} /> Save Goals
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => setShowGoalsEdit(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {goals ? (
                  [
                    { label: 'Target Sleep', value: minutesToHoursLabel(goals.target_sleep_minutes), icon: '🌙' },
                    { label: 'Bed Time', value: goals.target_bed_time, icon: '🛏️' },
                    { label: 'Wake Time', value: goals.target_wake_time, icon: '⏰' },
                    { label: 'Max AHI', value: `≤${goals.max_ahi_threshold}`, icon: '💨' },
                  ].map(item => (
                    <div key={item.label} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
                        <span>{item.icon}</span>
                        {item.label}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gold)' }}>{item.value}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-subtle)', fontSize: 13 }}>
                    No goals set yet — click Edit to add some
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Today's stats summary */}
      {today && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--color-border)',
            borderRadius: 18,
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Clock size={15} color="#818cf8" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Last Night Summary</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Duration', value: `${today.sleep_duration_hours}h`, color: getDurationColor(today.sleep_duration_hours) },
              { label: 'Quality', value: `${today.sleep_quality_rating}/10`, color: getQualityColor(today.sleep_quality_rating) },
              { label: 'Wake-ups', value: `${today.wake_ups_count}`, color: today.wake_ups_count > 3 ? '#f97316' : '#34d399' },
              { label: 'CPAP', value: `${today.cpap_usage_hours}h`, color: today.cpap_usage_hours >= today.sleep_duration_hours * 0.8 ? '#34d399' : '#fbbf24' },
            ].map(stat => (
              <div key={stat.label} className="stat-card" style={{ padding: '14px 16px' }}>
                <div className="stat-label">{stat.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, letterSpacing: '-0.5px' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
