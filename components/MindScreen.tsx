'use client';
import { apiFetch } from '../lib/api';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, MessageCircleQuestion, Lightbulb, Sparkles, Eye,
  RefreshCw, Check, Layers, ArrowRight,
} from 'lucide-react';

interface DialogItem {
  id:         string;
  type:       'reflection' | 'question_for_ash' | 'self_improvement' | 'research_idea' | 'observation';
  content:    string;
  addressed:  boolean;
  priority:   number;
  created_at: string;
}

const TYPE_CONFIG = {
  question_for_ash:  { icon: <MessageCircleQuestion size={14} />, label: 'Questions for Ash', color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', cardBg: 'rgba(167,139,250,0.06)' },
  observation:       { icon: <Eye size={14} />,                   label: 'Observations',       color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.20)',  cardBg: 'rgba(96,165,250,0.06)' },
  research_idea:     { icon: <Lightbulb size={14} />,             label: 'Research Ideas',     color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.20)',  cardBg: 'rgba(251,191,36,0.05)' },
  self_improvement:  { icon: <Sparkles size={14} />,              label: 'Self-Improvement',   color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.20)',  cardBg: 'rgba(52,211,153,0.05)' },
  reflection:        { icon: <Brain size={14} />,                 label: 'Reflections',        color: '#f472b6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.20)', cardBg: 'rgba(244,114,182,0.05)' },
};

type TabId = 'summary' | '' | 'question_for_ash' | 'observation' | 'research_idea' | 'self_improvement';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'summary',           label: 'Summary',        icon: <Layers size={13} /> },
  { id: '',                  label: 'All',             icon: <Brain size={13} /> },
  { id: 'question_for_ash',  label: 'Questions',       icon: <MessageCircleQuestion size={13} /> },
  { id: 'observation',       label: 'Observations',    icon: <Eye size={13} /> },
  { id: 'research_idea',     label: 'Research Ideas',  icon: <Lightbulb size={13} /> },
  { id: 'self_improvement',  label: 'Self-Improve',    icon: <Sparkles size={13} /> },
];

/* ── Summary View ─────────────────────────────────────────────────────────── */

function SummaryView({
  items,
  onNavigate,
}: {
  items: DialogItem[];
  onNavigate: (tab: TabId) => void;
}) {
  const unaddressed = items.filter(i => !i.addressed);
  const total = unaddressed.length;

  // Group by type, sorted by priority desc
  const byType = Object.fromEntries(
    Object.keys(TYPE_CONFIG).map(type => [
      type,
      unaddressed
        .filter(i => i.type === type)
        .sort((a, b) => b.priority - a.priority),
    ])
  ) as Record<string, DialogItem[]>;

  // Dominant category (most items)
  const dominant = Object.entries(byType)
    .filter(([, arr]) => arr.length > 0)
    .sort(([, a], [, b]) => b.length - a.length)[0];

  const highPriority = unaddressed.filter(i => i.priority >= 4);

  if (total === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '60px 20px', gap: 12,
        color: 'var(--color-text-subtle)',
      }}>
        <Brain size={36} style={{ opacity: 0.25 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Raven&apos;s mind is clear
        </p>
        <p style={{ fontSize: 12, textAlign: 'center', maxWidth: 260 }}>
          Hit &quot;Reflect now&quot; to have her process recent events and generate thoughts.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* ── State of mind header ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 100%)',
        border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: 16, padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Brain size={15} color="#a78bfa" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Raven&apos;s State of Mind
          </span>
        </div>

        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.55 }}>
          {total} thing{total !== 1 ? 's' : ''} on her mind
          {dominant
            ? ` — mostly ${TYPE_CONFIG[dominant[0] as keyof typeof TYPE_CONFIG]?.label.toLowerCase()}`
            : ''}
          {highPriority.length > 0
            ? `, ${highPriority.length} high-priority`
            : ''}
          .
        </p>

        {/* Top high-priority item if exists */}
        {highPriority.length > 0 && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', marginBottom: 4, letterSpacing: '0.04em' }}>
              TOP PRIORITY
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>
              {highPriority[0].content.length > 160
                ? highPriority[0].content.slice(0, 160) + '…'
                : highPriority[0].content}
            </p>
            <p style={{ fontSize: 10.5, color: 'var(--color-text-subtle)', marginTop: 6 }}>
              {TYPE_CONFIG[highPriority[0].type as keyof typeof TYPE_CONFIG]?.label}
            </p>
          </div>
        )}
      </div>

      {/* ── Category cards grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 10,
      }}>
        {(Object.entries(byType) as [string, DialogItem[]][])
          .filter(([, arr]) => arr.length > 0)
          .sort(([, a], [, b]) => b.length - a.length)
          .map(([type, typeItems], i) => {
            const cfg = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
            const top = typeItems[0];
            const tabId = type as TabId;

            return (
              <motion.button
                key={type}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => onNavigate(tabId)}
                id={`mind-summary-${type}`}
                style={{
                  background: cfg.cardBg,
                  border: `1px solid ${cfg.border}`,
                  borderRadius: 14, padding: '16px',
                  textAlign: 'left', cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                  fontFamily: 'var(--font-sans)',
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ color: cfg.color }}>{cfg.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: cfg.color,
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                      borderRadius: 100, padding: '1px 8px',
                    }}>
                      {typeItems.length}
                    </span>
                    <ArrowRight size={12} color="var(--color-text-subtle)" />
                  </div>
                </div>

                {/* Top item preview */}
                <p style={{
                  fontSize: 12.5, color: 'var(--color-text-muted)',
                  lineHeight: 1.55, margin: 0,
                }}>
                  {top.content.length > 110
                    ? top.content.slice(0, 110) + '…'
                    : top.content}
                </p>

                {typeItems.length > 1 && (
                  <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 8 }}>
                    +{typeItems.length - 1} more
                  </p>
                )}
              </motion.button>
            );
          })}
      </div>
    </motion.div>
  );
}

/* ── Main Screen ──────────────────────────────────────────────────────────── */

export default function MindScreen() {
  const [items, setItems]         = useState<DialogItem[]>([]);
  const [tab, setTab]             = useState<TabId>('summary');
  const [loading, setLoading]     = useState(true);
  const [reflecting, setReflecting] = useState(false);
  const [showAddressed, setShowAddressed] = useState(false);
  const reflectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      // Summary needs all items; named tabs filter by type
      if (tab && tab !== 'summary') params.set('type', tab);
      if (!showAddressed) params.set('addressed', 'false');
      const r = await apiFetch(`/mind?${params}`);
      if (!r.ok) return;
      setItems(await r.json() as DialogItem[]);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [tab, showAddressed]);

  // For summary tab we always need all items regardless of addressed filter
  const fetchAll = useCallback(async () => {
    try {
      const r = await apiFetch(`/mind`);
      if (!r.ok) return;
      setItems(await r.json() as DialogItem[]);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'summary') {
      fetchAll();
    } else {
      fetchItems();
    }
  }, [tab, fetchAll, fetchItems]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      if (tab === 'summary') fetchAll(); else fetchItems();
    }, 60_000);
    return () => clearInterval(id);
  }, [tab, fetchAll, fetchItems]);

  async function triggerReflection() {
    setReflecting(true);
    try {
      await apiFetch(`/mind/reflect`, { method: 'POST' });
      if (reflectTimerRef.current) clearTimeout(reflectTimerRef.current);
      reflectTimerRef.current = setTimeout(() => {
        if (tab === 'summary') fetchAll(); else fetchItems();
      }, 5000);
    } catch { /* silent */ } finally {
      setTimeout(() => setReflecting(false), 3000);
    }
  }

  useEffect(() => () => { if (reflectTimerRef.current) clearTimeout(reflectTimerRef.current); }, []);

  async function markAddressed(id: string) {
    try {
      await apiFetch(`/mind/${id}/address`, { method: 'PATCH' });
      setItems(prev => prev.map(i => i.id === id ? { ...i, addressed: true } : i));
    } catch { /* silent */ }
  }

  const unaddressedItems = items.filter(i => !i.addressed);
  const visibleItems = tab === 'summary'
    ? items
    : (showAddressed ? items : unaddressedItems);

  return (
    <div className="mind-screen">
      <div className="mind-header">
        <div className="mind-header-info">
          <Brain size={16} className="mind-brain-icon" />
          <p className="mind-header-desc">
            Raven&apos;s inner thoughts — observations she&apos;s made, questions she wants to ask you, ideas she&apos;s developing, and how she&apos;s improving herself.
          </p>
        </div>
        <div className="mind-header-actions">
          {tab !== 'summary' && (
            <button
              className="mind-toggle-addressed"
              onClick={() => setShowAddressed(v => !v)}
            >
              {showAddressed ? 'Hide addressed' : 'Show all'}
            </button>
          )}
          <button
            className={`mind-reflect-btn ${reflecting ? 'reflecting' : ''}`}
            onClick={triggerReflection}
            disabled={reflecting}
          >
            <RefreshCw size={12} className={reflecting ? 'spinning' : ''} />
            {reflecting ? 'Reflecting...' : 'Reflect now'}
          </button>
        </div>
      </div>

      <div className="mind-tabs">
        {TABS.map(t => {
          const count = t.id === 'summary'
            ? unaddressedItems.length
            : unaddressedItems.filter(i => t.id === '' || i.type === t.id).length;
          return (
            <button
              key={t.id}
              id={`mind-tab-${t.id || 'all'}`}
              className={`mind-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
              {count > 0 && <span className="mind-tab-badge">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="mind-feed">
        {loading ? (
          <div className="mind-empty">Loading Raven&apos;s thoughts...</div>
        ) : tab === 'summary' ? (
          <SummaryView items={visibleItems} onNavigate={setTab} />
        ) : visibleItems.length === 0 ? (
          <div className="mind-empty">
            <Brain size={32} opacity={0.3} />
            <p>Nothing here yet — trigger a reflection cycle to see Raven&apos;s thoughts.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleItems.map(item => {
              const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.reflection;
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: item.addressed ? 0.4 : 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="mind-item"
                  style={{ borderColor: cfg.border, background: cfg.bg }}
                >
                  <div className="mind-item-icon" style={{ color: cfg.color }}>
                    {cfg.icon}
                  </div>
                  <div className="mind-item-body">
                    <div className="mind-item-meta">
                      <span className="mind-item-type" style={{ color: cfg.color }}>{cfg.label}</span>
                      {item.priority >= 4 && <span className="mind-item-priority">High priority</span>}
                      <span className="mind-item-time">
                        {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mind-item-content">{item.content}</p>
                  </div>
                  {!item.addressed && (
                    <button
                      className="mind-item-address"
                      onClick={() => markAddressed(item.id)}
                      aria-label="Mark as addressed"
                      title="Mark as addressed"
                    >
                      <Check size={12} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
