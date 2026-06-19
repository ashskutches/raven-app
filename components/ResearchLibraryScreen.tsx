'use client';
import { apiFetch } from '../lib/api';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, FlaskConical, BookOpen, Play, PlusCircle,
  Clock, CheckCircle, ChevronDown, ChevronUp, Zap,
  Lightbulb, MessageSquare, ArrowRight, RotateCcw,
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

interface LiveStep {
  type: 'status' | 'step' | 'result' | 'error' | 'done';
  message?: string;
  step?: string;
  detail?: string;
  topic?: string;
  summary?: string;
  findings?: string[];
  insights?: string[];
  questions?: string[];
  follow_up_topics?: Array<{ topic: string; rationale: string; priority: number }>;
  library_entry_id?: string;
}

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

const STEP_LABELS: Record<string, string> = {
  queue:      '📥 Queuing topic',
  started:    '🔬 Research started',
  profile:    '🧠 Loading your context',
  search:     '🌐 Searching the web',
  scrape:     '📄 Deep-reading article',
  synthesize: '✨ Synthesizing findings',
  saving:     '💾 Saving to library',
};

/* ─── Research Now tab ───────────────────────────────────────── */
function ResearchNowTab() {
  const [topic, setTopic]       = useState('');
  const [running, setRunning]   = useState(false);
  const [steps, setSteps]       = useState<LiveStep[]>([]);
  const [result, setResult]     = useState<LiveStep | null>(null);
  const [error, setError]       = useState('');
  const [discussed, setDiscussed] = useState(false);
  const abortRef                = useRef<AbortController | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setSteps([]);
    setResult(null);
    setError('');
    setDiscussed(false);

    abortRef.current = new AbortController();

    try {
      const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'https://raven-api-production.up.railway.app';
      const SECRET    = '';

      // Use proxy for SSE
      const res = await fetch('/api/proxy/research/run-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(topic.trim() ? { topic: topic.trim() } : {}),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as LiveStep;
            if (evt.type === 'done') break;
            if (evt.type === 'error') { setError(evt.message ?? 'Unknown error'); break; }
            if (evt.type === 'result') { setResult(evt); }
            setSteps(prev => [...prev, evt]);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setSteps([]);
    setResult(null);
    setError('');
    setRunning(false);
    setDiscussed(false);
  };

  const openChat = () => {
    if (!result) return;
    // Navigate to chat with a pre-filled message about this research
    const msg = `Let's talk about what you just found on "${result.topic}". What's most relevant to me right now?`;
    // Store in sessionStorage for ChatScreen to pick up
    try { sessionStorage.setItem('raven_prefill', msg); } catch {}
    window.location.href = '/chat';
  };

  const isIdle = !running && steps.length === 0 && !result;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Topic input */}
      <div style={{
        padding: '20px 22px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Research a topic right now</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Leave blank to research the top-priority item in Raven's queue, or type something specific.
          Raven will search the web, synthesize findings for your situation, and save everything to her library.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !running && run()}
            placeholder="e.g. sleep apnea and energy levels, habit stacking for ADHD..."
            disabled={running}
            style={{
              flex: 1, padding: '10px 14px',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 10, color: 'var(--color-text)', fontSize: 13,
              outline: 'none', fontFamily: 'var(--font-sans)',
            }}
          />
          {(running || result) ? (
            <button className="btn btn-ghost" onClick={reset} style={{ gap: 6, flexShrink: 0 }}>
              <RotateCcw size={13} /> Reset
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={run}
              disabled={running}
              style={{ gap: 6, flexShrink: 0 }}
            >
              <Zap size={13} /> Research Now
            </button>
          )}
        </div>
      </div>

      {/* Live progress */}
      {steps.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '18px 20px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Live Progress
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.filter(s => s.type === 'status' || s.type === 'step').map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: i === steps.filter(s2 => s2.type === 'status' || s2.type === 'step').length - 1 && running
                    ? 'rgba(251,191,36,0.2)' : 'rgba(52,211,153,0.15)',
                  border: `1px solid ${i === steps.filter(s2 => s2.type === 'status' || s2.type === 'step').length - 1 && running ? '#fbbf24' : '#34d399'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  {i === steps.filter(s2 => s2.type === 'status' || s2.type === 'step').length - 1 && running
                    ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', animation: 'pulse 1s infinite' }} />
                    : <CheckCircle size={11} color="#34d399" />
                  }
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                    {s.type === 'step' && s.step ? (STEP_LABELS[s.step] ?? s.step) : s.message}
                  </div>
                  {s.type === 'step' && s.detail && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1 }}>{s.detail}</div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
          <div ref={bottomRef} />
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.2)',
            fontSize: 13, color: '#fda4af',
          }}
        >
          ❌ {error}
        </motion.div>
      )}

      {/* Result card */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{
            borderRadius: 18, overflow: 'hidden',
            border: '1px solid rgba(167,139,250,0.25)',
            background: 'rgba(15,12,31,0.95)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(124,58,237,0.08))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <FlaskConical size={16} style={{ color: 'var(--color-lavender)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-lavender)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Research Complete</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.3px' }}>{result.topic}</h3>
          </div>

          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Key Findings */}
            {result.findings && result.findings.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-lavender)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  Key Findings
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {result.findings.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-lavender)', flexShrink: 0, marginTop: 7 }} />
                      <span style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--color-text)' }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How It Applies */}
            {result.summary && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  How This Applies to You
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--color-text-muted)', margin: 0 }}>{result.summary}</p>
              </div>
            )}

            {/* Actionable Insights */}
            {result.insights && result.insights.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  <Lightbulb size={11} style={{ display: 'inline', marginRight: 5 }} />
                  What You Can Do
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.insights.map((ins, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#34d399', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, lineHeight: 1.6 }}>{ins}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Questions */}
            {result.questions && result.questions.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  <MessageSquare size={11} style={{ display: 'inline', marginRight: 5 }} />
                  Questions This Raises
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.questions.map((q, i) => (
                    <div key={i} style={{
                      fontSize: 13, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10,
                      background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)',
                      fontStyle: 'italic', color: 'var(--color-text)',
                    }}>
                      "{q}"
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up topics */}
            {result.follow_up_topics && result.follow_up_topics.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  Queued for Follow-up Research
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.follow_up_topics.map((ft, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 12, color: 'var(--color-text-muted)',
                      padding: '7px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)',
                    }}>
                      <ArrowRight size={11} style={{ flexShrink: 0, color: 'var(--color-text-subtle)' }} />
                      {ft.topic}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button
                className="btn btn-primary"
                onClick={openChat}
                style={{ gap: 7, flex: 1, justifyContent: 'center' }}
              >
                <MessageSquare size={13} /> Discuss with Raven
              </button>
              <button
                className="btn btn-ghost"
                onClick={reset}
                style={{ gap: 6 }}
              >
                <Zap size={12} /> Research Another
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Idle state */}
      {isIdle && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ready to research</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-subtle)', maxWidth: 360, margin: '0 auto', lineHeight: 1.65 }}>
            Hit "Research Now" and Raven will pick the top queued topic, search the web, synthesize it for your situation, and bring the results here live.
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Research Queue tab ─────────────────────────────────────── */
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
  const [tab, setTab] = useState<'now' | 'queue' | 'library'>('queue');

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top tab bar */}
      <div style={{
        padding: '12px 28px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button
          className={`tab ${tab === 'now' ? 'active' : ''}`}
          onClick={() => setTab('now')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Zap size={14} /> Research Now
        </button>
        <button
          className={`tab ${tab === 'queue' ? 'active' : ''}`}
          onClick={() => setTab('queue')}
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
          {tab === 'now'     ? <ResearchNowTab /> :
           tab === 'queue'   ? <ResearchTab />    :
                               <LibraryTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
