'use client';
import { apiFetch } from '../lib/api';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, FlaskConical, BookOpen, Play, PlusCircle,
  Clock, CheckCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────── */
type LibraryEntry = {
  id: string; title: string; type: string;
  content: string; summary: string; tags: string[];
  source: string; confidence: number;
  created_at: string; updated_at: string;
};

type QueueItem = {
  id: string; topic: string; rationale?: string; priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  created_at: string; completed_at?: string;
};

/* ─── Config ─────────────────────────────────────────────────── */
const LIB_TABS = [
  { id: '',             label: 'All'          },
  { id: 'user_fact',    label: 'About Ash'    },
  { id: 'insight',      label: 'Insights'     },
  { id: 'research',     label: 'Research'     },
  { id: 'goal_context', label: 'Goals'        },
  { id: 'family',       label: 'People'       },
  { id: 'reference',    label: 'References'   },
] as const;

const TYPE_BADGE: Record<string, string> = {
  research:     'badge-research',
  user_fact:    'badge-user_fact',
  family:       'badge-family',
  goal_context: 'badge-goal_context',
  insight:      'badge-insight',
  reference:    'badge-reference',
};

const PRIORITY_LABELS: Record<number, string> = { 5: 'Critical', 4: 'High', 3: 'Normal', 2: 'Low', 1: 'Background' };
const PRIORITY_COLORS: Record<number, string> = { 5: '#f87171', 4: '#fb923c', 3: '#60a5fa', 2: '#94a3b8', 1: '#475569' };

const STATUS_CFG = {
  pending:     { dot: '⏳', color: '#94a3b8' },
  in_progress: { dot: '🔬', color: '#fbbf24' },
  completed:   { dot: '✅', color: '#34d399' },
  skipped:     { dot: '⏭',  color: '#64748b' },
};

/* ─── Research tab ───────────────────────────────────────────── */
function ResearchTab() {
  const [items,        setItems]        = useState<QueueItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState<'pending' | 'completed' | 'all'>('pending');
  const [running,      setRunning]      = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);
  const [newTopic,     setNewTopic]     = useState('');
  const [newRationale, setNewRationale] = useState('');
  const [expanded,     setExpanded]     = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const path = filter === 'all' ? `/research/queue/all` : `/research/queue?status=${filter}`;
      const r = await apiFetch(path);
      if (!r.ok) return;
      setItems(await r.json() as QueueItem[]);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => { const i = setInterval(fetch_, 30_000); return () => clearInterval(i); }, [fetch_]);

  async function run() {
    setRunning(true);
    try { await apiFetch('/research/run', { method: 'POST' }); setTimeout(fetch_, 8000); }
    catch { /* silent */ } finally { setTimeout(() => setRunning(false), 4000); }
  }

  async function addTopic() {
    if (!newTopic.trim()) return;
    try {
      await apiFetch('/research/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic.trim(), rationale: newRationale.trim() || undefined, priority: 3 }),
      });
      setNewTopic(''); setNewRationale(''); setShowAdd(false); fetch_();
    } catch { /* silent */ }
  }

  async function remove(id: string) {
    await apiFetch(`/research/queue/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  const pending   = items.filter(i => i.status === 'pending').length;
  const completed = items.filter(i => i.status === 'completed').length;
  const active    = items.filter(i => i.status === 'in_progress').length;

  return (
    <div className="research-screen">
      {/* Header */}
      <div className="research-header">
        <div className="research-stats">
          <div className="research-stat">
            <span className="research-stat-val">{pending}</span>
            <span className="research-stat-label">pending</span>
          </div>
          <div className="research-stat">
            <span className="research-stat-val" style={{ color: '#fbbf24' }}>{active}</span>
            <span className="research-stat-label">active</span>
          </div>
          <div className="research-stat">
            <span className="research-stat-val" style={{ color: '#34d399' }}>{completed}</span>
            <span className="research-stat-label">done</span>
          </div>
        </div>
        <div className="research-actions">
          <button className="research-add-btn" onClick={() => setShowAdd(v => !v)}>
            <PlusCircle size={13} /> Add topic
          </button>
          <button className={`research-run-btn ${running ? 'running' : ''}`} onClick={run} disabled={running}>
            <Play size={12} className={running ? 'spinning' : ''} />
            {running ? 'Researching...' : 'Run now'}
          </button>
        </div>
      </div>

      {/* Add topic form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="research-add-form">
            <input className="research-input" placeholder="Research topic..." value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTopic()} autoFocus />
            <input className="research-input" placeholder="Why is this relevant to Ash? (optional)" value={newRationale} onChange={e => setNewRationale(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTopic()} />
            <div className="research-add-actions">
              <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }} onClick={addTopic}>Add to Queue</button>
              <button className="btn btn-ghost"   style={{ fontSize: 13 }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status filter */}
      <div className="research-filters">
        {(['pending', 'completed', 'all'] as const).map(s => (
          <button key={s} className={`filter-chip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="research-list">
        {loading ? (
          <div className="research-empty">Loading research queue...</div>
        ) : items.length === 0 ? (
          <div className="research-empty">
            <FlaskConical size={32} opacity={0.3} />
            <p>No {filter} topics. Raven auto-generates topics based on what she knows about you.</p>
          </div>
        ) : (
          <AnimatePresence>
            {items.map(item => {
              const cfg = STATUS_CFG[item.status];
              const isExp = expanded === item.id;
              return (
                <motion.div key={item.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="research-item">
                  <div className="research-item-header" onClick={() => setExpanded(isExp ? null : item.id)}>
                    <span className="research-item-dot">{cfg.dot}</span>
                    <div className="research-item-info">
                      <div className="research-item-topic">{item.topic}</div>
                      <div className="research-item-meta">
                        <span style={{ color: PRIORITY_COLORS[item.priority] }}>{PRIORITY_LABELS[item.priority] ?? 'Normal'} priority</span>
                        <span>·</span>
                        <Clock size={10} />
                        {new Date(item.created_at).toLocaleDateString()}
                        {item.completed_at && (
                          <><span>→</span><CheckCircle size={10} color="#34d399" />{new Date(item.completed_at).toLocaleDateString()}</>
                        )}
                      </div>
                    </div>
                    <div className="research-item-actions" onClick={e => e.stopPropagation()}>
                      {item.status === 'pending' && (
                        <button className="research-item-delete" onClick={() => remove(item.id)} aria-label="Remove"><X size={12} /></button>
                      )}
                      {isExp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </div>
                  </div>
                  <AnimatePresence>
                    {isExp && item.rationale && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="research-item-rationale">
                        <strong>Why Raven wants to research this:</strong> {item.rationale}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/* ─── Library tab ────────────────────────────────────────────── */
function LibraryTab() {
  const [entries,   setEntries]   = useState<LibraryEntry[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<LibraryEntry | null>(null);
  const [search,    setSearch]    = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      (e.summary ?? '').toLowerCase().includes(q) ||
      (e.tags ?? []).some(t => t.toLowerCase().includes(q))
    );
  }, [entries, search]);

  useEffect(() => {
    const path = activeTab ? `/library?type=${activeTab}` : `/library`;
    setLoading(true);
    apiFetch(path).then(r => r.json()).then(data => {
      setEntries(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="library-container">
      {/* Search */}
      <div className="library-search">
        <Search size={14} className="library-search-icon" />
        <input type="text" className="library-search-input" placeholder="Search library..." value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button className="library-search-clear" onClick={() => setSearch('')} aria-label="Clear"><X size={12} /></button>}
      </div>

      {/* Type tabs */}
      <div className="library-tabs">
        {LIB_TABS.map(tab => (
          <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '40px 0' }}>Loading Raven's library...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <p style={{ fontSize: 15 }}>
            {activeTab ? `No ${activeTab.replace('_', ' ')} entries yet.` : "Raven's library is empty. Start chatting and she'll begin learning about you."}
          </p>
        </div>
      ) : (
        <div className="library-grid">
          <AnimatePresence>
            {filtered.map((entry, i) => (
              <motion.div
                key={entry.id} className="library-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.03, duration: 0.2 }}
                onClick={() => setSelected(entry)}
              >
                <div className="library-card-header">
                  <span className={`library-type-badge ${TYPE_BADGE[entry.type] ?? ''}`}>{entry.type.replace('_', ' ')}</span>
                  <span className="library-confidence">{Math.round((entry.confidence ?? 0.8) * 100)}% confidence</span>
                </div>
                <div className="library-card-title">{entry.title}</div>
                <div className="library-card-summary">{entry.summary || entry.content.slice(0, 120) + '...'}</div>
                {(entry.tags ?? []).length > 0 && (
                  <div className="library-tags">
                    {entry.tags.slice(0, 4).map(tag => <span key={tag} className="library-tag">{tag}</span>)}
                  </div>
                )}
                <div className="library-card-footer">
                  <span>{entry.source.replace('_', ' ')}</span>
                  <span>{new Date(entry.updated_at).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: '#12102a', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 20, padding: 32, maxWidth: 640, width: '100%', maxHeight: '80vh', overflow: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <span className={`library-type-badge ${TYPE_BADGE[selected.type] ?? ''}`}>{selected.type.replace('_', ' ')}</span>
                <button className="btn btn-ghost" onClick={() => setSelected(null)} aria-label="Close" style={{ fontSize: 18, padding: '4px 10px' }}>×</button>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{selected.title}</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.content}</p>
              {(selected.tags ?? []).length > 0 && (
                <div className="library-tags" style={{ marginTop: 16 }}>
                  {selected.tags.map(tag => <span key={tag} className="library-tag">{tag}</span>)}
                </div>
              )}
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-subtle)' }}>
                Source: {selected.source.replace('_', ' ')} · Updated {new Date(selected.updated_at).toLocaleString()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Root: Research & Library ───────────────────────────────── */
export default function ResearchLibraryScreen() {
  const [tab, setTab] = useState<'research' | 'library'>('research');

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top tab bar */}
      <div style={{
        padding: '12px 28px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button
          className={`tab ${tab === 'research' ? 'active' : ''}`}
          onClick={() => setTab('research')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FlaskConical size={14} /> Research Queue
        </button>
        <button
          className={`tab ${tab === 'library' ? 'active' : ''}`}
          onClick={() => setTab('library')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <BookOpen size={14} /> Knowledge Library
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {tab === 'research' ? <ResearchTab /> : <LibraryTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
