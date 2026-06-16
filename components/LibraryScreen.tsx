'use client';
import { apiFetch } from '../lib/api';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';

type LibraryEntry = {
  id: string;
  title: string;
  type: string;
  content: string;
  summary: string;
  tags: string[];
  source: string;
  confidence: number;
  created_at: string;
  updated_at: string;
};

const TABS = [
  { id: '', label: 'All' },
  { id: 'user_fact', label: 'About Me' },
  { id: 'family', label: 'Family & People' },
  { id: 'goal_context', label: 'Goals' },
  { id: 'research', label: 'Research' },
  { id: 'insight', label: 'Insights' },
  { id: 'reference', label: 'References' },
] as const;

const TYPE_COLORS: Record<string, string> = {
  research: 'badge-research',
  user_fact: 'badge-user_fact',
  family: 'badge-family',
  goal_context: 'badge-goal_context',
  insight: 'badge-insight',
  reference: 'badge-reference',
};


export default function LibraryScreen() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [search, setSearch] = useState('');

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
    apiFetch(path)
      .then(r => r.json())
      .then(data => {
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="library-container">
      {/* Search */}
      <div className="library-search">
        <Search size={14} className="library-search-icon" />
        <input
          type="text"
          className="library-search-input"
          placeholder="Search library..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="library-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="library-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '40px 0' }}>
          Loading Raven's library...
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <p style={{ fontSize: 15 }}>
            {activeTab
              ? `No ${activeTab.replace('_', ' ')} entries yet.`
              : "Raven's library is empty. Start chatting and she'll begin learning about you."
            }
          </p>
        </div>
      ) : (
        <div className="library-grid">
          <AnimatePresence>
            {filtered.map((entry, i) => (
              <motion.div
                key={entry.id}
                className="library-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                onClick={() => setSelected(entry)}
              >
                <div className="library-card-header">
                  <span className={`library-type-badge ${TYPE_COLORS[entry.type] ?? ''}`}>
                    {entry.type.replace('_', ' ')}
                  </span>
                  <span className="library-confidence">
                    {Math.round((entry.confidence ?? 0.8) * 100)}% confidence
                  </span>
                </div>
                <div className="library-card-title">{entry.title}</div>
                <div className="library-card-summary">
                  {entry.summary || entry.content.slice(0, 120) + '...'}
                </div>
                {entry.tags?.length > 0 && (
                  <div className="library-tags">
                    {entry.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="library-tag">{tag}</span>
                    ))}
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

      {/* Entry detail modal */}
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setSelected(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            style={{
              background: '#12102a',
              border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: 20,
              padding: 32,
              maxWidth: 640,
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <span className={`library-type-badge ${TYPE_COLORS[selected.type] ?? ''}`}>
                {selected.type.replace('_', ' ')}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => setSelected(null)}
                aria-label="Close"
                style={{ fontSize: 18, padding: '4px 10px' }}
              >
                ×
              </button>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{selected.title}</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {selected.content}
            </p>
            {selected.tags?.length > 0 && (
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
    </div>
  );
}
