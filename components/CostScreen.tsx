'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Zap, TrendingUp, Clock, RefreshCw, AlertTriangle } from 'lucide-react';

const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'https://raven-api-production.up.railway.app';

// ── Types ─────────────────────────────────────────────────────

interface PeriodData {
  input: number;
  output: number;
  total: number;
  cost: number;
  calls: number;
}

interface SourceRow { source: string; cost: number; calls: number; total: number; }
interface ModelRow  { model:  string; cost: number; calls: number; total: number; }
interface DayRow    { date:   string; cost: number; }
interface RecentRow {
  model: string; source: string;
  inputTokens: number; outputTokens: number; totalTokens: number;
  costUsd: number; createdAt: string;
}

interface CostSummary {
  periods:    { today: PeriodData; week: PeriodData; month: PeriodData; allTime: PeriodData };
  bySource:   SourceRow[];
  byModel:    ModelRow[];
  dailySpend: DayRow[];
  recent:     RecentRow[];
  burnRate:   { perHour: number; projectedMonth: number };
}

// ── Source label map ───────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  chat:               '💬 Chat',
  pulse:              '💓 Pulse',
  research:           '🔬 Research',
  morning_briefing:   '☀️ Morning Briefing',
  evening_nudge:      '🌙 Evening Nudge',
  weekly_review:      '📊 Weekly Review',
  inner_dialog:       '💭 Inner Dialog',
  library_writer:     '📚 Library Writer',
};

const SOURCE_COLORS: Record<string, string> = {
  chat:             '#8b5cf6',
  pulse:            '#ec4899',
  research:         '#3b82f6',
  morning_briefing: '#f59e0b',
  evening_nudge:    '#06b6d4',
  weekly_review:    '#10b981',
  inner_dialog:     '#a78bfa',
  library_writer:   '#f97316',
};

// ── Helpers ───────────────────────────────────────────────────
function fmt$  (n: number) { return n < 0.01 ? `<$0.01` : `$${n.toFixed(4)}`; }
function fmtBig(n: number) { return n >= 1 ? `$${n.toFixed(2)}` : fmt$(n); }
function fmtK  (n: number) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }
function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}

// ── Sparkline SVG ─────────────────────────────────────────────
function Sparkline({ data, color = '#8b5cf6' }: { data: DayRow[]; color?: string }) {
  if (!data.length) return <div className="sparkline-empty">No data yet</div>;
  const max = Math.max(...data.map(d => d.cost), 0.0001);
  const W = 300, H = 60, PAD = 4;
  const pts = data.map((d, i) => {
    const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
    const y = H - PAD - (d.cost / max) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`${PAD},${H} ${pts} ${W - PAD},${H}`}
        fill="url(#spark-grad)"
      />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Bar chart ─────────────────────────────────────────────────
function BarChart({ rows }: { rows: Array<{ label: string; value: number; color: string }> }) {
  const max = Math.max(...rows.map(r => r.value), 0.0001);
  return (
    <div className="bar-chart">
      {rows.map((r, i) => (
        <div key={i} className="bar-row">
          <div className="bar-label">{r.label}</div>
          <div className="bar-track">
            <motion.div
              className="bar-fill"
              style={{ background: r.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
            />
          </div>
          <div className="bar-value">{fmt$(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function CostScreen() {
  const [data, setData]       = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<'overview' | 'breakdown' | 'log'>('overview');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${RAVEN_API}/cost/summary`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="cost-loading">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
        <DollarSign size={28} color="#8b5cf6" />
      </motion.div>
      <p>Loading cost data…</p>
    </div>
  );

  if (error) return (
    <div className="cost-error">
      <AlertTriangle size={24} />
      <p>Failed to load: {error}</p>
      <button onClick={load} className="retry-btn">Retry</button>
    </div>
  );

  if (!data) return null;
  const { periods, bySource, byModel, dailySpend, recent, burnRate } = data;

  const sourceRows = bySource.map(s => ({
    label: SOURCE_LABELS[s.source] ?? s.source,
    value: s.cost,
    color: SOURCE_COLORS[s.source] ?? '#6366f1',
    calls: s.calls,
    tokens: s.total,
  }));

  return (
    <div className="cost-screen">
      {/* Header */}
      <div className="cost-header">
        <div className="cost-title-row">
          <h1 className="cost-title">
            <DollarSign size={20} /> Cost Tracker
          </h1>
          <button className="refresh-btn" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Period cards */}
        <div className="cost-period-grid">
          {([
            { label: 'Today',     ...periods.today    },
            { label: 'This Week', ...periods.week     },
            { label: 'This Month',...periods.month    },
            { label: 'All Time',  ...periods.allTime  },
          ] as Array<{ label: string } & PeriodData>).map((p, i) => (
            <motion.div
              key={p.label}
              className="cost-period-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="period-label">{p.label}</div>
              <div className="period-cost">{fmtBig(p.cost)}</div>
              <div className="period-meta">{fmtK(p.total)} tokens · {p.calls} calls</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Burn rate banner */}
      <div className="burn-banner">
        <TrendingUp size={14} />
        <span>
          Burning <strong>{fmt$(burnRate.perHour)}/hr</strong> · projected{' '}
          <strong>{fmtBig(burnRate.projectedMonth)}</strong> this month
        </span>
      </div>

      {/* Tabs */}
      <div className="cost-tabs">
        {(['overview', 'breakdown', 'log'] as const).map(t => (
          <button
            key={t}
            className={`cost-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? '📊 Overview' : t === 'breakdown' ? '🔍 Breakdown' : '📋 Recent Calls'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div className="cost-tab-content">
              <div className="cost-section">
                <h2 className="cost-section-title">30-Day Spend</h2>
                <Sparkline data={dailySpend} color="#8b5cf6" />
                <div className="spark-labels">
                  <span>{dailySpend[0]?.date?.slice(5) ?? ''}</span>
                  <span>{dailySpend[dailySpend.length - 1]?.date?.slice(5) ?? ''}</span>
                </div>
              </div>

              <div className="cost-section">
                <h2 className="cost-section-title">Cost by Feature</h2>
                <BarChart rows={sourceRows} />
              </div>

              <div className="cost-section">
                <h2 className="cost-section-title">By Model</h2>
                <div className="model-table">
                  {byModel.map((m, i) => (
                    <div key={i} className="model-row">
                      <div className="model-name">{m.model.replace('claude-', '').replace(/-\d{8}$/, '')}</div>
                      <div className="model-stats">
                        <span>{fmtK(m.total)} tokens</span>
                        <span>{m.calls} calls</span>
                        <span className="model-cost">{fmtBig(m.cost)}</span>
                      </div>
                    </div>
                  ))}
                  {byModel.length === 0 && <p className="empty-state">No model data yet</p>}
                </div>
              </div>
            </div>
          )}

          {/* BREAKDOWN TAB */}
          {tab === 'breakdown' && (
            <div className="cost-tab-content">
              <div className="breakdown-table">
                <div className="breakdown-header">
                  <span>Feature</span>
                  <span>Calls</span>
                  <span>Tokens</span>
                  <span>Cost</span>
                </div>
                {bySource.map((s, i) => (
                  <motion.div
                    key={i}
                    className="breakdown-row"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <span className="breakdown-source">
                      <span
                        className="source-dot"
                        style={{ background: SOURCE_COLORS[s.source] ?? '#6366f1' }}
                      />
                      {SOURCE_LABELS[s.source] ?? s.source}
                    </span>
                    <span className="breakdown-num">{s.calls}</span>
                    <span className="breakdown-num">{fmtK(s.total)}</span>
                    <span className="breakdown-cost">{fmtBig(s.cost)}</span>
                  </motion.div>
                ))}
                {bySource.length === 0 && <p className="empty-state">No data yet — start chatting!</p>}
              </div>
            </div>
          )}

          {/* LOG TAB */}
          {tab === 'log' && (
            <div className="cost-tab-content">
              <div className="log-list">
                {recent.map((r, i) => (
                  <motion.div
                    key={i}
                    className="log-row"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <div className="log-left">
                      <span
                        className="log-source-badge"
                        style={{ background: SOURCE_COLORS[r.source] ?? '#6366f1' }}
                      >
                        {SOURCE_LABELS[r.source] ?? r.source}
                      </span>
                      <span className="log-model">
                        {r.model.replace('claude-', '').replace(/-\d{8}$/, '')}
                      </span>
                    </div>
                    <div className="log-right">
                      <span className="log-tokens">
                        <Zap size={10} /> {fmtK(r.totalTokens)}
                      </span>
                      <span className="log-cost">{fmt$(r.costUsd)}</span>
                      <span className="log-time">
                        <Clock size={10} /> {relTime(r.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                ))}
                {recent.length === 0 && <p className="empty-state">No calls logged yet</p>}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
