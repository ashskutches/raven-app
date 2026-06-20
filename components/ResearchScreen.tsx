'use client';
import { apiFetch } from '../lib/api';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, Clock, CheckCircle, PlusCircle, X, Play, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Collapse } from './Collapse';

interface QueueItem {
  id: string;
  topic: string;
  rationale?: string;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  created_at: string;
  completed_at?: string;
}

interface TidyResult {
  summary: string;
  removed_library: number;
  removed_queue: number;
}

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: '#94a3b8', dot: '⏳' },
  in_progress: { label: 'Researching', color: '#fbbf24', dot: '🔬' },
  completed:   { label: 'Done',        color: '#34d399', dot: '✅' },
  skipped:     { label: 'Skipped',     color: '#64748b', dot: '⏭' },
};

const PRIORITY_LABELS: Record<number, string> = { 5: 'Critical', 4: 'High', 3: 'Normal', 2: 'Low', 1: 'Background' };
const PRIORITY_COLORS: Record<number, string> = { 5: '#f87171', 4: '#fb923c', 3: '#60a5fa', 2: '#94a3b8', 1: '#475569' };

export default function ResearchScreen() {
  const [items, setItems]               = useState<QueueItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [running, setRunning]           = useState(false);
  const [tidying, setTidying]           = useState(false);
  const [tidyResult, setTidyResult]     = useState<TidyResult | null>(null);
  const [showAdd, setShowAdd]           = useState(false);
  const [newTopic, setNewTopic]         = useState('');
  const [newRationale, setNewRationale] = useState('');
  const [expanded, setExpanded]         = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const path = statusFilter === 'all' ? `/research/queue/all` : `/research/queue?status=${statusFilter}`;
      const r = await apiFetch(path);
      if (!r.ok) return;
      setItems(await r.json() as QueueItem[]);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { const i = setInterval(fetchItems, 30_000); return () => clearInterval(i); }, [fetchItems]);

  async function triggerResearch() {
    setRunning(true);
    try {
      await apiFetch(`/research/run`, { method: 'POST' });
      setTimeout(fetchItems, 8000);
    } catch { /* silent */ } finally {
      setTimeout(() => setRunning(false), 4000);
    }
  }

  async function triggerTidy() {
    setTidying(true);
    setTidyResult(null);
    try {
      const r = await apiFetch(`/research/tidy`, { method: 'POST' });
      if (r.ok) {
        const data = await r.json() as TidyResult;
        setTidyResult(data);
        // Refresh the list after tidy
        setTimeout(fetchItems, 1000);
      }
    } catch { /* silent */ } finally {
      setTidying(false);
    }
  }

  async function addTopic() {
    if (!newTopic.trim()) return;
    try {
      await apiFetch(`/research/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic.trim(), rationale: newRationale.trim() || undefined, priority: 3 }),
      });
      setNewTopic('');
      setNewRationale('');
      setShowAdd(false);
      fetchItems();
    } catch { /* silent */ }
  }

  async function deleteItem(id: string) {
    await apiFetch(`/research/queue/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  const pending   = items.filter(i => i.status === 'pending').length;
  const completed = items.filter(i => i.status === 'completed').length;

  return (
    <div className="research-screen">
      <div className="research-header">
        <div className="research-stats">
          <div className="research-stat">
            <span className="research-stat-val">{pending}</span>
            <span className="research-stat-label">pending</span>
          </div>
          <div className="research-stat">
            <span className="research-stat-val" style={{ color: '#34d399' }}>{completed}</span>
            <span className="research-stat-label">completed</span>
          </div>
          <div className="research-stat">
            <span className="research-stat-val" style={{ color: '#fbbf24' }}>{items.filter(i => i.status === 'in_progress').length}</span>
            <span className="research-stat-label">in progress</span>
          </div>
        </div>
        <div className="research-actions">
          {/* Tidy Up button */}
          <button
            id="research-tidy-btn"
            className={`research-run-btn ${tidying ? 'running' : ''}`}
            onClick={triggerTidy}
            disabled={tidying}
            title="Remove redundant, stale, or low-quality research from library and queue"
            style={{
              background: tidying
                ? 'rgba(251,191,36,0.15)'
                : 'rgba(251,191,36,0.08)',
              borderColor: 'rgba(251,191,36,0.25)',
              color: '#fbbf24',
            }}
          >
            <Sparkles size={12} className={tidying ? 'spinning' : ''} />
            {tidying ? 'Tidying...' : 'Tidy Up'}
          </button>

          <button className="research-add-btn" onClick={() => setShowAdd(v => !v)}>
            <PlusCircle size={13} /> Add topic
          </button>
          <button
            className={`research-run-btn ${running ? 'running' : ''}`}
            onClick={triggerResearch}
            disabled={running}
          >
            <Play size={12} className={running ? 'spinning' : ''} />
            {running ? 'Researching...' : 'Run now'}
          </button>
        </div>
      </div>

      {/* Tidy result banner */}
      <AnimatePresence>
        {tidyResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              margin: '0 0 14px',
              padding: '12px 16px',
              background: 'rgba(251,191,36,0.07)',
              border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: 10,
              fontSize: 13,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                  ✨ Tidy complete — {tidyResult.removed_library} library entries + {tidyResult.removed_queue} queue items removed
                </span>
                <button
                  onClick={() => setTidyResult(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 2 }}
                  aria-label="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
              {tidyResult.summary && (
                <p style={{ marginTop: 6, color: 'var(--color-text-muted)', lineHeight: 1.5, fontSize: 12 }}>
                  {tidyResult.summary}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add topic form */}
      <Collapse open={showAdd} className="research-add-form">
        <input
          className="research-input"
          placeholder="Research topic..."
          value={newTopic}
          onChange={e => setNewTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTopic()}
          autoFocus
        />
        <input
          className="research-input"
          placeholder="Why is this relevant to Ash? (optional)"
          value={newRationale}
          onChange={e => setNewRationale(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTopic()}
        />
        <div className="research-add-actions">
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }} onClick={addTopic}>
            Add to Queue
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowAdd(false)}>
            Cancel
          </button>
        </div>
      </Collapse>

      {/* Status filter */}
      <div className="research-filters">
        {(['pending', 'completed', 'all'] as const).map(s => (
          <button
            key={s}
            className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="research-list">
        {loading ? (
          <div className="research-empty">Loading research queue...</div>
        ) : items.length === 0 ? (
          <div className="research-empty">
            <FlaskConical size={32} opacity={0.3} />
            <p>No {statusFilter} topics. Raven will auto-generate topics based on what she knows about you.</p>
          </div>
        ) : (
          <AnimatePresence>
            {items.map(item => {
              const cfg = STATUS_CONFIG[item.status];
              const isExpanded = expanded === item.id;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="research-item"
                >
                  <div className="research-item-header" onClick={() => setExpanded(isExpanded ? null : item.id)}>
                    <span className="research-item-dot">{cfg.dot}</span>
                    <div className="research-item-info">
                      <div className="research-item-topic">{item.topic}</div>
                      <div className="research-item-meta">
                        <span style={{ color: PRIORITY_COLORS[item.priority] }}>
                          {PRIORITY_LABELS[item.priority] ?? 'Normal'} priority
                        </span>
                        <span>·</span>
                        <Clock size={10} />
                        {new Date(item.created_at).toLocaleDateString()}
                        {item.completed_at && (
                          <>
                            <span>→</span>
                            <CheckCircle size={10} color="#34d399" />
                            {new Date(item.completed_at).toLocaleDateString()}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="research-item-actions" onClick={e => e.stopPropagation()}>
                      {item.status === 'pending' && (
                        <button className="research-item-delete" onClick={() => deleteItem(item.id)} aria-label="Remove">
                          <X size={12} />
                        </button>
                      )}
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </div>
                  </div>

                  <Collapse open={isExpanded && !!item.rationale} className="research-item-rationale">
                    <strong>Why Raven wants to research this:</strong> {item.rationale}
                  </Collapse>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
