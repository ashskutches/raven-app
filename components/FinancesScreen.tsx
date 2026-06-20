'use client';
import { apiFetch } from '../lib/api';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, Plus, Pencil, Trash2, X,
  Sparkles, RefreshCw, ChevronDown, ChevronUp, DollarSign,
  Briefcase, BarChart3, AlertCircle, Lightbulb, Target, ArrowRight,
  Flame, Receipt,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface FinancialTargets {
  id?: string;
  income_target:    number | null;
  profit_target:    number | null;
  net_worth_target: number | null;
  target_date:      string | null;
  notes:            string | null;
}
interface IncomeSource {
  id: string; name: string; type: string;
  amount: number; frequency: string; notes?: string; is_active: boolean;
}
interface Expense {
  id: string; name: string; category: string;
  amount: number; frequency: string; notes?: string; is_active: boolean;
}
interface SavingsGoal {
  id: string; name: string; target: number; saved: number;
  deadline: string | null; emoji: string; color: string;
  notes: string | null; achieved: boolean;
}
interface Insight {
  id: string; type: 'insight' | 'alert' | 'opportunity' | 'goal';
  title: string; content: string; priority: number; is_read: boolean; created_at: string;
}
interface Summary {
  monthly_income:   number;
  monthly_expenses: number;
  monthly_net:      number;
  savings_rate:     number;
  targets:          FinancialTargets | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const INCOME_TYPES  = ['salary','freelance','business','investment','rental','side_hustle','other'];
const EXPENSE_CATS  = ['housing','food','transport','utilities','subscriptions','health','entertainment','savings','debt','other'];
const FREQUENCIES   = ['daily','weekly','biweekly','monthly','quarterly','annual','one_time'];
const GOAL_COLORS   = ['#a78bfa','#6366f1','#34d399','#60a5fa','#fbbf24','#f472b6','#fb923c','#f87171'];

const INCOME_ICONS: Record<string, string> = {
  salary:'💼', freelance:'🎨', business:'🏢',
  investment:'📈', rental:'🏠', side_hustle:'⚡', other:'💵',
};
const EXPENSE_ICONS: Record<string, string> = {
  housing:'🏠', food:'🍔', transport:'🚗', utilities:'💡',
  subscriptions:'📱', health:'💊', entertainment:'🎮',
  savings:'🐖', debt:'💳', other:'📦',
};
const INSIGHT_CONFIG = {
  insight:     { icon: <Lightbulb size={14} />,    color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  alert:       { icon: <AlertCircle size={14} />,  color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  opportunity: { icon: <TrendingUp size={14} />,   color: '#34d399', bg: 'rgba(52,211,153,0.1)'  },
  goal:        { icon: <Target size={14} />,        color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'  },
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtFreq(f: string) {
  return ({ daily:'/ day', weekly:'/ wk', biweekly:'/ 2wk', monthly:'/ mo',
            quarterly:'/ qtr', annual:'/ yr', one_time:'one-time' } as Record<string,string>)[f] ?? f;
}
function progressPct(saved: number, target: number) {
  return Math.min(100, target > 0 ? (saved / target) * 100 : 0);
}

// ── Financial Goals Banner ───────────────────────────────────────────────────

function GoalsBanner({
  targets, summary, onEdit,
}: { targets: FinancialTargets | null; summary: Summary | null; onEdit: () => void }) {
  const hasTargets = targets && (targets.income_target || targets.profit_target);

  if (!hasTargets) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        onClick={onEdit}
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(167,139,250,0.08))',
          border: '1px dashed rgba(99,102,241,0.35)',
          borderRadius: 16, padding: '18px 22px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
          transition: 'border-color 0.2s',
        }}
        whileHover={{ borderColor: 'rgba(99,102,241,0.6)' }}
        id="set-financial-goals-btn"
      >
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Flame size={18} color="#fff" />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Set your financial goals</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Tell Raven how much you want to earn and keep each month — she&apos;ll track your progress and coach you toward it.
          </p>
        </div>
        <ArrowRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: 'auto' }} />
      </motion.div>
    );
  }

  const incomeGap  = targets.income_target  != null && summary ? targets.income_target  - summary.monthly_income : null;
  const profitGap  = targets.profit_target  != null && summary ? targets.profit_target  - summary.monthly_net    : null;

  const incomePct  = targets.income_target  && summary ? Math.min(100, (summary.monthly_income / targets.income_target) * 100) : 0;
  const profitPct  = targets.profit_target  && summary ? Math.min(100, Math.max(0, (summary.monthly_net   / targets.profit_target) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(167,139,250,0.06))',
        border: '1px solid rgba(99,102,241,0.22)',
        borderRadius: 16, padding: '20px 24px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Flame size={15} color="#a78bfa" />
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Financial Goals</span>
        </div>
        <button
          onClick={onEdit}
          aria-label="Edit financial goals"
          id="edit-financial-goals-btn"
          style={{
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
            color: '#a78bfa', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Pencil size={10} /> Edit
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Income goal */}
        {targets.income_target != null && (
          <GoalBar
            label="Monthly Income"
            current={summary?.monthly_income ?? 0}
            target={targets.income_target}
            pct={incomePct}
            gap={incomeGap}
            color="#34d399"
          />
        )}
        {/* Profit goal */}
        {targets.profit_target != null && (
          <GoalBar
            label="Monthly Profit (take-home)"
            current={summary?.monthly_net ?? 0}
            target={targets.profit_target}
            pct={profitPct}
            gap={profitGap}
            color="#60a5fa"
          />
        )}
      </div>
    </motion.div>
  );
}

function GoalBar({
  label, current, target, pct, gap, color,
}: { label: string; current: number; target: number; pct: number; gap: number | null; color: string }) {
  const met = gap !== null && gap <= 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color }}>
            {fmt(current)} <span style={{ color: 'var(--color-text-subtle)', fontWeight: 400 }}>/ {fmt(target)}</span>
          </span>
          {gap !== null && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
              background: met ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.12)',
              color: met ? '#34d399' : '#f87171',
            }}>
              {met ? `✓ +${fmt(Math.abs(gap))}` : `${fmt(gap)} to go`}
            </span>
          )}
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 100, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 100, background: met ? '#34d399' : color }}
        />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinancesScreen() {
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [targets,   setTargets]   = useState<FinancialTargets | null>(null);
  const [income,    setIncome]    = useState<IncomeSource[]>([]);
  const [expenses,  setExpenses]  = useState<Expense[]>([]);
  const [savings,   setSavings]   = useState<SavingsGoal[]>([]);
  const [insights,  setInsights]  = useState<Insight[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview'|'income'|'expenses'|'savings'|'insights'>('overview');

  // Modal state
  type ModalType = 'targets'|'income'|'expense'|'savings'|null;
  const [modal,    setModal]    = useState<ModalType>(null);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [form,     setForm]     = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [sumR, incR, expR, savR, insR] = await Promise.all([
        apiFetch('/finances/summary'),
        apiFetch('/finances/income'),
        apiFetch('/finances/expenses'),
        apiFetch('/finances/savings'),
        apiFetch('/finances/insights'),
      ]);
      if (sumR.ok) {
        const s = await sumR.json() as Summary;
        setSummary(s);
        setTargets(s.targets);
      }
      if (incR.ok) setIncome(await incR.json());
      if (expR.ok) setExpenses(await expR.json());
      if (savR.ok) setSavings(await savR.json());
      if (insR.ok) setInsights(await insR.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function generateInsights() {
    setGenerating(true);
    try {
      const r = await apiFetch('/finances/insights/generate', { method: 'POST' });
      if (r.ok) {
        const { insights: fresh } = await r.json();
        setInsights(fresh ?? []);
        setActiveTab('insights');
      }
    } catch { /* silent */ } finally { setGenerating(false); }
  }

  async function markInsightRead(id: string) {
    await apiFetch(`/finances/insights/${id}/read`, { method: 'PATCH' });
    setInsights(p => p.map(i => i.id === id ? { ...i, is_read: true } : i));
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAdd(type: ModalType) {
    setModal(type);
    setEditId(null);
    if (type === 'income')  setForm({ type: 'salary', frequency: 'monthly', amount: '' });
    if (type === 'expense') setForm({ category: 'other', frequency: 'monthly', amount: '' });
    if (type === 'savings') setForm({ emoji: '🎯', color: GOAL_COLORS[0], target: '', saved: '0' });
    if (type === 'targets') setForm({
      income_target:    targets?.income_target    != null ? String(targets.income_target)    : '',
      profit_target:    targets?.profit_target    != null ? String(targets.profit_target)    : '',
      net_worth_target: targets?.net_worth_target != null ? String(targets.net_worth_target) : '',
      notes:            targets?.notes ?? '',
    });
  }

  function openEdit(type: 'income'|'expense'|'savings', item: IncomeSource|Expense|SavingsGoal) {
    setModal(type);
    setEditId(item.id);
    setForm(Object.fromEntries(Object.entries(item).map(([k, v]) => [k, String(v ?? '')])));
  }

  async function saveTargets() {
    setSaving(true);
    try {
      const payload = {
        income_target:    form.income_target    ? parseFloat(form.income_target)    : null,
        profit_target:    form.profit_target    ? parseFloat(form.profit_target)    : null,
        net_worth_target: form.net_worth_target ? parseFloat(form.net_worth_target) : null,
        notes: form.notes || null,
      };
      const r = await apiFetch('/finances/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) { setModal(null); fetchAll(); }
    } finally { setSaving(false); }
  }

  async function saveIncome() {
    setSaving(true);
    try {
      const payload = {
        name: form.name, type: form.type,
        amount: parseFloat(form.amount) || 0,
        frequency: form.frequency, notes: form.notes,
      };
      const url  = editId ? `/finances/income/${editId}` : '/finances/income';
      const meth = editId ? 'PATCH' : 'POST';
      const r = await apiFetch(url, { method: meth, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) { setModal(null); fetchAll(); }
    } finally { setSaving(false); }
  }

  async function saveExpense() {
    setSaving(true);
    try {
      const payload = {
        name: form.name, category: form.category,
        amount: parseFloat(form.amount) || 0,
        frequency: form.frequency, notes: form.notes,
      };
      const url  = editId ? `/finances/expenses/${editId}` : '/finances/expenses';
      const meth = editId ? 'PATCH' : 'POST';
      const r = await apiFetch(url, { method: meth, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) { setModal(null); fetchAll(); }
    } finally { setSaving(false); }
  }

  async function saveSavingsGoal() {
    setSaving(true);
    try {
      const payload = {
        name: form.name, emoji: form.emoji, color: form.color,
        target: parseFloat(form.target) || 0,
        saved:  parseFloat(form.saved)  || 0,
        deadline: form.deadline || null, notes: form.notes || null,
      };
      const url  = editId ? `/finances/savings/${editId}` : '/finances/savings';
      const meth = editId ? 'PATCH' : 'POST';
      const r = await apiFetch(url, { method: meth, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) { setModal(null); fetchAll(); }
    } finally { setSaving(false); }
  }

  async function deleteItem(type: 'income'|'expenses'|'savings', id: string) {
    await apiFetch(`/finances/${type}/${id}`, { method: 'DELETE' });
    if (type === 'income')   setIncome(p  => p.filter(x => x.id !== id));
    if (type === 'expenses') setExpenses(p => p.filter(x => x.id !== id));
    if (type === 'savings')  setSavings(p => p.filter(x => x.id !== id));
    fetchAll();
  }

  if (loading) return (
    <div className="finances-screen">
      <div className="finances-loading">Loading finances...</div>
    </div>
  );

  const unreadInsights = insights.filter(i => !i.is_read).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="finances-screen">

      {/* Header */}
      <div className="finances-header">
        <div className="finances-header-left">
          <div className="finances-title">
            <DollarSign size={18} style={{ color: '#34d399' }} />
            <span>Finances</span>
          </div>
          <p className="finances-subtitle">Raven tracks your money and coaches your growth</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="finances-generate-btn" onClick={fetchAll} aria-label="Refresh" style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} />
          </button>
          <button
            className="finances-generate-btn"
            onClick={generateInsights}
            disabled={generating}
            id="generate-insights-btn"
            title="Ask Raven to analyze your finances"
          >
            {generating
              ? <><RefreshCw size={13} className="spinning" /> Thinking...</>
              : <><Sparkles size={13} /> Ask Raven</>}
          </button>
        </div>
      </div>

      {/* Financial Goals Banner — always at the top */}
      <GoalsBanner targets={targets} summary={summary} onEdit={() => openAdd('targets')} />

      {/* Live Summary Strip */}
      {summary && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}
        >
          {[
            { label: 'Monthly Income',   value: summary.monthly_income,   color: '#34d399', icon: <TrendingUp size={14} /> },
            { label: 'Monthly Expenses', value: summary.monthly_expenses, color: '#f87171', icon: <Receipt size={14} /> },
            { label: summary.monthly_net >= 0 ? 'Monthly Profit' : 'Monthly Deficit',
              value: summary.monthly_net, color: summary.monthly_net >= 0 ? '#60a5fa' : '#f87171',
              icon: summary.monthly_net >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} /> },
          ].map(s => (
            <div key={s.label} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: s.color }}>
                {s.icon}
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-subtle)' }}>
                  {s.label}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, letterSpacing: '-0.5px' }}>
                {fmt(Math.abs(s.value))}
              </div>
              {s.label.includes('Profit') || s.label.includes('Deficit') ? (
                <div style={{ fontSize: 10, color: 'var(--color-text-subtle)', marginTop: 3 }}>
                  {summary.savings_rate.toFixed(1)}% savings rate
                </div>
              ) : null}
            </div>
          ))}
        </motion.div>
      )}

      {/* Tab Nav */}
      <div className="finances-tabs">
        {([
          { id: 'overview',  label: 'Overview',  icon: <BarChart3 size={12} /> },
          { id: 'income',    label: 'Income',    icon: <Briefcase size={12} /> },
          { id: 'expenses',  label: 'Expenses',  icon: <Receipt size={12} /> },
          { id: 'savings',   label: 'Savings',   icon: <PiggyBank size={12} /> },
          { id: 'insights',  label: unreadInsights > 0 ? `Insights (${unreadInsights})` : 'Insights',
            icon: <Sparkles size={12} /> },
        ] as const).map(t => (
          <button
            key={t.id}
            className={`finances-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            id={`finances-tab-${t.id}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="finances-overview">
              {income.length === 0 && expenses.length === 0 ? (
                <div className="finances-empty">
                  <DollarSign size={36} opacity={0.2} />
                  <p>Add income sources and expenses to see your picture.</p>
                </div>
              ) : (
                <>
                  {/* Income breakdown */}
                  {income.length > 0 && (
                    <div className="finances-breakdown">
                      <div className="finances-section-title">
                        <Briefcase size={13} style={{ color: '#34d399' }} /> Income Streams
                      </div>
                      {income.map(src => (
                        <div key={src.id} className="finances-mini-row">
                          <span className="finances-mini-icon">{INCOME_ICONS[src.type] ?? '💵'}</span>
                          <span className="finances-mini-name">{src.name}</span>
                          <span className="finances-mini-sub">{fmtFreq(src.frequency)}</span>
                          <span className="finances-mini-val" style={{ color: '#34d399' }}>{fmt(src.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expenses breakdown */}
                  {expenses.length > 0 && (
                    <div className="finances-breakdown" style={{ marginTop: 14 }}>
                      <div className="finances-section-title">
                        <Receipt size={13} style={{ color: '#f87171' }} /> Expenses
                      </div>
                      {expenses.map(exp => (
                        <div key={exp.id} className="finances-mini-row">
                          <span className="finances-mini-icon">{EXPENSE_ICONS[exp.category] ?? '📦'}</span>
                          <span className="finances-mini-name">{exp.name}</span>
                          <span className="finances-mini-sub">{fmtFreq(exp.frequency)}</span>
                          <span className="finances-mini-val" style={{ color: '#f87171' }}>{fmt(exp.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Net line */}
                  {summary && (income.length > 0 || expenses.length > 0) && (
                    <div style={{
                      marginTop: 14, padding: '12px 16px',
                      background: summary.monthly_net >= 0 ? 'rgba(52,211,153,0.07)' : 'rgba(248,113,113,0.07)',
                      border: `1px solid ${summary.monthly_net >= 0 ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                      borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {summary.monthly_net >= 0 ? '✅ Monthly Profit' : '⚠️ Monthly Deficit'}
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: summary.monthly_net >= 0 ? '#34d399' : '#f87171' }}>
                        {summary.monthly_net >= 0 ? '+' : ''}{fmt(summary.monthly_net)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Income Tab ── */}
          {activeTab === 'income' && (
            <div className="finances-list-section">
              <div className="finances-list-header">
                <span className="finances-section-title"><Briefcase size={13} /> Income Sources</span>
                <button className="finances-add-btn" onClick={() => openAdd('income')} id="add-income-btn">
                  <Plus size={13} /> Add Income
                </button>
              </div>
              {income.length === 0 ? (
                <div className="finances-empty">
                  <TrendingUp size={28} opacity={0.2} />
                  <p>No income sources yet. Add your salary, freelance, investments.</p>
                </div>
              ) : income.map((src, i) => (
                <motion.div key={src.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }} className="finances-item-card">
                  <div className="finances-item-icon">{INCOME_ICONS[src.type] ?? '💵'}</div>
                  <div className="finances-item-body">
                    <div className="finances-item-name">{src.name}</div>
                    <div className="finances-item-sub">{src.type} · {fmtFreq(src.frequency)}</div>
                  </div>
                  <div className="finances-item-amount" style={{ color: '#34d399' }}>
                    {fmt(src.amount)} <span style={{ fontSize: 10, opacity: 0.6 }}>{fmtFreq(src.frequency)}</span>
                  </div>
                  <div className="finances-item-actions">
                    <button onClick={() => openEdit('income', src)} aria-label="Edit" className="finances-icon-btn"><Pencil size={12} /></button>
                    <button onClick={() => deleteItem('income', src.id)} aria-label="Delete" className="finances-icon-btn danger"><Trash2 size={12} /></button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Expenses Tab ── */}
          {activeTab === 'expenses' && (
            <div className="finances-list-section">
              <div className="finances-list-header">
                <span className="finances-section-title"><Receipt size={13} /> Expenses</span>
                <button className="finances-add-btn" onClick={() => openAdd('expense')} id="add-expense-btn">
                  <Plus size={13} /> Add Expense
                </button>
              </div>
              {expenses.length === 0 ? (
                <div className="finances-empty">
                  <Wallet size={28} opacity={0.2} />
                  <p>No expenses tracked yet. Add rent, food, subscriptions, etc.</p>
                </div>
              ) : expenses.map((exp, i) => (
                <motion.div key={exp.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }} className="finances-item-card">
                  <div className="finances-item-icon">{EXPENSE_ICONS[exp.category] ?? '📦'}</div>
                  <div className="finances-item-body">
                    <div className="finances-item-name">{exp.name}</div>
                    <div className="finances-item-sub">{exp.category} · {fmtFreq(exp.frequency)}</div>
                  </div>
                  <div className="finances-item-amount" style={{ color: '#f87171' }}>
                    {fmt(exp.amount)} <span style={{ fontSize: 10, opacity: 0.6 }}>{fmtFreq(exp.frequency)}</span>
                  </div>
                  <div className="finances-item-actions">
                    <button onClick={() => openEdit('expense', exp)} aria-label="Edit" className="finances-icon-btn"><Pencil size={12} /></button>
                    <button onClick={() => deleteItem('expenses', exp.id)} aria-label="Delete" className="finances-icon-btn danger"><Trash2 size={12} /></button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Savings Tab ── */}
          {activeTab === 'savings' && (
            <div className="finances-list-section">
              <div className="finances-list-header">
                <span className="finances-section-title"><PiggyBank size={13} /> Savings Goals</span>
                <button className="finances-add-btn" onClick={() => openAdd('savings')} id="add-savings-btn">
                  <Plus size={13} /> New Goal
                </button>
              </div>
              {savings.filter(g => !g.achieved).length === 0 && savings.filter(g => g.achieved).length === 0 ? (
                <div className="finances-empty">
                  <PiggyBank size={28} opacity={0.2} />
                  <p>No savings goals yet. Add an emergency fund, vacation, or big purchase.</p>
                </div>
              ) : (
                <>
                  {savings.filter(g => !g.achieved).map((goal, i) => {
                    const pct = progressPct(goal.saved, goal.target);
                    return (
                      <motion.div key={goal.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        style={{
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                          borderRadius: 12, padding: '16px 18px', marginBottom: 8,
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: 22 }}>{goal.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{goal.name}</div>
                            {goal.deadline && (
                              <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 1 }}>
                                By {new Date(goal.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: goal.color }}>{fmt(goal.saved)}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-subtle)' }}>of {fmt(goal.target)}</div>
                          </div>
                          <div className="finances-item-actions">
                            <button onClick={() => openEdit('savings', goal)} aria-label="Edit" className="finances-icon-btn"><Pencil size={12} /></button>
                            <button onClick={() => deleteItem('savings', goal.id)} aria-label="Delete" className="finances-icon-btn danger"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <div style={{ height: 6, borderRadius: 100, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                            style={{ height: '100%', borderRadius: 100, background: goal.color }}
                          />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-subtle)', marginTop: 5, textAlign: 'right' }}>
                          {pct.toFixed(0)}% · {fmt(goal.target - goal.saved)} remaining
                        </div>
                      </motion.div>
                    );
                  })}
                  {savings.filter(g => g.achieved).length > 0 && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10,
                      background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
                      fontSize: 12, color: '#34d399', fontWeight: 600 }}>
                      🎉 {savings.filter(g => g.achieved).length} goal{savings.filter(g => g.achieved).length > 1 ? 's' : ''} achieved!
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Insights Tab ── */}
          {activeTab === 'insights' && (
            <div className="finances-list-section">
              <div className="finances-list-header">
                <span className="finances-section-title"><Sparkles size={13} /> Raven&apos;s Analysis</span>
                <button className="finances-add-btn" onClick={generateInsights} disabled={generating}>
                  {generating ? <><RefreshCw size={12} className="spinning" /> Thinking...</> : <><Sparkles size={12} /> Generate</>}
                </button>
              </div>
              {insights.length === 0 ? (
                <div className="finances-empty">
                  <Sparkles size={28} opacity={0.2} />
                  <p>No insights yet. Hit &ldquo;Ask Raven&rdquo; to get a financial analysis.</p>
                </div>
              ) : insights.map((ins, i) => {
                const cfg = INSIGHT_CONFIG[ins.type] ?? INSIGHT_CONFIG.insight;
                return (
                  <motion.div
                    key={ins.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="finances-insight-card"
                    style={{
                      background: cfg.bg,
                      borderColor: ins.is_read ? 'rgba(255,255,255,0.05)' : cfg.color + '40',
                      opacity: ins.is_read ? 0.6 : 1,
                      cursor: ins.is_read ? 'default' : 'pointer',
                    }}
                    onClick={() => !ins.is_read && markInsightRead(ins.id)}
                  >
                    <div className="finances-insight-header">
                      <span style={{ color: cfg.color }}>{cfg.icon}</span>
                      <span className="finances-insight-title" style={{ color: cfg.color }}>{ins.title}</span>
                      <span className="finances-insight-type">{ins.type}</span>
                    </div>
                    <p className="finances-insight-content">{ins.content}</p>
                  </motion.div>
                );
              })}
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="finances-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setModal(null)}
          >
            <motion.div
              className="finances-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="finances-modal-header">
                <span>
                  {modal === 'targets' ? '🎯 Financial Goals'
                  : modal === 'income' ? (editId ? 'Edit Income Source' : 'Add Income Source')
                  : modal === 'expense' ? (editId ? 'Edit Expense' : 'Add Expense')
                  : (editId ? 'Edit Savings Goal' : 'New Savings Goal')}
                </span>
                <button className="finances-modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={14} /></button>
              </div>

              {/* Targets form */}
              {modal === 'targets' && (
                <div className="finances-modal-form">
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4, lineHeight: 1.6 }}>
                    Set your aspirational monthly targets. Raven will track your progress and coach you toward them.
                  </p>
                  <label className="finances-label">Desired Monthly Income</label>
                  <input className="finances-input" type="number" min="0" placeholder="e.g. 10000"
                    value={form.income_target ?? ''} onChange={e => setForm(p => ({ ...p, income_target: e.target.value }))} autoFocus />
                  <label className="finances-label">Desired Monthly Profit (take-home after expenses)</label>
                  <input className="finances-input" type="number" min="0" placeholder="e.g. 3000"
                    value={form.profit_target ?? ''} onChange={e => setForm(p => ({ ...p, profit_target: e.target.value }))} />
                  <label className="finances-label">Net Worth Goal (optional)</label>
                  <input className="finances-input" type="number" min="0" placeholder="e.g. 500000"
                    value={form.net_worth_target ?? ''} onChange={e => setForm(p => ({ ...p, net_worth_target: e.target.value }))} />
                  <label className="finances-label">Notes (optional)</label>
                  <textarea className="finances-input" rows={2} style={{ resize: 'none' }}
                    placeholder="Why these numbers matter to you..."
                    value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                  <button className="finances-save-btn" onClick={saveTargets} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Goals'}
                  </button>
                </div>
              )}

              {/* Income form */}
              {modal === 'income' && (
                <div className="finances-modal-form">
                  <input className="finances-input" placeholder="Name (e.g. Day Job, Freelance Design)"
                    value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <div className="finances-input-row">
                    <select className="finances-select" value={form.type ?? 'salary'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                      {INCOME_TYPES.map(t => <option key={t} value={t}>{INCOME_ICONS[t]} {t}</option>)}
                    </select>
                    <select className="finances-select" value={form.frequency ?? 'monthly'} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{fmtFreq(f)}</option>)}
                    </select>
                  </div>
                  <input className="finances-input" type="number" min="0" placeholder="Amount ($)"
                    value={form.amount ?? ''} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                  <textarea className="finances-input" rows={2} style={{ resize: 'none' }} placeholder="Notes (optional)"
                    value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                  <button className="finances-save-btn" onClick={saveIncome} disabled={saving}>
                    {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Income'}
                  </button>
                </div>
              )}

              {/* Expense form */}
              {modal === 'expense' && (
                <div className="finances-modal-form">
                  <input className="finances-input" placeholder="Name (e.g. Rent, Netflix, Gym)"
                    value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <div className="finances-input-row">
                    <select className="finances-select" value={form.category ?? 'other'} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                      {EXPENSE_CATS.map(c => <option key={c} value={c}>{EXPENSE_ICONS[c]} {c}</option>)}
                    </select>
                    <select className="finances-select" value={form.frequency ?? 'monthly'} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{fmtFreq(f)}</option>)}
                    </select>
                  </div>
                  <input className="finances-input" type="number" min="0" placeholder="Amount ($)"
                    value={form.amount ?? ''} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                  <textarea className="finances-input" rows={2} style={{ resize: 'none' }} placeholder="Notes (optional)"
                    value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                  <button className="finances-save-btn" onClick={saveExpense} disabled={saving}>
                    {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Expense'}
                  </button>
                </div>
              )}

              {/* Savings Goal form */}
              {modal === 'savings' && (
                <div className="finances-modal-form">
                  <input className="finances-input" placeholder="Goal name (e.g. Emergency Fund, MacBook)"
                    value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <div className="finances-input-row">
                    <input className="finances-input" placeholder="Emoji (e.g. 🏠)"
                      value={form.emoji ?? '🎯'} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))}
                      style={{ flex: 0.5, textAlign: 'center', fontSize: 20 }} />
                    <input className="finances-input" type="number" min="0" placeholder="Target ($)"
                      value={form.target ?? ''} onChange={e => setForm(p => ({ ...p, target: e.target.value }))} />
                    <input className="finances-input" type="number" min="0" placeholder="Saved so far ($)"
                      value={form.saved ?? '0'} onChange={e => setForm(p => ({ ...p, saved: e.target.value }))} />
                  </div>
                  <input className="finances-input" type="date" placeholder="Deadline (optional)"
                    value={form.deadline ?? ''} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
                  <div className="finances-color-picker">
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Color</span>
                    <div className="finances-color-swatches">
                      {GOAL_COLORS.map(c => (
                        <button key={c}
                          className={`finances-color-swatch ${form.color === c ? 'selected' : ''}`}
                          style={{ background: c }} onClick={() => setForm(p => ({ ...p, color: c }))}
                          aria-label={c} />
                      ))}
                    </div>
                  </div>
                  <button className="finances-save-btn" onClick={saveSavingsGoal} disabled={saving}>
                    {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Goal'}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
