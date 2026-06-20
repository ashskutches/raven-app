'use client';

/**
 * ShoppingScreen — Raven's Amazon budget & spend tracker
 *
 * Sections:
 *   - Budget ring: monthly spend vs cap, per-item cap
 *   - Recommendations: this month's picks with buy/skip/delete controls
 *   - History: last 6 months collapsed by month
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, DollarSign, Package, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, ExternalLink, Trash2, RefreshCw, Sparkles,
  Heart, Plus, Link, Star,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/* ── Types ───────────────────────────────────────── */

interface BudgetStatus {
  spent: number;
  remaining: number;
  cap: number;
  perItemCap: number;
}

interface Recommendation {
  id: string;
  product_title: string;
  amazon_url: string;
  estimated_price: number;
  rationale: string;
  status: 'recommended' | 'purchased' | 'declined' | 'expired';
  month_key: string;
  recommended_at: string;
  resolved_at: string | null;
}

interface WishlistItem {
  id: string;
  title: string;
  url: string | null;
  price: number | null;
  category: string | null;
  notes: string | null;
  priority: number;     // 1–5, higher = more wanted
  purchased: boolean;
  created_at: string;
}

/* ── Helpers ─────────────────────────────────────── */

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  recommended: { label: 'Pending',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  purchased:   { label: 'Purchased', color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  declined:    { label: 'Declined',  color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  expired:     { label: 'Expired',   color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
};

/* ── Budget Ring ─────────────────────────────────── */

function BudgetRing({ budget }: { budget: BudgetStatus }) {
  const pct = Math.min(budget.spent / budget.cap, 1);
  const r = 48;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct);
  const color = pct > 0.9 ? '#f87171' : pct > 0.7 ? '#fb923c' : '#34d399';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      {/* Ring */}
      <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
        <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
          <motion.circle
            cx="60" cy="60" r={r} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: dash }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            strokeLinecap="round"
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, color }}>{Math.round(pct * 100)}%</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-subtle)', marginTop: 2 }}>used</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <StatRow label="Spent this month" value={fmtUSD(budget.spent)} valueColor={color} />
        <StatRow label="Remaining"        value={fmtUSD(budget.remaining)} valueColor="var(--color-text)" />
        <StatRow label="Monthly cap"      value={fmtUSD(budget.cap)}       valueColor="var(--color-text-subtle)" />
        <StatRow label="Per-item cap"     value={fmtUSD(budget.perItemCap)} valueColor="var(--color-text-subtle)" />
      </div>
    </div>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-subtle)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: valueColor }}>{value}</span>
    </div>
  );
}

/* ── Recommendation Card ─────────────────────────── */

function RecCard({
  item, onStatus, onDelete,
}: {
  item: Recommendation;
  onStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading]   = useState(false);
  const meta  = STATUS_META[item.status] ?? STATUS_META.recommended;
  const isPending = item.status === 'recommended';

  const act = async (status: string) => {
    setLoading(true);
    await onStatus(item.id, status);
    setLoading(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12, overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Package size={17} color="#fff" />
        </div>

        {/* Title + price */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.product_title}
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 2 }}>
            {fmtUSD(item.estimated_price)} · {new Date(item.recommended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        </div>

        {/* Status badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
          background: meta.bg, color: meta.color, flexShrink: 0,
        }}>
          {meta.label}
        </span>

        {expanded ? <ChevronUp size={14} color="var(--color-text-subtle)" /> : <ChevronDown size={14} color="var(--color-text-subtle)" />}
      </div>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Rationale */}
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, marginTop: 12 }}>
                <Sparkles size={12} style={{ display: 'inline', marginRight: 6, color: '#a78bfa' }} />
                {item.rationale}
              </p>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {/* Amazon link */}
                <a
                  href={item.amazon_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  id={`amazon-link-${item.id}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#fff', textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={12} />
                  View on Amazon
                </a>

                {isPending && (
                  <>
                    <button
                      id={`amazon-buy-${item.id}`}
                      onClick={() => act('purchased')}
                      disabled={loading}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        background: 'rgba(52,211,153,0.15)', color: '#34d399',
                        border: '1px solid rgba(52,211,153,0.3)', cursor: 'pointer',
                        opacity: loading ? 0.5 : 1,
                      }}
                    >
                      <CheckCircle2 size={12} />
                      Mark Purchased
                    </button>
                    <button
                      id={`amazon-skip-${item.id}`}
                      onClick={() => act('declined')}
                      disabled={loading}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        background: 'rgba(248,113,113,0.10)', color: '#f87171',
                        border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer',
                        opacity: loading ? 0.5 : 1,
                      }}
                    >
                      <XCircle size={12} />
                      Skip
                    </button>
                  </>
                )}

                <button
                  id={`amazon-delete-${item.id}`}
                  onClick={() => onDelete(item.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 10px', borderRadius: 7, fontSize: 12,
                    background: 'none', color: 'var(--color-text-subtle)',
                    border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Main Screen ─────────────────────────────────── */

export default function ShoppingScreen() {
  const [budget, setBudget]               = useState<BudgetStatus | null>(null);
  const [recs, setRecs]                   = useState<Recommendation[]>([]);
  const [history, setHistory]             = useState<Record<string, Recommendation[]>>({});
  const [historyOpen, setHistoryOpen]     = useState<Record<string, boolean>>({});
  const [loading, setLoading]             = useState(true);
  const [activeFilter, setActiveFilter]   = useState<'all' | 'pending' | 'purchased' | 'declined'>('all');

  // Wishlist state
  const [wishlist, setWishlist]           = useState<WishlistItem[]>([]);
  const [showAddWish, setShowAddWish]     = useState(false);
  const [wishTitle, setWishTitle]         = useState('');
  const [wishUrl, setWishUrl]             = useState('');
  const [wishPrice, setWishPrice]         = useState('');
  const [wishNotes, setWishNotes]         = useState('');
  const [wishPriority, setWishPriority]   = useState(3);
  const [addingWish, setAddingWish]       = useState(false);
  const [showPurchased, setShowPurchased] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [budgetRes, recsRes, histRes, wishRes] = await Promise.all([
        apiFetch('/amazon/budget'),
        apiFetch('/amazon/recommendations'),
        apiFetch('/amazon/history'),
        apiFetch('/amazon/wishlist'),
      ]);
      if (budgetRes.ok) setBudget(await budgetRes.json() as BudgetStatus);
      if (recsRes.ok)   setRecs(await recsRes.json() as Recommendation[]);
      if (histRes.ok)   setHistory(await histRes.json() as Record<string, Recommendation[]>);
      if (wishRes.ok)   setWishlist(await wishRes.json() as WishlistItem[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    const res = await apiFetch(`/amazon/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (res.ok) {
      const updated = await res.json() as Recommendation;
      setRecs(prev => prev.map(r => r.id === id ? updated : r));
    }
  };

  const deleteRec = async (id: string) => {
    const res = await apiFetch(`/amazon/${id}`, { method: 'DELETE' });
    if (res.ok) setRecs(prev => prev.filter(r => r.id !== id));
  };

  // Wishlist CRUD
  const addWishlistItem = async () => {
    if (!wishTitle.trim()) return;
    setAddingWish(true);
    try {
      const res = await apiFetch('/amazon/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wishTitle.trim(),
          url: wishUrl.trim() || undefined,
          price: wishPrice ? parseFloat(wishPrice) : undefined,
          notes: wishNotes.trim() || undefined,
          priority: wishPriority,
        }),
      });
      if (res.ok) {
        const item = await res.json() as WishlistItem;
        setWishlist(prev => [item, ...prev]);
        setWishTitle(''); setWishUrl(''); setWishPrice(''); setWishNotes('');
        setWishPriority(3); setShowAddWish(false);
      }
    } finally { setAddingWish(false); }
  };

  const toggleWishPurchased = async (item: WishlistItem) => {
    const res = await apiFetch(`/amazon/wishlist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchased: !item.purchased }),
    });
    if (res.ok) {
      const updated = await res.json() as WishlistItem;
      setWishlist(prev => prev.map(w => w.id === item.id ? updated : w));
    }
  };

  const deleteWishlistItem = async (id: string) => {
    const res = await apiFetch(`/amazon/wishlist/${id}`, { method: 'DELETE' });
    if (res.ok) setWishlist(prev => prev.filter(w => w.id !== id));
  };

  const filtered = recs.filter(r => {
    if (activeFilter === 'all')       return true;
    if (activeFilter === 'pending')   return r.status === 'recommended';
    if (activeFilter === 'purchased') return r.status === 'purchased';
    if (activeFilter === 'declined')  return r.status === 'declined';
    return true;
  });

  // Summary counts
  const pendingCount   = recs.filter(r => r.status === 'recommended').length;
  const purchasedCount = recs.filter(r => r.status === 'purchased').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 2px', overflowY: 'auto', height: '100%' }}>

      {/* ── Budget Overview Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 16, padding: '24px 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShoppingCart size={16} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Amazon Budget</h2>
              <p style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginTop: 1 }}>
                {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <button
            id="amazon-refresh"
            onClick={load}
            disabled={loading}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 7, padding: '5px 8px', cursor: 'pointer',
              color: 'var(--color-text-subtle)',
              opacity: loading ? 0.4 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {budget ? (
          <BudgetRing budget={budget} />
        ) : (
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-subtle)', fontSize: 13 }}>
            {loading ? 'Loading...' : 'No budget data'}
          </div>
        )}
      </motion.div>

      {/* ── Stats Bar ── */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { label: 'Pending',   value: pendingCount,   color: '#a78bfa', icon: Package },
          { label: 'Purchased', value: purchasedCount,  color: '#34d399', icon: CheckCircle2 },
          { label: 'This Month', value: recs.length,    color: '#60a5fa', icon: DollarSign },
        ].map(({ label, value, color, icon: Icon }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <Icon size={16} color={color} />
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>{value}</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 1 }}>{label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Recommendations ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text)' }}>
            Raven&apos;s Picks — This Month
          </h3>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'pending', 'purchased', 'declined'] as const).map(f => (
              <button
                key={f}
                id={`amazon-filter-${f}`}
                onClick={() => setActiveFilter(f)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px',
                  borderRadius: 100, border: 'none', cursor: 'pointer',
                  background: activeFilter === f ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                  color: activeFilter === f ? '#a78bfa' : 'var(--color-text-subtle)',
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AnimatePresence>
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  textAlign: 'center', padding: '40px 20px',
                  color: 'var(--color-text-subtle)', fontSize: 13,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12, border: '1px dashed rgba(255,255,255,0.08)',
                }}
              >
                <ShoppingCart size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p>No {activeFilter === 'all' ? '' : activeFilter} recommendations this month</p>
                <p style={{ fontSize: 11.5, marginTop: 4 }}>Raven will suggest items based on your goals and activity</p>
              </motion.div>
            ) : (
              filtered.map(item => (
                <RecCard key={item.id} item={item} onStatus={updateStatus} onDelete={deleteRec} />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── My Wishlist ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Heart size={14} color="#fb7185" />
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text)' }}>My Wishlist</h3>
            {wishlist.filter(w => !w.purchased).length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                background: 'rgba(251,113,133,0.12)', color: '#fb7185',
              }}>{wishlist.filter(w => !w.purchased).length}</span>
            )}
          </div>
          <button
            id="wishlist-add-btn"
            onClick={() => setShowAddWish(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: showAddWish ? 'rgba(251,113,133,0.2)' : 'rgba(251,113,133,0.1)',
              border: '1px solid rgba(251,113,133,0.25)', color: '#fb7185',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            <Plus size={12} /> Add Item
          </button>
        </div>

        {/* Add form */}
        <AnimatePresence initial={false}>
          {showAddWish && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden', marginBottom: 10 }}
            >
              <div style={{
                background: 'rgba(251,113,133,0.06)', border: '1px solid rgba(251,113,133,0.2)',
                borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <input
                  id="wishlist-title-input"
                  placeholder="What do you want? (e.g. Fancy Cream Soda)"
                  value={wishTitle}
                  onChange={e => setWishTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addWishlistItem()}
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, padding: '8px 12px', color: 'var(--color-text)',
                    fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)', width: '100%',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    placeholder="URL (optional)"
                    value={wishUrl}
                    onChange={e => setWishUrl(e.target.value)}
                    style={{
                      flex: 2, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8, padding: '8px 12px', color: 'var(--color-text)',
                      fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)',
                    }}
                  />
                  <input
                    placeholder="Price $"
                    value={wishPrice}
                    onChange={e => setWishPrice(e.target.value)}
                    type="number"
                    min="0" step="0.01"
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8, padding: '8px 12px', color: 'var(--color-text)',
                      fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)',
                    }}
                  />
                </div>
                {/* Priority stars */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>Priority:</span>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setWishPriority(n)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      aria-label={`Priority ${n}`}>
                      <Star size={14} fill={n <= wishPriority ? '#fbbf24' : 'none'} color={n <= wishPriority ? '#fbbf24' : 'rgba(255,255,255,0.2)'} />
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowAddWish(false)}
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    id="wishlist-save-btn"
                    onClick={addWishlistItem}
                    disabled={addingWish || !wishTitle.trim()}
                    style={{
                      padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      background: 'rgba(251,113,133,0.15)', border: '1px solid rgba(251,113,133,0.3)',
                      color: '#fb7185', cursor: 'pointer', opacity: addingWish || !wishTitle.trim() ? 0.5 : 1,
                    }}
                  >
                    {addingWish ? 'Saving...' : 'Add to Wishlist'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wishlist items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AnimatePresence>
            {wishlist.filter(w => !w.purchased).length === 0 && !showAddWish ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{
                  textAlign: 'center', padding: '28px 20px',
                  color: 'var(--color-text-subtle)', fontSize: 13,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12, border: '1px dashed rgba(251,113,133,0.15)',
                }}
              >
                <Heart size={24} style={{ opacity: 0.3, marginBottom: 8 }} color="#fb7185" />
                <p>Nothing on your wishlist yet</p>
                <p style={{ fontSize: 11.5, marginTop: 4 }}>Add anything you want — from &quot;Fancy Cream Soda&quot; to big splurges</p>
              </motion.div>
            ) : (
              wishlist.filter(w => !w.purchased).map(item => (
                <motion.div
                  key={item.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(251,113,133,0.1)',
                    borderRadius: 10,
                  }}
                >
                  {/* Priority stars (compact) */}
                  <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} size={9} fill={n <= item.priority ? '#fbbf24' : 'none'}
                        color={n <= item.priority ? '#fbbf24' : 'rgba(255,255,255,0.1)'} />
                    ))}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                    {item.price && <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 1 }}>{fmtUSD(item.price)}</p>}
                  </div>

                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--color-text-subtle)', flexShrink: 0 }}>
                      <Link size={12} />
                    </a>
                  )}

                  <button
                    onClick={() => toggleWishPurchased(item)}
                    title="Mark as got it!"
                    style={{
                      background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)',
                      borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                      color: '#34d399', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-sans)',
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    id={`wishlist-got-${item.id}`}
                  >
                    <CheckCircle2 size={11} /> Got it
                  </button>

                  <button onClick={() => deleteWishlistItem(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4, flexShrink: 0 }}
                    aria-label={`Remove ${item.title}`}>
                    <Trash2 size={12} />
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>

          {/* Purchased toggle */}
          {wishlist.filter(w => w.purchased).length > 0 && (
            <button
              onClick={() => setShowPurchased(v => !v)}
              style={{
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11.5, color: 'var(--color-text-subtle)', fontFamily: 'var(--font-sans)',
              }}
            >
              {showPurchased ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {wishlist.filter(w => w.purchased).length} item{wishlist.filter(w => w.purchased).length > 1 ? 's' : ''} already got
            </button>
          )}
          <AnimatePresence>
            {showPurchased && wishlist.filter(w => w.purchased).map(item => (
              <motion.div
                key={item.id} layout
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 0.5, y: 0 }} exit={{ opacity: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, textDecoration: 'line-through',
                }}
              >
                <CheckCircle2 size={12} color="#34d399" />
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: 1 }}>{item.title}</span>
                <button onClick={() => deleteWishlistItem(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}
                  aria-label={`Remove ${item.title}`}>
                  <Trash2 size={11} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* ── History ── */}
      {Object.keys(history).length > 0 && (
        <div>
          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text)', marginBottom: 12 }}>
            Purchase History
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(history)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([mk, items]) => {
                const isOpen = historyOpen[mk] ?? false;
                const monthSpend = items.filter(i => i.status === 'purchased').reduce((s, i) => s + Number(i.estimated_price), 0);
                return (
                  <div key={mk} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
                    <button
                      id={`history-${mk}`}
                      onClick={() => setHistoryOpen(prev => ({ ...prev, [mk]: !isOpen }))}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{monthLabel(mk)}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>{items.length} items · {fmtUSD(monthSpend)} purchased</span>
                      </div>
                      {isOpen ? <ChevronUp size={14} color="var(--color-text-subtle)" /> : <ChevronDown size={14} color="var(--color-text-subtle)" />}
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            {items.map(item => {
                              const m = STATUS_META[item.status] ?? STATUS_META.recommended;
                              return (
                                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_title}</p>
                                    <p style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginTop: 2 }}>{fmtUSD(Number(item.estimated_price))}</p>
                                  </div>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: m.bg, color: m.color, flexShrink: 0 }}>{m.label}</span>
                                  <a href={item.amazon_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-subtle)', flexShrink: 0 }}>
                                    <ExternalLink size={13} />
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Bottom padding */}
      <div style={{ height: 20 }} />
    </div>
  );
}
