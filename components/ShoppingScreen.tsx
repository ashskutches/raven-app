'use client';

/**
 * ShoppingScreen — Raven's Curated Wishlist
 *
 * Sections:
 *   - Overview card: pending count, category breakdown, total value
 *   - Raven's Picks: all pending wishlist items with category badges, reasoning
 *   - My Wishlist: Ash's personal want-list (CRUD)
 *   - History: purchased/declined items grouped by month
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, Package, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, ExternalLink, Trash2, RefreshCw, Sparkles,
  Heart, Plus, Link, Star, Wrench, Gift, Target, Laugh, ShoppingBag, Search, Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/* ── Types ───────────────────────────────────────── */

type WishlistCategory = 'useful' | 'reward' | 'goal-linked' | 'fun';

interface WishlistStats {
  pending:           number;
  purchased:         number;
  declined:          number;
  totalPendingValue: number;
  categories: {
    useful:       number;
    reward:       number;
    'goal-linked': number;
    fun:          number;
  };
  // backward-compat fields from /budget alias
  spent?:      number;
  remaining?:  number;
  cap?:        number;
  perItemCap?: number;
}

interface RavenPick {
  id:               string;
  product_title:    string;
  amazon_url:       string;
  estimated_price:  number;
  rationale:        string;
  category:         WishlistCategory;
  raven_reasoning:  string | null;
  goal_id:          string | null;
  status:           'recommended' | 'purchased' | 'declined' | 'expired';
  month_key:        string;
  recommended_at:   string;
  resolved_at:      string | null;
}

interface WishlistItem {
  id:         string;
  title:      string;
  url:        string | null;
  price:      number | null;
  category:   string | null;
  notes:      string | null;
  priority:   number;
  purchased:  boolean;
  created_at: string;
}

/* ── Config ──────────────────────────────────────── */

const CATEGORY_META: Record<WishlistCategory, {
  label: string; emoji: string; color: string; bg: string; border: string; icon: typeof Wrench;
}> = {
  'useful':      { label: 'Useful',      emoji: '🔧', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  icon: Wrench    },
  'reward':      { label: 'Reward',      emoji: '🎁', color: '#fb7185', bg: 'rgba(251,113,133,0.12)', border: 'rgba(251,113,133,0.25)', icon: Gift      },
  'goal-linked': { label: 'Goal-Linked', emoji: '🎯', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)', icon: Target    },
  'fun':         { label: 'Fun',         emoji: '🎉', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  icon: Laugh     },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  recommended: { label: 'On Wishlist', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  purchased:   { label: 'Purchased',   color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  declined:    { label: 'Passed',      color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  expired:     { label: 'Expired',     color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
};

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

/* ── Overview Card ───────────────────────────────── */

function OverviewCard({ stats, loading, onRefresh }: {
  stats: WishlistStats | null; loading: boolean; onRefresh: () => void;
}) {
  // Null-guard categories — old API versions may not return it
  const cats: Array<{ key: WishlistCategory; count: number }> = stats?.categories
    ? (['goal-linked', 'useful', 'reward', 'fun'] as WishlistCategory[]).map(k => ({
        key: k, count: stats.categories![k] ?? 0,
      })).filter(c => c.count > 0)
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 100%)',
        border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: 18, padding: '24px 28px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingBag size={17} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Raven's Wishlist</h2>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginTop: 1 }}>
              Curated picks — updated weekly
            </p>
          </div>
        </div>
        <button
          id="shopping-refresh"
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 7, padding: '5px 8px', cursor: 'pointer',
            color: 'var(--color-text-subtle)', opacity: loading ? 0.4 : 1,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Big stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          flex: '0 0 auto',
          background: 'rgba(255,255,255,0.05)', borderRadius: 14,
          padding: '16px 22px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>
            {stats?.pending ?? '—'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 4 }}>items waiting</p>
        </div>

        <div style={{
          flex: '0 0 auto',
          background: 'rgba(255,255,255,0.05)', borderRadius: 14,
          padding: '16px 22px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 36, fontWeight: 800, color: '#34d399', lineHeight: 1 }}>
            {stats ? fmtUSD(stats.totalPendingValue ?? (stats as unknown as Record<string,number>).totalPending ?? 0) : '—'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 4 }}>total value</p>
        </div>

        {/* Category breakdown */}
        {cats.length > 0 && (
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {cats.map(({ key, count }) => {
              const meta = CATEGORY_META[key];
              const Icon = meta.icon;
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: meta.bg, border: `1px solid ${meta.border}`,
                  borderRadius: 10, padding: '8px 12px',
                }}>
                  <Icon size={13} color={meta.color} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{count} {meta.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {stats && stats.purchased > 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginTop: 14 }}>
          <CheckCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} color="#34d399" />
          {stats.purchased} item{stats.purchased !== 1 ? 's' : ''} purchased all time
        </p>
      )}
    </motion.div>
  );
}

/* ── Pick Card ───────────────────────────────────── */

function PickCard({
  item, onStatus, onDelete,
}: {
  item: RavenPick;
  onStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading]   = useState(false);

  const cat  = CATEGORY_META[item.category] ?? CATEGORY_META['useful'];
  const Icon = cat.icon;

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
        background: 'rgba(255,255,255,0.035)',
        border: `1px solid ${expanded ? cat.border : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14, overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Category stripe */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${cat.color}55, transparent)` }} />

      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
        }}
      >
        {/* Category icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cat.bg, border: `1px solid ${cat.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={16} color={cat.color} />
        </div>

        {/* Title + price */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.product_title}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginTop: 2 }}>
            {fmtUSD(item.estimated_price)} ·{' '}
            <span style={{ color: cat.color }}>{cat.emoji} {cat.label}</span>
          </p>
        </div>

        {/* Date */}
        <span style={{ fontSize: 10.5, color: 'var(--color-text-subtle)', flexShrink: 0 }}>
          {new Date(item.recommended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>

        {expanded
          ? <ChevronUp size={14} color="var(--color-text-subtle)" />
          : <ChevronDown size={14} color="var(--color-text-subtle)" />}
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
              <p style={{
                fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.65, marginTop: 14,
              }}>
                <Sparkles size={12} style={{ display: 'inline', marginRight: 6, color: cat.color }} />
                {item.rationale}
              </p>

              {/* Raven's personal reasoning */}
              {item.raven_reasoning && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 14px',
                  background: cat.bg,
                  borderLeft: `3px solid ${cat.color}`,
                  borderRadius: '0 8px 8px 0',
                }}>
                  <p style={{ fontSize: 12, color: cat.color, fontStyle: 'italic', lineHeight: 1.6 }}>
                    "{item.raven_reasoning}"
                  </p>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <a
                  href={item.amazon_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  id={`pick-link-${item.id}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#fff', textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={11} />
                  View on Amazon
                </a>

                <button
                  id={`pick-buy-${item.id}`}
                  onClick={() => act('purchased')}
                  disabled={loading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'rgba(52,211,153,0.12)', color: '#34d399',
                    border: '1px solid rgba(52,211,153,0.3)', cursor: 'pointer',
                    opacity: loading ? 0.5 : 1, fontFamily: 'var(--font-sans)',
                  }}
                >
                  <CheckCircle2 size={12} />
                  Got it
                </button>

                <button
                  id={`pick-pass-${item.id}`}
                  onClick={() => act('declined')}
                  disabled={loading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'rgba(248,113,113,0.08)', color: '#f87171',
                    border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer',
                    opacity: loading ? 0.5 : 1, fontFamily: 'var(--font-sans)',
                  }}
                >
                  <XCircle size={12} />
                  Pass
                </button>

                <button
                  id={`pick-delete-${item.id}`}
                  onClick={() => onDelete(item.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 10px', borderRadius: 8, fontSize: 12,
                    background: 'none', color: 'var(--color-text-subtle)',
                    border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer',
                    marginLeft: 'auto', fontFamily: 'var(--font-sans)',
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

type CategoryFilter = 'all' | WishlistCategory;

export default function ShoppingScreen() {
  const [stats, setStats]             = useState<WishlistStats | null>(null);
  const [picks, setPicks]             = useState<RavenPick[]>([]);
  const [history, setHistory]         = useState<Record<string, RavenPick[]>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading]         = useState(true);
  const [catFilter, setCatFilter]     = useState<CategoryFilter>('all');

  // Ash's wishlist state
  const [wishlist, setWishlist]           = useState<WishlistItem[]>([]);
  const [showAddWish, setShowAddWish]     = useState(false);
  const [wishTitle, setWishTitle]         = useState('');
  const [wishUrl, setWishUrl]             = useState('');
  const [wishPrice, setWishPrice]         = useState('');
  const [wishNotes, setWishNotes]         = useState('');
  const [wishPriority, setWishPriority]   = useState(3);
  const [addingWish, setAddingWish]       = useState(false);
  const [showPurchased, setShowPurchased] = useState(false);

  // Research trigger state
  const [researching, setResearching]       = useState(false);
  const [researchMsg, setResearchMsg]       = useState<string | null>(null);
  const [researchError, setResearchError]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, picksRes, histRes, wishRes] = await Promise.all([
        apiFetch('/amazon/budget'),
        apiFetch('/amazon/recommendations'),
        apiFetch('/amazon/history'),
        apiFetch('/amazon/wishlist'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json() as WishlistStats);
      if (picksRes.ok) setPicks(await picksRes.json() as RavenPick[]);
      if (histRes.ok)  setHistory(await histRes.json() as Record<string, RavenPick[]>);
      if (wishRes.ok)  setWishlist(await wishRes.json() as WishlistItem[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerResearch = async () => {
    setResearching(true);
    setResearchMsg(null);
    setResearchError(false);
    try {
      const res = await apiFetch('/amazon/research', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setResearchMsg(data.message ?? "Raven is researching picks — check Discord in ~60s!");
        // Auto-refresh picks after 90s so new items appear
        setTimeout(() => load(), 90_000);
      } else {
        setResearchMsg(data.error ?? 'Something went wrong starting research.');
        setResearchError(true);
      }
    } catch {
      setResearchMsg('Could not reach the server. Is the API running?');
      setResearchError(true);
    } finally {
      setResearching(false);
      // Auto-dismiss message after 8s
      setTimeout(() => setResearchMsg(null), 8000);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await apiFetch(`/amazon/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) {
        const updated = await res.json() as RavenPick;
        setPicks(prev => prev.filter(p => p.id !== updated.id));
        await load();
      }
    } catch (err) {
      console.error('[ShoppingScreen] updateStatus failed:', err);
    }
  };

  const deletePick = async (id: string) => {
    try {
      const res = await apiFetch(`/amazon/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPicks(prev => prev.filter(p => p.id !== id));
        await load();
      }
    } catch (err) {
      console.error('[ShoppingScreen] deletePick failed:', err);
    }
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
    try {
      const res = await apiFetch(`/amazon/wishlist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchased: !item.purchased }),
      });
      if (res.ok) {
        const updated = await res.json() as WishlistItem;
        setWishlist(prev => prev.map(w => w.id === item.id ? updated : w));
      }
    } catch (err) {
      console.error('[ShoppingScreen] toggleWishPurchased failed:', err);
    }
  };

  const deleteWishlistItem = async (id: string) => {
    try {
      const res = await apiFetch(`/amazon/wishlist/${id}`, { method: 'DELETE' });
      if (res.ok) setWishlist(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      console.error('[ShoppingScreen] deleteWishlistItem failed:', err);
    }
  };

  const filteredPicks = picks.filter(p => {
    if (catFilter === 'all') return true;
    return p.category === catFilter;
  });

  if (loading && picks.length === 0 && !stats) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-subtle)', fontSize: 13 }}>
        <ShoppingCart size={18} style={{ marginRight: 8, opacity: 0.4 }} />
        Loading wishlist...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '0 2px', overflowY: 'auto', flex: 1, minHeight: 0 }}>

      {/* ── Overview ── */}
      <OverviewCard stats={stats} loading={loading} onRefresh={load} />

      {/* ── Raven's Picks ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color="#a78bfa" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
              Raven&apos;s Picks
            </h3>
            {picks.length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                background: 'rgba(167,139,250,0.12)', color: '#a78bfa',
              }}>{picks.length}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Research button */}
            <motion.button
              id="shopping-research-btn"
              onClick={triggerResearch}
              disabled={researching}
              whileHover={{ scale: researching ? 1 : 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                background: researching
                  ? 'rgba(139,92,246,0.08)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.22))',
                border: '1px solid rgba(139,92,246,0.35)',
                color: '#a78bfa', cursor: researching ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)',
                opacity: researching ? 0.7 : 1,
                transition: 'all 0.2s',
                boxShadow: researching ? 'none' : '0 0 12px rgba(139,92,246,0.15)',
              }}
            >
              {researching
                ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Search size={12} />}
              {researching ? 'Researching...' : 'Ask Raven to Research'}
            </motion.button>

            {/* Category filter pills */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(['all', 'goal-linked', 'useful', 'reward', 'fun'] as const).map(f => {
                const meta = f === 'all' ? null : CATEGORY_META[f];
                return (
                  <button
                    key={f}
                    id={`pick-filter-${f}`}
                    onClick={() => setCatFilter(f)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px',
                      borderRadius: 100, border: 'none', cursor: 'pointer',
                      background: catFilter === f
                        ? (meta ? meta.bg : 'rgba(167,139,250,0.15)')
                        : 'rgba(255,255,255,0.05)',
                      color: catFilter === f
                        ? (meta ? meta.color : '#a78bfa')
                        : 'var(--color-text-subtle)',
                      transition: 'all 0.15s',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {meta ? `${meta.emoji} ${meta.label}` : 'All'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Research feedback toast */}
        <AnimatePresence>
          {researchMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 10,
                background: researchError
                  ? 'rgba(248,113,113,0.08)'
                  : 'rgba(52,211,153,0.08)',
                border: `1px solid ${researchError ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.2)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12.5, color: researchError ? '#f87171' : '#34d399',
              }}
            >
              {researchError
                ? <XCircle size={14} />
                : <CheckCircle2 size={14} />}
              {researchMsg}
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AnimatePresence>
            {filteredPicks.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  textAlign: 'center', padding: '48px 20px',
                  color: 'var(--color-text-subtle)', fontSize: 13,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 14, border: '1px dashed rgba(255,255,255,0.07)',
                }}
              >
                <Package size={30} style={{ opacity: 0.25, marginBottom: 10 }} />
                <p style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  {catFilter === 'all' ? 'Nothing on the wishlist yet' : `No ${CATEGORY_META[catFilter].label.toLowerCase()} picks yet`}
                </p>
                <p style={{ fontSize: 12, marginTop: 6, maxWidth: 280, margin: '6px auto 0' }}>
                  Raven will add things as she finds them — every week she curates new picks based on your goals and life
                </p>
              </motion.div>
            ) : (
              filteredPicks.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <PickCard item={item} onStatus={updateStatus} onDelete={deletePick} />
                </motion.div>
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
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>My Wishlist</h3>
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
                    boxSizing: 'border-box',
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
                    type="number" min="0" step="0.01"
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
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
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
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {addingWish ? 'Saving...' : 'Add to Wishlist'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AnimatePresence>
            {wishlist.filter(w => !w.purchased).length === 0 && !showAddWish ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{
                  textAlign: 'center', padding: '28px 20px',
                  color: 'var(--color-text-subtle)', fontSize: 13,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 12, border: '1px dashed rgba(251,113,133,0.15)',
                }}
              >
                <Heart size={24} style={{ opacity: 0.3, marginBottom: 8 }} color="#fb7185" />
                <p>Nothing on your personal wishlist yet</p>
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
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(251,113,133,0.1)',
                    borderRadius: 10,
                  }}
                >
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
                    id={`wishlist-got-${item.id}`}
                    style={{
                      background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)',
                      borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                      color: '#34d399', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-sans)',
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                    }}
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
              {wishlist.filter(w => w.purchased).length} already got
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
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
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
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginBottom: 12 }}>
            Purchase History
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(history)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([mk, items]) => {
                const isOpen = historyOpen[mk] ?? false;
                const purchased = items.filter(i => i.status === 'purchased');
                const monthSpend = purchased.reduce((s, i) => s + Number(i.estimated_price), 0);
                return (
                  <div key={mk} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
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
                        <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
                          {purchased.length} purchased · {fmtUSD(monthSpend)}
                        </span>
                      </div>
                      {isOpen
                        ? <ChevronUp size={14} color="var(--color-text-subtle)" />
                        : <ChevronDown size={14} color="var(--color-text-subtle)" />}
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
                          <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            {items.map(item => {
                              const statusMeta = STATUS_META[item.status] ?? STATUS_META.recommended;
                              const catMeta = CATEGORY_META[item.category as WishlistCategory] ?? CATEGORY_META['useful'];
                              return (
                                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                  <span style={{ fontSize: 13 }}>{catMeta.emoji}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_title}</p>
                                    <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 1 }}>{fmtUSD(Number(item.estimated_price))}</p>
                                  </div>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                                    background: statusMeta.bg, color: statusMeta.color, flexShrink: 0,
                                  }}>
                                    {statusMeta.label}
                                  </span>
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

      {/* Bottom spacer */}
      <div style={{ height: 24 }} />
    </div>
  );
}
