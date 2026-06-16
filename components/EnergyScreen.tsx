'use client';
import { apiFetch } from '../lib/api';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, AlertTriangle, Brain, Battery, RefreshCw, ChevronDown, ChevronUp, Save } from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────── */
interface EnergyToday {
  energy_level: number;
  logged_at: string;
  activities: Activity[];
}

interface Activity {
  activity_type: string;
  duration_minutes: number;
  intensity: string;
}

interface EnergyHistoryEntry {
  energy_level: number;
  logged_at: string;
}

interface EnergyBudget {
  budget: {
    weekly_capacity: number;
    sleep_apnea_adjustment: number;
    updated_at: string;
  };
  commitments: Commitment[];
  budget_utilization_pct: number;
  burnout_signals_active: number;
}

interface Commitment {
  name?: string;
  title?: string;
  weekly_cost?: number;
  energy_cost?: number;
}

interface EnergyAnalysis {
  analysis: string;
  logs_analyzed: number;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function getEnergyColor(level: number): string {
  if (level <= 3) return '#ef4444';
  if (level <= 5) return '#f97316';
  if (level <= 7) return '#fbbf24';
  return '#34d399';
}

function getEnergyGradient(level: number): string {
  if (level <= 3) return 'linear-gradient(135deg, #dc2626, #ef4444)';
  if (level <= 5) return 'linear-gradient(135deg, #ea580c, #f97316)';
  if (level <= 7) return 'linear-gradient(135deg, #d97706, #fbbf24)';
  return 'linear-gradient(135deg, #059669, #34d399)';
}

function getEnergyEmoji(level: number): string {
  if (level >= 9) return '⚡';
  if (level >= 7) return '🔋';
  if (level >= 5) return '😴';
  if (level >= 3) return '🥱';
  return '💀';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* ── Sub-components ──────────────────────────────────────────── */
function SparklineBar({ entry, maxVal }: { entry: EnergyHistoryEntry; maxVal: number }) {
  const pct = (entry.energy_level / maxVal) * 100;
  const color = getEnergyColor(entry.energy_level);
  const date = new Date(entry.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div
      title={`${date}: ${entry.energy_level}/10`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}
    >
      <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            width: '100%',
            background: color,
            borderRadius: '3px 3px 0 0',
            boxShadow: `0 0 6px ${color}60`,
            minHeight: 3,
          }}
        />
      </div>
      <span style={{ fontSize: 9, color: 'var(--color-text-subtle)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
        {date.split(' ')[1]}
      </span>
    </div>
  );
}

function CircularProgress({ pct, color }: { pct: number; color: string }) {
  const clampedPct = Math.min(100, Math.max(0, pct));
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (clampedPct / 100) * circ;

  return (
    <svg width={88} height={88} viewBox="0 0 88 88" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={44} cy={44} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
      <motion.circle
        cx={44}
        cy={44}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function EnergyScreen() {
  const [today, setToday] = useState<EnergyToday | null>(null);
  const [history, setHistory] = useState<EnergyHistoryEntry[]>([]);
  const [budget, setBudget] = useState<EnergyBudget | null>(null);
  const [analysis, setAnalysis] = useState<EnergyAnalysis | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const [energyLevel, setEnergyLevel] = useState(7);
  const [notes, setNotes] = useState('');
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ weekly_capacity: 0, recovery_rate: 0, sleep_apnea_adjustment: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayRes, histRes, budRes] = await Promise.all([
        apiFetch('/energy/today'),
        apiFetch('/energy/history?days=14'),
        apiFetch('/energy/budget'),
      ]);

      if (todayRes.ok) {
        const td = await todayRes.json() as EnergyToday;
        if (td && td.energy_level != null) {
          setToday(td);
          setEnergyLevel(td.energy_level);
          setSaved(true);
        }
      }

      if (histRes.ok) {
        const hist = await histRes.json() as EnergyHistoryEntry[];
        setHistory(Array.isArray(hist) ? hist : []);
      }

      if (budRes.ok) {
        const bud = await budRes.json() as EnergyBudget;
        setBudget(bud);
        if (bud?.budget) {
          setBudgetForm({
            weekly_capacity: bud.budget.weekly_capacity ?? 0,
            recovery_rate: 1,
            sleep_apnea_adjustment: bud.budget.sleep_apnea_adjustment ?? 1,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load energy data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLog = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/energy/log', {
        method: 'POST',
        body: JSON.stringify({ energy_level: energyLevel, notes: notes || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setNotes('');
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log energy');
    } finally {
      setSaving(false);
    }
  };

  const handleGetAnalysis = async () => {
    setLoadingAnalysis(true);
    try {
      const res = await apiFetch('/energy/analysis');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as EnergyAnalysis;
      setAnalysis(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analysis');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleSaveBudget = async () => {
    try {
      const res = await apiFetch('/energy/budget', {
        method: 'POST',
        body: JSON.stringify(budgetForm),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowBudgetEdit(false);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save budget');
    }
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="energy-screen" style={{ flex: 1, overflowY: 'auto', padding: '32px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <RefreshCw size={28} color="var(--color-lavender)" />
          </motion.div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading energy data…</p>
        </div>
      </div>
    );
  }

  const effectiveCapacity = budget
    ? (budget.budget.weekly_capacity * budget.budget.sleep_apnea_adjustment)
    : 0;

  const utilizationColor = budget
    ? (budget.budget_utilization_pct >= 90 ? '#ef4444' : budget.budget_utilization_pct >= 70 ? '#fbbf24' : '#34d399')
    : '#34d399';

  return (
    <div className="energy-screen" style={{ flex: 1, overflowY: 'auto', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 900 }}>

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

      {/* Burnout Warning */}
      <AnimatePresence>
        {budget && budget.burnout_signals_active > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 12,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5' }}>
                ⚠️ Burnout Risk Detected
              </p>
              <p style={{ fontSize: 12, color: 'rgba(252,165,165,0.7)', marginTop: 2 }}>
                {budget.burnout_signals_active} active signal{budget.burnout_signals_active !== 1 ? 's' : ''} detected. Consider reducing commitments and prioritizing recovery.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 4 }}>⚡ Energy Tracker</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13.5 }}>
          {today
            ? `Last logged at ${formatTime(today.logged_at)} — update anytime`
            : "Log today's energy level to track your patterns"}
        </p>
      </div>

      {/* Energy Slider Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          padding: '28px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Zap size={16} color="var(--color-gold)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>Current Energy Level</span>
          {saved && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#34d399', fontWeight: 600 }}>
              ✓ Logged today
            </span>
          )}
        </div>

        {/* Big display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
          <div style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: 48 }}>{getEnergyEmoji(energyLevel)}</div>
            <motion.div
              key={energyLevel}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                fontSize: 52,
                fontWeight: 900,
                letterSpacing: '-3px',
                background: getEnergyGradient(energyLevel),
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                lineHeight: 1,
              }}
            >
              {energyLevel}
            </motion.div>
            <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 2 }}>out of 10</div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-subtle)', marginBottom: 8 }}>
              <span>💀 Depleted</span>
              <span>⚡ Energised</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={energyLevel}
              onChange={e => setEnergyLevel(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: getEnergyColor(energyLevel), cursor: 'pointer', height: 6 }}
              aria-label="Energy level"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <span
                  key={n}
                  style={{
                    fontSize: 10,
                    color: n === energyLevel ? getEnergyColor(energyLevel) : 'var(--color-text-subtle)',
                    fontWeight: n === energyLevel ? 700 : 400,
                    cursor: 'pointer',
                  }}
                  onClick={() => setEnergyLevel(n)}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Notes (optional)
          </label>
          <textarea
            placeholder="What's affecting your energy today? (sleep, stress, exercise…)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleLog} disabled={saving} style={{ gap: 6 }}>
            <Save size={13} />
            {saving ? 'Saving…' : saved ? 'Update Energy' : 'Log Energy'}
          </button>
          <AnimatePresence>
            {saved && !saving && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                style={{ fontSize: 13, color: '#34d399' }}
              >
                ✓ Logged
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Two-column: sparkline + budget */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Sparkline */}
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
            <TrendingUp size={15} color="var(--color-indigo-bright, #818cf8)" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>14-Day History</span>
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-subtle)', fontSize: 13 }}>
              No history yet
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, marginBottom: 8 }}>
                {history.slice(-14).map((entry, i) => (
                  <SparklineBar key={i} entry={entry} maxVal={10} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 16 }}>
                <span>Avg: {(history.reduce((a, b) => a + b.energy_level, 0) / history.length).toFixed(1)}/10</span>
                <span>Last {history.length} days</span>
              </div>
            </>
          )}
        </motion.div>

        {/* Budget Utilization */}
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
            <Battery size={15} color="var(--color-emerald)" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Energy Budget</span>
          </div>

          {!budget ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-subtle)', fontSize: 13 }}>
              No budget configured
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress pct={budget.budget_utilization_pct} color={utilizationColor} />
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: utilizationColor }}>
                    {Math.round(budget.budget_utilization_pct)}%
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-subtle)' }}>used</div>
                </div>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Weekly capacity</span>
                  <span style={{ fontWeight: 600 }}>{budget.budget.weekly_capacity}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Sleep apnea adj.</span>
                  <span style={{ fontWeight: 600, color: '#fb7185' }}>×{budget.budget.sleep_apnea_adjustment}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid var(--color-border)', paddingTop: 6, marginTop: 2 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Effective capacity</span>
                  <span style={{ fontWeight: 800, color: utilizationColor }}>{effectiveCapacity.toFixed(0)}</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Commitments */}
      <AnimatePresence>
        {budget && budget.commitments && budget.commitments.length > 0 && (
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 className="section-title" style={{ margin: 0 }}>📋 Commitments</h3>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '5px 10px' }}
                onClick={() => setShowBudgetEdit(e => !e)}
              >
                {showBudgetEdit ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Edit Budget
              </button>
            </div>

            <AnimatePresence>
              {showBudgetEdit && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden', marginBottom: 16 }}
                >
                  <div style={{
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    borderRadius: 12,
                    padding: '16px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                  }}>
                    {[
                      { key: 'weekly_capacity', label: 'Weekly Capacity', min: 0, max: 100, step: 1 },
                      { key: 'recovery_rate', label: 'Recovery Rate', min: 0, max: 2, step: 0.1 },
                      { key: 'sleep_apnea_adjustment', label: 'Apnea Adjustment', min: 0.1, max: 1, step: 0.05 },
                    ].map(field => (
                      <div key={field.key}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                          {field.label}
                        </label>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={budgetForm[field.key as keyof typeof budgetForm]}
                          onChange={e => setBudgetForm(f => ({ ...f, [field.key]: parseFloat(e.target.value) }))}
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
                          }}
                        />
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handleSaveBudget}>
                        Save Budget
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => setShowBudgetEdit(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {budget.commitments.map((c, i) => {
                const cost = c.weekly_cost ?? c.energy_cost ?? 0;
                const name = c.name ?? c.title ?? `Commitment ${i + 1}`;
                const costPct = effectiveCapacity > 0 ? (cost / effectiveCapacity) * 100 : 0;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{name}</div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, costPct)}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{ height: '100%', background: utilizationColor, borderRadius: 2 }}
                        />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: utilizationColor }}>{cost}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-subtle)' }}>{costPct.toFixed(0)}%</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: analysis ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={15} color="var(--color-lavender)" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>AI Energy Analysis</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleGetAnalysis}
            disabled={loadingAnalysis}
            style={{ fontSize: 12, padding: '7px 14px', gap: 6 }}
          >
            {loadingAnalysis ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                  <RefreshCw size={12} />
                </motion.span>
                Analyzing…
              </>
            ) : (
              <>
                <Brain size={12} />
                Get AI Analysis
              </>
            )}
          </button>
        </div>

        <AnimatePresence>
          {analysis && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                background: 'rgba(167,139,250,0.07)',
                border: '1px solid rgba(167,139,250,0.2)',
                borderRadius: 12,
                padding: '16px',
                marginTop: 16,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-lavender)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Based on {analysis.logs_analyzed} energy logs
                </p>
                <p style={{ fontSize: 13.5, color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {analysis.analysis}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!analysis && !loadingAnalysis && (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-subtle)', marginTop: 10 }}>
            Get personalised insights about your energy patterns, triggers, and recovery strategies.
          </p>
        )}
      </motion.div>
    </div>
  );
}
