'use client';
import { apiFetch } from '../lib/api';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Sparkles, Send, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

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

type ChatMessage = { role: 'user' | 'assistant'; content: string };

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

/* ── Reflect panel ─────────────────────────────────────────────────── */

function ReflectPanel({ entry }: { entry: LibraryEntry }) {
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [streaming, setStreaming]     = useState(false);
  const [streamText, setStreamText]   = useState('');
  const [input, setInput]             = useState('');
  const [showContent, setShowContent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  const streamReflection = useCallback(async (msgs: ChatMessage[]) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStreaming(true);
    setStreamText('');

    try {
      const res = await apiFetch(`/library/${entry.id}/reflect`, {
        method: 'POST',
        body: JSON.stringify({ messages: msgs }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.text) {
              full += parsed.text;
              setStreamText(full);
            }
            if (parsed.done) {
              setMessages(prev => [...prev, { role: 'assistant', content: full }]);
              setStreamText('');
              setStreaming(false);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStreamText('');
        setStreaming(false);
      }
    }
  }, [entry.id]);

  // Auto-trigger reflection when panel mounts
  useEffect(() => {
    streamReflection([]);
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  // Scroll to bottom when streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText, messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');

    const newMsg: ChatMessage = { role: 'user', content: text };
    const updatedMsgs = [...messages, newMsg];
    setMessages(updatedMsgs);

    await streamReflection(updatedMsgs);
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreamText('');
    streamReflection([]);
  };

  const allMessages = [...messages, ...(streamText ? [{ role: 'assistant' as const, content: streamText }] : [])];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* ── Collapsible raw content ─────────── */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setShowContent(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-subtle)', fontSize: 12, fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase', fontSize: 10.5 }}>
            Research Content
          </span>
          {showContent ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        <AnimatePresence>
          {showContent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ padding: '0 20px 14px', maxHeight: 200, overflowY: 'auto' }}>
                <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {entry.content}
                </p>
                {entry.tags?.length > 0 && (
                  <div className="library-tags" style={{ marginTop: 10 }}>
                    {entry.tags.map(tag => <span key={tag} className="library-tag">{tag}</span>)}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Conversation ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {allMessages.length === 0 && !streaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-subtle)', fontSize: 13 }}>
            <Sparkles size={14} color="var(--color-lavender)" />
            <span>Raven is thinking...</span>
          </div>
        )}

        {allMessages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {msg.role === 'assistant' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* Raven avatar */}
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, marginTop: 2,
                }}>
                  ✦
                </div>
                <div style={{
                  background: 'rgba(167,139,250,0.08)',
                  border: '1px solid rgba(167,139,250,0.15)',
                  borderRadius: '4px 14px 14px 14px',
                  padding: '10px 14px',
                  fontSize: 13.5,
                  color: 'var(--color-text)',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  flex: 1,
                }}>
                  {msg.content}
                  {/* Streaming cursor */}
                  {i === allMessages.length - 1 && streaming && (
                    <span style={{
                      display: 'inline-block', width: 2, height: 14,
                      background: 'var(--color-lavender)', marginLeft: 2,
                      animation: 'blink 1s step-end infinite', verticalAlign: 'middle',
                    }} />
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '14px 4px 14px 14px',
                  padding: '9px 14px',
                  fontSize: 13.5,
                  color: 'var(--color-text)',
                  lineHeight: 1.6,
                  maxWidth: '80%',
                }}>
                  {msg.content}
                </div>
              </div>
            )}
          </motion.div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Input row ─────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 14px',
        display: 'flex', gap: 8, alignItems: 'center',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.2)',
      }}>
        <button
          onClick={reset}
          title="Reset conversation"
          aria-label="Reset conversation"
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            padding: '7px 8px', cursor: 'pointer', color: 'var(--color-text-subtle)',
            display: 'flex', alignItems: 'center', flexShrink: 0,
          }}
        >
          <RotateCcw size={13} />
        </button>

        <input
          id="library-reflect-input"
          placeholder="Ask Raven about this..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          disabled={streaming}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
            padding: '8px 12px', color: 'var(--color-text)',
            fontFamily: 'var(--font-sans)', fontSize: 13.5,
            outline: 'none',
          }}
          aria-label="Ask Raven a follow-up question about this research"
        />

        <button
          id="library-reflect-send"
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          aria-label="Send"
          style={{
            background: streaming || !input.trim() ? 'rgba(167,139,250,0.1)' : 'linear-gradient(135deg, #7c3aed, #6366f1)',
            border: 'none', borderRadius: 10, padding: '8px 12px',
            cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            color: 'white', display: 'flex', alignItems: 'center', flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Main screen ────────────────────────────────────────────────────── */

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
          Loading Raven&apos;s library...
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
                style={{ cursor: 'pointer' }}
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Sparkles size={10} color="var(--color-lavender)" />
                    <span style={{ fontSize: 10, color: 'var(--color-lavender)', fontWeight: 600 }}>Click to reflect</span>
                  </span>
                  <span>{new Date(entry.updated_at).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Detail + Reflect modal ──────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(10px)',
              zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.22 }}
              style={{
                background: 'linear-gradient(160deg, #13112b 0%, #0f0d22 100%)',
                border: '1px solid rgba(167,139,250,0.22)',
                borderRadius: 20,
                width: '100%',
                maxWidth: 680,
                height: '82vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{
                padding: '18px 20px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                gap: 12, flexShrink: 0,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span className={`library-type-badge ${TYPE_COLORS[selected.type] ?? ''}`}>
                      {selected.type.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--color-text-subtle)' }}>
                      {Math.round((selected.confidence ?? 0.8) * 100)}% confidence · {new Date(selected.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: 'var(--color-text)' }}>
                    {selected.title}
                  </h2>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                    color: 'var(--color-text-subtle)', fontSize: 16, flexShrink: 0,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Raven reflect label */}
              <div style={{
                padding: '8px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'rgba(124,58,237,0.06)',
                flexShrink: 0,
              }}>
                <Sparkles size={13} color="var(--color-lavender)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-lavender)', letterSpacing: '0.2px' }}>
                  Raven&apos;s reflection
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginLeft: 4 }}>
                  — ask her anything about this research
                </span>
              </div>

              {/* Reflect panel — takes remaining height */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <ReflectPanel key={selected.id} entry={selected} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Blink animation for streaming cursor */}
      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </div>
  );
}
