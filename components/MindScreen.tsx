'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, MessageCircleQuestion, Lightbulb, Sparkles, Eye, RefreshCw, Check } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'https://raven-api-production.up.railway.app';

interface DialogItem {
  id: string;
  type: 'reflection' | 'question_for_ash' | 'self_improvement' | 'research_idea' | 'observation';
  content: string;
  addressed: boolean;
  priority: number;
  created_at: string;
}

const TYPE_CONFIG = {
  question_for_ash:  { icon: <MessageCircleQuestion size={14} />, label: 'Question for Ash', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
  observation:       { icon: <Eye size={14} />,                   label: 'Observation',     color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
  research_idea:     { icon: <Lightbulb size={14} />,             label: 'Research Idea',  color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
  self_improvement:  { icon: <Sparkles size={14} />,              label: 'Self-Improvement', color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
  reflection:        { icon: <Brain size={14} />,                 label: 'Reflection',     color: '#f472b6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.2)' },
};

const TABS = [
  { id: '',                label: 'All',           icon: <Brain size={13} /> },
  { id: 'question_for_ash', label: 'Questions',    icon: <MessageCircleQuestion size={13} /> },
  { id: 'observation',    label: 'Observations',   icon: <Eye size={13} /> },
  { id: 'research_idea',  label: 'Research Ideas', icon: <Lightbulb size={13} /> },
  { id: 'self_improvement', label: 'Self-Improve', icon: <Sparkles size={13} /> },
];

export default function MindScreen() {
  const [items, setItems] = useState<DialogItem[]>([]);
  const [tab, setTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [reflecting, setReflecting] = useState(false);
  const [showAddressed, setShowAddressed] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (tab) params.set('type', tab);
      if (!showAddressed) params.set('addressed', 'false');
      const r = await fetch(`${API}/mind?${params}`);
      if (!r.ok) return;
      setItems(await r.json() as DialogItem[]);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [tab, showAddressed]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Auto-refresh every 60s
  useEffect(() => {
    const i = setInterval(fetchItems, 60_000);
    return () => clearInterval(i);
  }, [fetchItems]);

  async function triggerReflection() {
    setReflecting(true);
    try {
      await fetch(`${API}/mind/reflect`, { method: 'POST' });
      setTimeout(fetchItems, 5000); // Refresh after 5s
    } catch { /* silent */ } finally {
      setTimeout(() => setReflecting(false), 3000);
    }
  }

  async function markAddressed(id: string) {
    try {
      await fetch(`${API}/mind/${id}/address`, { method: 'PATCH' });
      setItems(prev => prev.map(i => i.id === id ? { ...i, addressed: true } : i));
    } catch { /* silent */ }
  }

  const visibleItems = showAddressed ? items : items.filter(i => !i.addressed);

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
          <button
            className="mind-toggle-addressed"
            onClick={() => setShowAddressed(v => !v)}
          >
            {showAddressed ? 'Hide addressed' : 'Show all'}
          </button>
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
          const count = items.filter(i => !i.addressed && (t.id === '' || i.type === t.id)).length;
          return (
            <button
              key={t.id}
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
