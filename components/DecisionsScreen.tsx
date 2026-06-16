'use client';
import { apiFetch } from '../lib/api';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Plus, ChevronDown, ChevronUp,
  RefreshCw, Brain, AlertTriangle, CheckCircle, Clock, XCircle, DollarSign,
} from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────── */
type DecisionCategory = 'time_commitment' | 'purchase' | 'project';
type DecisionStatus = 'active' | 'completed' | 'abandoned';

interface Decision {
  id: string;
  title: string;
  category: DecisionCategory;
  description?: string;
  status: DecisionStatus;
  estimated_time_hours?: number;
  estimated_cost_usd?: number;
  estimated_value_usd?: number;
  actual_time_hours?: number;
  actual_cost_usd?: number;
  actual_value_usd?: number;
  notes?: string;
  created_at?: string;
  roi_pct?: number;
}

interface DecisionROI {
  roi_pct: number;
  inputs: { time_hours: number; cost_usd: number; total_investment_usd: number };
  outputs: { financial_value_usd: number; outcomes: string[] };
  is_estimated: boolean;
}

interface DecisionPatterns {
  analysis: string;
  decisions_analyzed: number;
}

/* ── Constants ───────────────────────────────────────────────── */
const CATEGORY_CONFIG: Record<DecisionCategory, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  time_commitment: { label: 'Time', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', emoji: '⏰' },
  purchase:        { label: 'Purchase', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', emoji: '💳' },
  project:         { label: 'Project', color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', emoji: '🚀' },
};

const STATUS_CONFIG: Record<DecisionStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active:    { label: 'Active', color: '#818cf8', icon: <Clock size={11} /> },
  completed: { label: 'Completed', color: '#34d399', icon: <CheckCircle size={11} /> },
  abandoned: { label: 'Abandoned', color: '#fb7185', icon: <XCircle size={11} /> },
};

const ALL_STATUSES: DecisionStatus[] = ['active', 'completed', 'abandoned'];
const ALL_CATEGORIES: DecisionCategory[] = ['time_commitment', 'purchase', 'project'];

/* ── Helpers ─────────────────────────────────────────────────── */
function formatCurrency(n?: number): string {
  if (n == null) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatHours(h?: number): string {
  if (h == null) return '—';
  return `${h}h`;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

/* ── ROI badge ───────────────────────────────────────────────── */
function RoiBadge({ roi }: { roi: number }) {
  const positive = roi >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 100,
      background: positive ? 'rgba(52,211,153,0.12)' : 'rgba(251,113,133,0.12)',
      border: `1px solid ${positive ? 'rgba(52,211,153,0.3)' : 'rgba(251,113,133,0.3)'}`,
      color: positive ? '#34d399' : '#fb7185',
      fontSize: 11, fontWeight: 700,
    }}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {roi >= 0 ? '+' : ''}{roi.toFixed(0)}% ROI
    </span>
  );
}

/* ── Decision Card ───────────────────────────────────────────── */
function DecisionCard({
  decision, onUpdate,
}: {
  decision: Decision;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [roi, setRoi] = useState<DecisionROI | null>(null);
  const [loadingRoi, setLoadingRoi] = useState(false);
  const [showActualsForm, setShowActualsForm] = useState(false);
  const [actuals, setActuals] = useState({
    actual_time_hours: decision.actual_time_hours ?? '',
    actual_cost_usd: decision.actual_cost_usd ?? '',
    actual_value_usd: decision.actual_value_usd ?? '',
    status: decision.status,
    notes: decision.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const cat = CATEGORY_CONFIG[decision.category];
  const stat = STATUS_CONFIG[decision.status];

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !roi && !loadingRoi) {
      setLoadingRoi(true);
      try {
        const res = await apiFetch(`/decisions/${decision.id}/roi`);
        if (res.ok) {
          const data = await res.json() as DecisionROI;
          setRoi(data);
        }
      } catch {
        // ROI not available — silent
      } finally {
        setLoadingRoi(false);
      }
    }
  };

  const handleSaveActuals = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = { status: actuals.status };
      if (actuals.actual_time_hours !== '') body.actual_time_hours = Number(actuals.actual_time_hours);
      if (actuals.actual_cost_usd !== '') body.actual_cost_usd = Number(actuals.actual_cost_usd);
      if (actuals.actual_value_usd !== '') body.actual_value_usd = Number(actuals.actual_value_usd);
      if (actuals.notes) body.notes = actuals.notes;

      const res = await apiFetch(`/decisions/${decision.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowActualsForm(false);
      onUpdate();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${cat.border}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div
        style={{ padding: '14px 16px', cursor: 'pointer' }}
        onClick={handleExpand}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleExpand()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Category badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 9px', borderRadius: 100,
            background: cat.bg, border: `1px solid ${cat.border}`,
            color: cat.color, fontSize: 10.5, fontWeight: 700, flexShrink: 0,
          }}>
            {cat.emoji} {cat.label}
          </span>

          {/* Status badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 9px', borderRadius: 100,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: stat.color, fontSize: 10.5, fontWeight: 700, flexShrink: 0,
          }}>
            {stat.icon} {stat.label}
          </span>

          {/* ROI badge for completed */}
          {decision.status === 'completed' && decision.roi_pct != null && (
            <RoiBadge roi={decision.roi_pct} />
          )}

          <div style={{ marginLeft: 'auto', color: 'var(--color-text-subtle)' }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.35, marginBottom: 4 }}>
            {decision.title}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {decision.estimated_cost_usd != null && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Est. cost: <strong style={{ color: '#fbbf24' }}>{formatCurrency(decision.estimated_cost_usd)}</strong>
              </span>
            )}
            {decision.estimated_time_hours != null && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Est. time: <strong style={{ color: '#818cf8' }}>{formatHours(decision.estimated_time_hours)}</strong>
              </span>
            )}
            {decision.created_at && (
              <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>{timeAgo(decision.created_at)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 16px 16px',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              paddingTop: 14,
            }}>
              {/* Description */}
              {decision.description && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {decision.description}
                </p>
              )}

              {/* Estimated vs Actual */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Time', est: decision.estimated_time_hours, act: decision.actual_time_hours, format: formatHours, color: '#818cf8' },
                  { label: 'Cost', est: decision.estimated_cost_usd, act: decision.actual_cost_usd, format: formatCurrency, color: '#fbbf24' },
                  { label: 'Value', est: decision.estimated_value_usd, act: decision.actual_value_usd, format: formatCurrency, color: '#34d399' },
                ].map(col => (
                  <div key={col.label} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: '10px',
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      {col.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 3 }}>
                      Est: <span style={{ color: col.color, fontWeight: 600 }}>{col.format(col.est as number)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Act: <span style={{ color: col.est != null && col.act != null ? (col.act <= (col.est as number) ? '#34d399' : '#fb7185') : col.color, fontWeight: 600 }}>
                        {col.format(col.act as number)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ROI section */}
              {loadingRoi && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-subtle)' }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <RefreshCw size={12} />
                  </motion.div>
                  Loading ROI…
                </div>
              )}

              {roi && (
                <div style={{
                  background: roi.roi_pct >= 0 ? 'rgba(52,211,153,0.07)' : 'rgba(251,113,133,0.07)',
                  border: `1px solid ${roi.roi_pct >= 0 ? 'rgba(52,211,153,0.25)' : 'rgba(251,113,133,0.25)'}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                      ROI Analysis {roi.is_estimated ? '(estimated)' : '(actual)'}
                    </span>
                    <RoiBadge roi={roi.roi_pct} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Total investment: <strong style={{ color: '#fbbf24' }}>{formatCurrency(roi.inputs.total_investment_usd)}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Financial value: <strong style={{ color: '#34d399' }}>{formatCurrency(roi.outputs.financial_value_usd)}</strong>
                    </div>
                  </div>
                  {roi.outputs.outcomes && roi.outputs.outcomes.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginBottom: 4 }}>Outcomes:</div>
                      {roi.outputs.outcomes.map((o, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: 5 }}>
                          <span style={{ color: '#34d399' }}>•</span> {o}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {decision.notes && (
                <p style={{ fontSize: 12.5, color: 'var(--color-text-subtle)', fontStyle: 'italic', lineHeight: 1.55 }}>
                  💬 {decision.notes}
                </p>
              )}

              {/* Update Actuals form */}
              <div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '6px 12px', gap: 5 }}
                  onClick={() => setShowActualsForm(e => !e)}
                >
                  {showActualsForm ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Update Actuals
                </button>

                <AnimatePresence>
                  {showActualsForm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        marginTop: 10,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 10,
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          {[
                            { key: 'actual_time_hours', label: 'Actual Time (hrs)', placeholder: '0' },
                            { key: 'actual_cost_usd', label: 'Actual Cost ($)', placeholder: '0' },
                            { key: 'actual_value_usd', label: 'Actual Value ($)', placeholder: '0' },
                          ].map(f => (
                            <div key={f.key}>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 5 }}>
                                {f.label}
                              </label>
                              <input
                                type="number"
                                placeholder={f.placeholder}
                                value={actuals[f.key as keyof typeof actuals] as string}
                                onChange={e => setActuals(a => ({ ...a, [f.key]: e.target.value }))}
                                style={{
                                  width: '100%',
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 8,
                                  padding: '7px 10px',
                                  color: 'var(--color-text)',
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: 13,
                                  outline: 'none',
                                }}
                              />
                            </div>
                          ))}
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 5 }}>
                            Status
                          </label>
                          <select
                            value={actuals.status}
                            onChange={e => setActuals(a => ({ ...a, status: e.target.value as DecisionStatus }))}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 8,
                              padding: '7px 10px',
                              color: 'var(--color-text)',
                              fontFamily: 'var(--font-sans)',
                              fontSize: 13,
                              outline: 'none',
                              colorScheme: 'dark',
                            }}
                            aria-label="Decision status"
                          >
                            {ALL_STATUSES.map(s => (
                              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 5 }}>
                            Notes
                          </label>
                          <textarea
                            placeholder="How did this decision turn out?"
                            value={actuals.notes}
                            onChange={e => setActuals(a => ({ ...a, notes: e.target.value }))}
                            rows={2}
                            style={{
                              width: '100%',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 8,
                              padding: '7px 10px',
                              color: 'var(--color-text)',
                              fontFamily: 'var(--font-sans)',
                              fontSize: 13,
                              resize: 'none',
                              outline: 'none',
                            }}
                          />
                        </div>

                        {saveError && (
                          <p style={{ fontSize: 12, color: '#fca5a5' }}>⚠ {saveError}</p>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-success" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handleSaveActuals} disabled={saving}>
                            {saving ? 'Saving…' : '✓ Save Actuals'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => setShowActualsForm(false)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Add Decision Form ───────────────────────────────────────── */
function AddDecisionForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: '',
    category: 'project' as DecisionCategory,
    description: '',
    estimated_time_hours: '',
    estimated_cost_usd: '',
    estimated_value_usd: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        category: form.category,
      };
      if (form.description) body.description = form.description;
      if (form.estimated_time_hours) body.estimated_time_hours = Number(form.estimated_time_hours);
      if (form.estimated_cost_usd) body.estimated_cost_usd = Number(form.estimated_cost_usd);
      if (form.estimated_value_usd) body.estimated_value_usd = Number(form.estimated_value_usd);
      if (form.notes) body.notes = form.notes;

      const res = await apiFetch('/decisions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create decision');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: '9px 12px',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-sans)',
    fontSize: 13.5,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    marginBottom: 6,
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        background: 'rgba(167,139,250,0.06)',
        border: '1px solid rgba(167,139,250,0.25)',
        borderRadius: 16,
        padding: '20px',
        marginBottom: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>+ New Decision</h3>

        {/* Title */}
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            type="text"
            placeholder="What decision are you tracking?"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Category */}
        <div>
          <label style={labelStyle}>Category</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {ALL_CATEGORIES.map(cat => {
              const c = CATEGORY_CONFIG[cat];
              const active = form.category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setForm(f => ({ ...f, category: cat }))}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 100,
                    border: `1px solid ${active ? c.border : 'rgba(255,255,255,0.12)'}`,
                    background: active ? c.bg : 'transparent',
                    color: active ? c.color : 'var(--color-text-muted)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 0.15s',
                  }}
                >
                  {c.emoji} {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <textarea
            placeholder="What's the context or background for this decision?"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.55 }}
          />
        </div>

        {/* Estimates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { key: 'estimated_time_hours', label: 'Est. Time (hrs)', placeholder: '10' },
            { key: 'estimated_cost_usd', label: 'Est. Cost ($)', placeholder: '0' },
            { key: 'estimated_value_usd', label: 'Est. Value ($)', placeholder: '0' },
          ].map(field => (
            <div key={field.key}>
              <label style={labelStyle}>{field.label}</label>
              <input
                type="number"
                placeholder={field.placeholder}
                value={form[field.key as keyof typeof form] as string}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea
            placeholder="Any other context, constraints, or considerations?"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.55 }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={12} /> {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving} style={{ gap: 5 }}>
            <Plus size={13} />
            {saving ? 'Creating…' : 'Create Decision'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel} style={{ fontSize: 13 }}>
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function DecisionsScreen() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<DecisionPatterns | null>(null);
  const [loadingPatterns, setLoadingPatterns] = useState(false);

  const [statusFilter, setStatusFilter] = useState<DecisionStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<DecisionCategory | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);

      const res = await apiFetch(`/decisions${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as Decision[] | { decisions: Decision[] };
      setDecisions(Array.isArray(data) ? data : (data.decisions ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load decisions');
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const handleGetPatterns = async () => {
    setLoadingPatterns(true);
    try {
      const res = await apiFetch('/decisions/patterns');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as DecisionPatterns;
      setPatterns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pattern analysis');
    } finally {
      setLoadingPatterns(false);
    }
  };

  /* Stats */
  const activeCount = decisions.filter(d => d.status === 'active').length;
  const completedThisMonth = decisions.filter(d => {
    if (d.status !== 'completed' || !d.created_at) return false;
    const now = new Date();
    const created = new Date(d.created_at);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const completedWithRoi = decisions.filter(d => d.status === 'completed' && d.roi_pct != null);
  const avgRoi = completedWithRoi.length > 0
    ? completedWithRoi.reduce((a, d) => a + (d.roi_pct ?? 0), 0) / completedWithRoi.length
    : null;

  return (
    <div className="decisions-screen" style={{ flex: 1, overflowY: 'auto', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

      {/* Error banner */}
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 4 }}>🧭 Decisions</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13.5 }}>
            Track decisions and measure their ROI over time
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '7px 12px', gap: 5 }}
            onClick={handleGetPatterns}
            disabled={loadingPatterns}
          >
            {loadingPatterns
              ? <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><RefreshCw size={12} /></motion.span> Analyzing…</>
              : <><Brain size={12} /> AI Pattern Analysis</>}
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 13, gap: 5 }}
            onClick={() => setShowAddForm(f => !f)}
          >
            <Plus size={14} />
            Add Decision
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Active', value: activeCount, color: '#818cf8', icon: <Clock size={14} color="#818cf8" /> },
          { label: 'Completed this month', value: completedThisMonth, color: '#34d399', icon: <CheckCircle size={14} color="#34d399" /> },
          {
            label: 'Avg ROI',
            value: avgRoi != null ? `${avgRoi >= 0 ? '+' : ''}${avgRoi.toFixed(0)}%` : '—',
            color: avgRoi != null ? (avgRoi >= 0 ? '#34d399' : '#fb7185') : 'var(--color-text-muted)',
            icon: avgRoi != null && avgRoi >= 0 ? <TrendingUp size={14} color="#34d399" /> : <TrendingDown size={14} color="#fb7185" />,
          },
        ].map(stat => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="stat-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {stat.icon}
              <span className="stat-label" style={{ margin: 0 }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: stat.color, letterSpacing: '-1px' }}>
              {stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* AI Pattern Analysis */}
      <AnimatePresence>
        {patterns && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              background: 'rgba(167,139,250,0.07)',
              border: '1px solid rgba(167,139,250,0.25)',
              borderRadius: 16,
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Brain size={15} color="var(--color-lavender)" />
              <span style={{ fontSize: 14, fontWeight: 700 }}>AI Pattern Analysis</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginLeft: 4 }}>
                — {patterns.decisions_analyzed} decisions analyzed
              </span>
              <button
                onClick={() => setPatterns(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-subtle)', cursor: 'pointer', fontSize: 16 }}
                aria-label="Close analysis"
              >×</button>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {patterns.analysis}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Decision Form */}
      <AnimatePresence>
        {showAddForm && (
          <AddDecisionForm
            onSaved={() => { setShowAddForm(false); fetchDecisions(); }}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status filters */}
        <div className="library-tabs" style={{ margin: 0 }}>
          {(['all', ...ALL_STATUSES] as const).map(s => (
            <button
              key={s}
              className={`tab ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setCategoryFilter('all')}
            style={{
              padding: '6px 12px',
              borderRadius: 100,
              border: `1px solid ${categoryFilter === 'all' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`,
              background: categoryFilter === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: categoryFilter === 'all' ? 'var(--color-text)' : 'var(--color-text-muted)',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.15s',
            }}
          >
            All categories
          </button>
          {ALL_CATEGORIES.map(cat => {
            const c = CATEGORY_CONFIG[cat];
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 100,
                  border: `1px solid ${active ? c.border : 'rgba(255,255,255,0.1)'}`,
                  background: active ? c.bg : 'transparent',
                  color: active ? c.color : 'var(--color-text-muted)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {c.emoji} {c.label}
              </button>
            );
          })}
        </div>

        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px', gap: 5 }}
          onClick={fetchDecisions}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Decisions list */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 0', color: 'var(--color-text-muted)' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <RefreshCw size={22} color="var(--color-lavender)" />
          </motion.div>
          <span style={{ fontSize: 14 }}>Loading decisions…</span>
        </div>
      ) : decisions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ textAlign: 'center', padding: '60px 0' }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧭</div>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--color-text)' }}>
            No decisions found
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', maxWidth: 340, margin: '0 auto 20px' }}>
            {statusFilter !== 'all' || categoryFilter !== 'all'
              ? 'Try adjusting your filters to see more decisions.'
              : 'Start tracking your decisions to measure their ROI and spot patterns over time.'}
          </p>
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ gap: 5 }}>
            <Plus size={14} /> Add your first decision
          </button>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-subtle)', marginBottom: 2 }}>
            <span>{decisions.length} decision{decisions.length !== 1 ? 's' : ''}</span>
            <span>Click any card to expand details</span>
          </div>
          <AnimatePresence mode="popLayout">
            {decisions.map(decision => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onUpdate={fetchDecisions}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ROI Legend */}
      {decisions.some(d => d.status === 'completed') && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>ROI:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#34d399' }}>
            <TrendingUp size={11} /> Positive return
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#fb7185' }}>
            <TrendingDown size={11} /> Negative return
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-subtle)' }}>
            <DollarSign size={11} /> Estimated until actuals entered
          </div>
        </div>
      )}
    </div>
  );
}
