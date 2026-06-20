'use client';
import { apiFetch } from '../lib/api';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Wallet, PiggyBank, Plus, Pencil, Trash2, X,
  Sparkles, RefreshCw, ChevronDown, ChevronUp, DollarSign,
  Building2, Briefcase, BarChart3, AlertCircle, Lightbulb, Target,
} from 'lucide-react';
import { Collapse } from './Collapse';

// ── Types ──────────────────────────────────────────────────────

interface Account {
  id: string; name: string; institution?: string; type: string;
  balance: number; currency: string; last_synced?: string; notes?: string;
}
interface IncomeSource {
  id: string; name: string; type: string; amount: number;
  frequency: string; notes?: string; is_active: boolean;
}
interface BudgetCategory {
  id: string; name: string; monthly_limit: number; color: string;
  icon?: string; sort_order: number;
}
interface Insight {
  id: string; type: 'insight' | 'alert' | 'opportunity' | 'goal';
  title: string; content: string; priority: number; is_read: boolean; created_at: string;
}
interface Summary {
  monthly_income: number; monthly_budget: number; monthly_savings: number;
  savings_rate: number; net_worth: number; account_count: number;
}

// ── Constants ──────────────────────────────────────────────────

const ACCOUNT_TYPES = ['checking','savings','credit','investment','loan','other'];
const INCOME_TYPES  = ['salary','freelance','business','investment','rental','side_hustle','other'];
const FREQUENCIES   = ['weekly','biweekly','monthly','quarterly','annual','variable'];

const ACCOUNT_ICONS: Record<string, string> = {
  checking: '🏦', savings: '💰', credit: '💳',
  investment: '📈', loan: '📋', other: '🏧',
};
const INCOME_ICONS: Record<string, string> = {
  salary: '💼', freelance: '🎨', business: '🏢',
  investment: '📈', rental: '🏠', side_hustle: '⚡', other: '💵',
};
const INSIGHT_CONFIG = {
  insight:     { icon: <Lightbulb size={14} />, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  alert:       { icon: <AlertCircle size={14} />, color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  opportunity: { icon: <TrendingUp size={14} />, color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  goal:        { icon: <Target size={14} />, color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
};

const BUDGET_COLORS = [
  '#6366f1','#a78bfa','#f472b6','#fb923c','#fbbf24',
  '#34d399','#22d3ee','#60a5fa','#f87171','#94a3b8',
];

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtFreq(f: string) {
  return { weekly:'/ week', biweekly:'/ 2 weeks', monthly:'/ mo', quarterly:'/ qtr', annual:'/ yr', variable:'variable' }[f] ?? f;
}

// ── Summary Ring ───────────────────────────────────────────────

function SavingsRing({ rate }: { rate: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, rate));
  const offset = circ * (1 - pct / 100);
  const color = pct >= 20 ? '#34d399' : pct >= 10 ? '#fbbf24' : '#f87171';

  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
      <circle
        cx={50} cy={50} r={r} fill="none"
        stroke={color} strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x={50} y={46} textAnchor="middle" fill={color} fontSize={13} fontWeight="700">{pct.toFixed(0)}%</text>
      <text x={50} y={60} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={8}>saved</text>
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function FinancesScreen() {
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [income, setIncome]       = useState<IncomeSource[]>([]);
  const [budget, setBudget]       = useState<BudgetCategory[]>([]);
  const [insights, setInsights]   = useState<Insight[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview'|'accounts'|'income'|'budget'>('overview');

  // Modal state
  const [modal, setModal] = useState<'account'|'income'|'budget'|null>(null);
  const [editItem, setEditItem] = useState<Account|IncomeSource|BudgetCategory|null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    try {
      const [sumR, accR, incR, budR, insR] = await Promise.all([
        apiFetch('/finances/summary'),
        apiFetch('/finances/accounts'),
        apiFetch('/finances/income'),
        apiFetch('/finances/budget'),
        apiFetch('/finances/insights'),
      ]);
      if (sumR.ok) setSummary(await sumR.json());
      if (accR.ok) setAccounts(await accR.json());
      if (incR.ok) setIncome(await incR.json());
      if (budR.ok) setBudget(await budR.json());
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
      }
    } catch { /* silent */ } finally { setGenerating(false); }
  }

  async function markInsightRead(id: string) {
    await apiFetch(`/finances/insights/${id}/read`, { method: 'PATCH' });
    setInsights(p => p.map(i => i.id === id ? { ...i, is_read: true } : i));
  }

  // ── CRUD helpers ────────────────────────────────────────────

  function openModal(type: 'account'|'income'|'budget', item?: Account|IncomeSource|BudgetCategory) {
    setModal(type);
    setEditItem(item ?? null);
    if (item) {
      setForm(Object.fromEntries(Object.entries(item).map(([k, v]) => [k, String(v ?? '')])));
    } else {
      setForm(type === 'account' ? { type: 'checking', currency: 'USD', balance: '0' }
            : type === 'income'  ? { type: 'salary', frequency: 'monthly', amount: '0' }
            : { color: BUDGET_COLORS[budget.length % BUDGET_COLORS.length], monthly_limit: '0' });
    }
  }

  async function saveAccount() {
    const payload = {
      name: form.name, institution: form.institution, type: form.type,
      balance: parseFloat(form.balance) || 0, currency: form.currency, notes: form.notes,
    };
    if (editItem) {
      const r = await apiFetch(`/finances/accounts/${editItem.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) setAccounts(p => p.map(a => a.id === editItem.id ? { ...a, ...payload } : a));
    } else {
      const r = await apiFetch('/finances/accounts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) { const d = await r.json(); setAccounts(p => [...p, d]); }
    }
    setModal(null); fetchAll();
  }

  async function saveIncome() {
    const payload = { name: form.name, type: form.type, amount: parseFloat(form.amount) || 0, frequency: form.frequency, notes: form.notes };
    if (editItem) {
      const r = await apiFetch(`/finances/income/${editItem.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) setIncome(p => p.map(i => i.id === editItem.id ? { ...i, ...payload } : i));
    } else {
      const r = await apiFetch('/finances/income', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) { const d = await r.json(); setIncome(p => [...p, d]); }
    }
    setModal(null); fetchAll();
  }

  async function saveBudget() {
    const payload = { name: form.name, monthly_limit: parseFloat(form.monthly_limit) || 0, color: form.color, icon: form.icon };
    if (editItem) {
      const r = await apiFetch(`/finances/budget/${editItem.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) setBudget(p => p.map(b => b.id === editItem.id ? { ...b, ...payload } : b));
    } else {
      const r = await apiFetch('/finances/budget', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.ok) { const d = await r.json(); setBudget(p => [...p, d]); }
    }
    setModal(null); fetchAll();
  }

  async function deleteItem(type: 'account'|'income'|'budget', id: string) {
    await apiFetch(`/finances/${type === 'account' ? 'accounts' : type === 'income' ? 'income' : 'budget'}/${id}`, { method: 'DELETE' });
    if (type === 'account') setAccounts(p => p.filter(a => a.id !== id));
    if (type === 'income')  setIncome(p => p.filter(i => i.id !== id));
    if (type === 'budget')  setBudget(p => p.filter(b => b.id !== id));
    fetchAll();
  }

  if (loading) return <div className="finances-screen"><div className="finances-loading">Loading finances...</div></div>;

  const totalBudget = budget.reduce((s, b) => s + Number(b.monthly_limit), 0);

  // ── Render ──────────────────────────────────────────────────

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
        <button
          className="finances-generate-btn"
          onClick={generateInsights}
          disabled={generating}
          id="generate-insights-btn"
          title="Ask Raven to analyze your finances and generate insights"
        >
          {generating
            ? <><RefreshCw size={13} className="spinning" /> Thinking...</>
            : <><Sparkles size={13} /> Ask Raven</>}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="finances-summary">
          <div className="finances-ring-card">
            <SavingsRing rate={summary.savings_rate} />
            <div className="finances-ring-stats">
              <div className="finances-ring-stat">
                <span className="finances-ring-label">Monthly Income</span>
                <span className="finances-ring-val" style={{ color: '#34d399' }}>{fmt(summary.monthly_income)}</span>
              </div>
              <div className="finances-ring-stat">
                <span className="finances-ring-label">Monthly Budget</span>
                <span className="finances-ring-val" style={{ color: '#f87171' }}>{fmt(summary.monthly_budget)}</span>
              </div>
              <div className="finances-ring-stat">
                <span className="finances-ring-label">Est. Savings</span>
                <span className="finances-ring-val" style={{ color: summary.monthly_savings >= 0 ? '#34d399' : '#f87171' }}>
                  {fmt(summary.monthly_savings)}
                </span>
              </div>
            </div>
          </div>
          <div className="finances-net-worth-card">
            <div className="finances-nw-label">Net Worth</div>
            <div className="finances-nw-value" style={{ color: summary.net_worth >= 0 ? '#a78bfa' : '#f87171' }}>
              {fmt(summary.net_worth)}
            </div>
            <div className="finances-nw-sub">{summary.account_count} account{summary.account_count !== 1 ? 's' : ''} tracked</div>
          </div>
        </div>
      )}

      {/* Raven Insights */}
      {insights.length > 0 && (
        <div className="finances-insights">
          <div className="finances-section-title">
            <Sparkles size={13} style={{ color: '#a78bfa' }} /> Raven&apos;s Analysis
          </div>
          <div className="finances-insights-list">
            {insights.map(ins => {
              const cfg = INSIGHT_CONFIG[ins.type] ?? INSIGHT_CONFIG.insight;
              return (
                <motion.div
                  key={ins.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="finances-insight-card"
                  style={{
                    background: cfg.bg,
                    borderColor: ins.is_read ? 'rgba(255,255,255,0.05)' : cfg.color + '40',
                    opacity: ins.is_read ? 0.6 : 1,
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
        </div>
      )}

      {/* Tab Nav */}
      <div className="finances-tabs">
        {(['overview','accounts','income','budget'] as const).map(t => (
          <button
            key={t}
            className={`finances-tab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
            id={`finances-tab-${t}`}
          >
            {t === 'overview' ? <BarChart3 size={12} /> : t === 'accounts' ? <Building2 size={12} /> : t === 'income' ? <Briefcase size={12} /> : <PiggyBank size={12} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
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

          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="finances-overview">
              {accounts.length === 0 && income.length === 0 && budget.length === 0 ? (
                <div className="finances-empty">
                  <DollarSign size={36} opacity={0.2} />
                  <p>Add accounts and income to get started.</p>
                  <p style={{ fontSize: 12, opacity: 0.5 }}>Raven will analyze your finances and provide tailored insights.</p>
                </div>
              ) : (
                <>
                  {/* Budget Breakdown */}
                  {budget.length > 0 && (
                    <div className="finances-breakdown">
                      <div className="finances-section-title"><PiggyBank size={13} /> Budget Breakdown</div>
                      <div className="finances-budget-bars">
                        {budget.map(cat => {
                          const pct = totalBudget > 0 ? (cat.monthly_limit / totalBudget) * 100 : 0;
                          return (
                            <div key={cat.id} className="finances-budget-bar-row">
                              <div className="finances-budget-bar-label">
                                <span style={{ color: cat.color }}>{cat.icon ?? '●'}</span>
                                <span>{cat.name}</span>
                              </div>
                              <div className="finances-budget-bar-track">
                                <motion.div
                                  className="finances-budget-bar-fill"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.6, ease: 'easeOut' }}
                                  style={{ background: cat.color }}
                                />
                              </div>
                              <span className="finances-budget-bar-amt">{fmt(cat.monthly_limit)}</span>
                            </div>
                          );
                        })}
                        <div className="finances-budget-total">
                          Total budget: <strong>{fmt(totalBudget)}</strong> / mo
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Accounts mini list */}
                  {accounts.length > 0 && (
                    <div className="finances-breakdown" style={{ marginTop: 14 }}>
                      <div className="finances-section-title"><Building2 size={13} /> Accounts</div>
                      {accounts.slice(0, 4).map(a => (
                        <div key={a.id} className="finances-mini-row">
                          <span className="finances-mini-icon">{ACCOUNT_ICONS[a.type] ?? '🏧'}</span>
                          <span className="finances-mini-name">{a.name}</span>
                          <span className="finances-mini-sub">{a.institution}</span>
                          <span className="finances-mini-val" style={{ color: a.type === 'loan' || a.type === 'credit' ? '#f87171' : '#34d399' }}>
                            {a.type === 'loan' || a.type === 'credit' ? '-' : ''}{fmt(Math.abs(a.balance))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Accounts Tab */}
          {activeTab === 'accounts' && (
            <div className="finances-list-section">
              <div className="finances-list-header">
                <span className="finances-section-title"><Building2 size={13} /> Bank Accounts</span>
                <button className="finances-add-btn" onClick={() => openModal('account')} id="add-account-btn">
                  <Plus size={13} /> Add Account
                </button>
              </div>
              {accounts.length === 0 ? (
                <div className="finances-empty">
                  <Building2 size={28} opacity={0.2} />
                  <p>No accounts yet. Add your checking, savings, investments.</p>
                </div>
              ) : accounts.map((acc, i) => (
                <motion.div key={acc.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="finances-item-card">
                  <div className="finances-item-icon">{ACCOUNT_ICONS[acc.type] ?? '🏧'}</div>
                  <div className="finances-item-body">
                    <div className="finances-item-name">{acc.name}</div>
                    <div className="finances-item-sub">{acc.institution ?? ''} · {acc.type}</div>
                  </div>
                  <div className="finances-item-amount" style={{ color: acc.type === 'loan' || acc.type === 'credit' ? '#f87171' : '#34d399' }}>
                    {acc.type === 'loan' || acc.type === 'credit' ? '-' : ''}{fmt(Math.abs(acc.balance))}
                  </div>
                  <div className="finances-item-actions">
                    <button onClick={() => openModal('account', acc)} aria-label="Edit" className="finances-icon-btn"><Pencil size={12} /></button>
                    <button onClick={() => deleteItem('account', acc.id)} aria-label="Delete" className="finances-icon-btn danger"><Trash2 size={12} /></button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Income Tab */}
          {activeTab === 'income' && (
            <div className="finances-list-section">
              <div className="finances-list-header">
                <span className="finances-section-title"><Briefcase size={13} /> Income Sources</span>
                <button className="finances-add-btn" onClick={() => openModal('income')} id="add-income-btn">
                  <Plus size={13} /> Add Income
                </button>
              </div>
              {income.length === 0 ? (
                <div className="finances-empty">
                  <TrendingUp size={28} opacity={0.2} />
                  <p>No income sources. Add salary, freelance, investments.</p>
                </div>
              ) : income.map((src, i) => (
                <motion.div key={src.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="finances-item-card">
                  <div className="finances-item-icon">{INCOME_ICONS[src.type] ?? '💵'}</div>
                  <div className="finances-item-body">
                    <div className="finances-item-name">{src.name}</div>
                    <div className="finances-item-sub">{src.type} · {fmtFreq(src.frequency)}</div>
                  </div>
                  <div className="finances-item-amount" style={{ color: '#34d399' }}>
                    {fmt(src.amount)} <span style={{ fontSize: 10, opacity: 0.6 }}>{fmtFreq(src.frequency)}</span>
                  </div>
                  <div className="finances-item-actions">
                    <button onClick={() => openModal('income', src)} aria-label="Edit" className="finances-icon-btn"><Pencil size={12} /></button>
                    <button onClick={() => deleteItem('income', src.id)} aria-label="Delete" className="finances-icon-btn danger"><Trash2 size={12} /></button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Budget Tab */}
          {activeTab === 'budget' && (
            <div className="finances-list-section">
              <div className="finances-list-header">
                <span className="finances-section-title"><PiggyBank size={13} /> Budget Categories</span>
                <button className="finances-add-btn" onClick={() => openModal('budget')} id="add-budget-btn">
                  <Plus size={13} /> Add Category
                </button>
              </div>
              {budget.length === 0 ? (
                <div className="finances-empty">
                  <PiggyBank size={28} opacity={0.2} />
                  <p>No budget categories. Add housing, food, transport, etc.</p>
                </div>
              ) : budget.map((cat, i) => (
                <motion.div key={cat.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="finances-item-card">
                  <div className="finances-item-color-dot" style={{ background: cat.color }} />
                  <div className="finances-item-body">
                    <div className="finances-item-name">{cat.name}</div>
                    <div className="finances-budget-pct-label">
                      {totalBudget > 0 ? `${((cat.monthly_limit / totalBudget) * 100).toFixed(0)}% of budget` : '—'}
                    </div>
                  </div>
                  <div className="finances-item-amount" style={{ color: cat.color }}>{fmt(cat.monthly_limit)}<span style={{ fontSize: 10, opacity: 0.5 }}>/mo</span></div>
                  <div className="finances-item-actions">
                    <button onClick={() => openModal('budget', cat)} aria-label="Edit" className="finances-icon-btn"><Pencil size={12} /></button>
                    <button onClick={() => deleteItem('budget', cat.id)} aria-label="Delete" className="finances-icon-btn danger"><Trash2 size={12} /></button>
                  </div>
                </motion.div>
              ))}
              {budget.length > 0 && (
                <div className="finances-budget-footer">
                  Total: <strong>{fmt(totalBudget)}</strong> / month
                  {summary && summary.monthly_income > 0 && (
                    <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontSize: 11 }}>
                      ({((totalBudget / summary.monthly_income) * 100).toFixed(0)}% of income)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="finances-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
                <span>{editItem ? 'Edit' : 'Add'} {modal === 'account' ? 'Account' : modal === 'income' ? 'Income Source' : 'Budget Category'}</span>
                <button className="finances-modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={14} /></button>
              </div>

              {modal === 'account' && (
                <div className="finances-modal-form">
                  <input className="finances-input" placeholder="Account name (e.g. Chase Checking)" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <input className="finances-input" placeholder="Institution (e.g. Chase, Fidelity)" value={form.institution ?? ''} onChange={e => setForm(p => ({ ...p, institution: e.target.value }))} />
                  <div className="finances-input-row">
                    <select className="finances-select" value={form.type ?? 'checking'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                      {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_ICONS[t]} {t}</option>)}
                    </select>
                    <input className="finances-input" type="number" placeholder="Balance" value={form.balance ?? '0'} onChange={e => setForm(p => ({ ...p, balance: e.target.value }))} style={{ flex: 1 }} />
                  </div>
                  <textarea className="finances-input" placeholder="Notes (optional)" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ resize: 'none' }} />
                  <button className="finances-save-btn" onClick={saveAccount}>Save Account</button>
                </div>
              )}

              {modal === 'income' && (
                <div className="finances-modal-form">
                  <input className="finances-input" placeholder="Income name (e.g. Day Job, Freelance Design)" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <div className="finances-input-row">
                    <select className="finances-select" value={form.type ?? 'salary'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                      {INCOME_TYPES.map(t => <option key={t} value={t}>{INCOME_ICONS[t]} {t}</option>)}
                    </select>
                    <select className="finances-select" value={form.frequency ?? 'monthly'} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{fmtFreq(f)}</option>)}
                    </select>
                  </div>
                  <input className="finances-input" type="number" placeholder="Amount" value={form.amount ?? '0'} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                  <textarea className="finances-input" placeholder="Notes (optional)" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ resize: 'none' }} />
                  <button className="finances-save-btn" onClick={saveIncome}>Save Income</button>
                </div>
              )}

              {modal === 'budget' && (
                <div className="finances-modal-form">
                  <input className="finances-input" placeholder="Category name (e.g. Housing, Food, Transport)" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <input className="finances-input" placeholder="Emoji icon (optional, e.g. 🏠)" value={form.icon ?? ''} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} />
                  <input className="finances-input" type="number" placeholder="Monthly limit ($)" value={form.monthly_limit ?? '0'} onChange={e => setForm(p => ({ ...p, monthly_limit: e.target.value }))} />
                  <div className="finances-color-picker">
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Color</span>
                    <div className="finances-color-swatches">
                      {BUDGET_COLORS.map(c => (
                        <button
                          key={c}
                          className={`finances-color-swatch ${form.color === c ? 'selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setForm(p => ({ ...p, color: c }))}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  </div>
                  <button className="finances-save-btn" onClick={saveBudget}>Save Category</button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
