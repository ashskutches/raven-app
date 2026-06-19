'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, ChevronDown, Globe, BookOpen, Database, Zap, Link, Target, ClipboardList } from 'lucide-react';
import { apiFetch } from '../lib/api';

/* ─── Types ──────────────────────────────────────────────────────── */
interface ToolEvent {
  tool:   string;
  args?:  Record<string, unknown>;
  result?: string; // condensed result text
  done:   boolean;
}

interface Message {
  id:           string;
  role:         'user' | 'assistant';
  content:      string;
  streaming?:   boolean;
  toolEvents?:  ToolEvent[];
  activeToolIndicator?: string;
}

/* ─── Constants ──────────────────────────────────────────────────── */
const SUGGESTIONS = [
  "Let's set a goal together",
  "How am I doing this week?",
  "I need to talk something through",
  "What should I focus on today?",
];

const CONV_KEY    = 'raven_conversation_id';
const CONV_TS_KEY = 'raven_conversation_ts';
const CONV_TTL_MS = 24 * 60 * 60 * 1000;

/* ─── Tool metadata ──────────────────────────────────────────────── */
const TOOL_META: Record<string, { label: (args?: Record<string, unknown>) => string; icon: typeof Globe; color: string }> = {
  web_search:       { label: (a) => `Searched "${(a?.query as string) ?? '...'}"`,  icon: Globe,        color: '#60a5fa' },
  read_url:         { label: (a) => `Read ${(a?.url as string)?.replace(/^https?:\/\//, '').split('/')[0] ?? 'article'}`, icon: Link, color: '#a78bfa' },
  store_research:   { label: ()  => 'Saved to library',                             icon: Database,     color: '#34d399' },
  recall_memory:    { label: (a) => `Recalled: "${(a?.query as string)?.slice(0,40) ?? '...'}"`, icon: BookOpen, color: '#fbbf24' },
  create_goal:      { label: (a) => `Created goal: "${(a?.title as string) ?? '...'}"`, icon: Target,  color: '#f472b6' },
  update_goal_progress: { label: () => 'Updated goal progress',                      icon: Target,      color: '#f472b6' },
  log_check_in:     { label: ()  => 'Logged check-in',                              icon: ClipboardList, color: '#4ade80' },
  update_ash_fact:  { label: (a) => `Remembered: ${(a?.key as string) ?? '...'}`,   icon: Database,    color: '#fbbf24' },
  queue_research_topic: { label: (a) => `Queued research: "${(a?.topic as string) ?? '...'}"`, icon: Zap, color: '#fb923c' },
  send_voice_message: { label: () => 'Sent voice message',                           icon: Sparkles,    color: '#e879f9' },
};

function toolMeta(tool: string, args?: Record<string, unknown>) {
  const m = TOOL_META[tool];
  if (m) return { label: m.label(args), Icon: m.icon, color: m.color };
  return { label: `Used ${tool.replace(/_/g, ' ')}`, Icon: Zap, color: '#94a3b8' };
}

/* ─── Session persistence ────────────────────────────────────────── */
function loadPersistedConversationId(): string | null {
  try {
    const ts = Number(localStorage.getItem(CONV_TS_KEY) ?? '0');
    if (Date.now() - ts > CONV_TTL_MS) {
      localStorage.removeItem(CONV_KEY);
      localStorage.removeItem(CONV_TS_KEY);
      return null;
    }
    return localStorage.getItem(CONV_KEY);
  } catch { return null; }
}

function persistConversationId(id: string) {
  try {
    localStorage.setItem(CONV_KEY, id);
    localStorage.setItem(CONV_TS_KEY, String(Date.now()));
  } catch { /* storage unavailable */ }
}

/* ─── Markdown renderer ──────────────────────────────────────────── */
function RavenMarkdown({ content }: { content: string }) {
  const lines   = content.split('\n');
  const parts: React.ReactNode[] = [];
  let i = 0;

  const inlineFormat = (text: string) => {
    // Process inline formatting: bold, italic, inline code, links
    const segments: React.ReactNode[] = [];
    let remaining = text;
    let key       = 0;

    while (remaining) {
      // Bold
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
      if (boldMatch) {
        if (boldMatch[1]) segments.push(boldMatch[1]);
        segments.push(<strong key={key++}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
        continue;
      }
      // Italic
      const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
      if (italicMatch) {
        if (italicMatch[1]) segments.push(italicMatch[1]);
        segments.push(<em key={key++}>{italicMatch[2]}</em>);
        remaining = italicMatch[3];
        continue;
      }
      // Inline code
      const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
      if (codeMatch) {
        if (codeMatch[1]) segments.push(codeMatch[1]);
        segments.push(<code key={key++} style={{ background: 'rgba(167,139,250,0.15)', borderRadius: 4, padding: '1px 5px', fontSize: '0.88em', fontFamily: 'monospace', color: '#c4b5fd' }}>{codeMatch[2]}</code>);
        remaining = codeMatch[3];
        continue;
      }
      segments.push(remaining);
      break;
    }
    return segments;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    if (line.startsWith('### ')) {
      parts.push(<h4 key={i} style={{ fontSize: '0.95em', fontWeight: 700, color: 'var(--color-lavender)', margin: '16px 0 4px', letterSpacing: '-0.2px' }}>{inlineFormat(line.slice(4))}</h4>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      parts.push(<h3 key={i} style={{ fontSize: '1.05em', fontWeight: 800, color: '#e2e8f0', margin: '18px 0 6px', letterSpacing: '-0.3px' }}>{inlineFormat(line.slice(3))}</h3>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      parts.push(<h2 key={i} style={{ fontSize: '1.15em', fontWeight: 800, color: '#fff', margin: '20px 0 8px' }}>{inlineFormat(line.slice(2))}</h2>);
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      parts.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0' }} />);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      parts.push(
        <blockquote key={i} style={{ borderLeft: '3px solid var(--color-lavender)', paddingLeft: 12, margin: '8px 0', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Unordered list — collect consecutive list items
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('• '))) {
        items.push(<li key={i} style={{ marginBottom: 3, lineHeight: 1.6 }}>{inlineFormat(lines[i].slice(2))}</li>);
        i++;
      }
      parts.push(<ul key={`ul-${i}`} style={{ paddingLeft: 18, margin: '6px 0 10px', listStyleType: 'disc' }}>{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const text = lines[i].replace(/^\d+\.\s/, '');
        items.push(<li key={i} style={{ marginBottom: 3, lineHeight: 1.6 }}>{inlineFormat(text)}</li>);
        i++;
      }
      parts.push(<ol key={`ol-${i}`} style={{ paddingLeft: 20, margin: '6px 0 10px' }}>{items}</ol>);
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const langLine = line.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      parts.push(
        <pre key={`code-${i}`} style={{
          background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '12px 14px',
          margin: '10px 0', overflowX: 'auto', fontSize: '0.84em',
          fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.08)',
          color: '#c4b5fd',
        }}>
          {langLine && <span style={{ fontSize: '0.78em', color: '#64748b', display: 'block', marginBottom: 6 }}>{langLine}</span>}
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Empty line → spacing
    if (line.trim() === '') {
      parts.push(<div key={i} style={{ height: 8 }} />);
      i++; continue;
    }

    // Regular paragraph
    parts.push(<p key={i} style={{ margin: '3px 0', lineHeight: 1.7 }}>{inlineFormat(line)}</p>);
    i++;
  }

  return <div style={{ fontSize: '0.925rem' }}>{parts}</div>;
}

/* ─── Tool trace bubble ──────────────────────────────────────────── */
function ToolTrace({ events }: { events: ToolEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const done = events.filter(e => e.done);
  if (done.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
      style={{ marginBottom: 10 }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
          fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)',
          transition: 'all 0.15s',
        }}
      >
        <Zap size={11} style={{ color: '#fbbf24' }} />
        {done.length} action{done.length !== 1 ? 's' : ''} taken
        <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}
          >
            {done.map((ev, i) => {
              const { label, Icon, color } = toolMeta(ev.tool, ev.args);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <Icon size={12} style={{ color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>{label}</div>
                    {ev.result && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{ev.result}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Live tool indicator ────────────────────────────────────────── */
function LiveToolIndicator({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 100,
        background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: '0.8rem', color: '#fbbf24' }}>{text}</span>
      <span className="tool-indicator-dots" style={{ display: 'flex', gap: 2 }}>
        {[0,1,2].map(n => (
          <span key={n} style={{
            width: 4, height: 4, borderRadius: '50%', background: '#fbbf24',
            animation: `bounce 1.2s infinite ${n * 0.2}s`,
          }} />
        ))}
      </span>
    </motion.div>
  );
}

/* ─── Main Chat Screen ───────────────────────────────────────────── */
export default function ChatScreen() {
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [isStreaming, setIsStreaming]  = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => loadPersistedConversationId());
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const abortRef        = useRef<AbortController | null>(null);

  // Pick up prefill from Research Now → Discuss with Raven handoff
  useEffect(() => {
    try {
      const prefill = sessionStorage.getItem('raven_prefill');
      if (prefill) {
        sessionStorage.removeItem('raven_prefill');
        // Small delay so the component is fully mounted
        setTimeout(() => sendMessage(prefill), 300);
      }
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const asstId  = crypto.randomUUID();
    const asstMsg: Message = { id: asstId, role: 'assistant', content: '', streaming: true, toolEvents: [] };

    setMessages(prev => [...prev, userMsg, asstMsg]);
    setInput('');
    setIsStreaming(true);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    abortRef.current = new AbortController();

    // Track tool state
    const toolBuffer: Map<string, ToolEvent> = new Map();

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: text });

      const response = await fetch('/api/proxy/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history, conversationId }),
        signal:  abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const convId = response.headers.get('X-Conversation-Id');
      if (convId) { setConversationId(convId); persistConversationId(convId); }

      const reader  = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6)) as Record<string, unknown>;

            // ── Text delta
            if (data.text) {
              accumulated += data.text as string;
              setMessages(prev => prev.map(m =>
                m.id === asstId ? { ...m, content: accumulated, activeToolIndicator: undefined } : m
              ));
            }

            // ── Tool starting
            if (data.tool_call) {
              const tool  = data.tool_call as string;
              const args  = (data.args ?? {}) as Record<string, unknown>;
              const { label, Icon } = toolMeta(tool, args);
              const icon = Icon;
              void icon; // satisfy lint
              const indicator = `${toolMeta(tool, args).label}`;

              // Register in buffer as in-progress
              toolBuffer.set(tool + Date.now(), { tool, args, done: false });

              setMessages(prev => prev.map(m =>
                m.id === asstId ? { ...m, activeToolIndicator: `⚙️ ${label}` } : m
              ));
            }

            // ── Tool result
            if (data.tool_result !== undefined) {
              const tool   = data.tool_call as string | undefined;
              const result = typeof data.tool_result === 'string'
                ? data.tool_result.slice(0, 120)
                : undefined;

              // Find and complete the most recent in-progress tool
              const pendingKey = [...toolBuffer.entries()].reverse().find(([,v]) => !v.done)?.[0];
              if (pendingKey) {
                const ev = toolBuffer.get(pendingKey)!;
                toolBuffer.set(pendingKey, { ...ev, result, done: true });
              } else if (tool) {
                const k = tool + Date.now();
                toolBuffer.set(k, { tool, done: true, result });
              }

              setMessages(prev => prev.map(m =>
                m.id === asstId
                  ? { ...m, activeToolIndicator: undefined, toolEvents: [...toolBuffer.values()] }
                  : m
              ));
            }

            // ── Corrected text (CAPABILITY_REQUEST stripped)
            if (data.correctedText) {
              accumulated = data.correctedText as string;
              setMessages(prev => prev.map(m =>
                m.id === asstId ? { ...m, content: accumulated } : m
              ));
            }

            // ── Stream error
            if (data.error) {
              setMessages(prev => prev.map(m =>
                m.id === asstId ? { ...m, content: 'I hit a snag. Please try again.', streaming: false } : m
              ));
              apiFetch('/evolution', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'error', title: `Chat stream error`, description: data.error, priority: 'high', source: 'runtime' }),
              }).catch(() => {});
              return;
            }

            // ── Done
            if (data.done) {
              const serverId = (data as { conversationId?: string }).conversationId;
              if (serverId && serverId !== conversationId) {
                setConversationId(serverId);
                persistConversationId(serverId);
              }
              break;
            }
          } catch { /* skip malformed */ }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === asstId
          ? { ...m, streaming: false, activeToolIndicator: undefined, toolEvents: [...toolBuffer.values()] }
          : m
      ));

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, content: 'I hit a snag. Please try again.', streaming: false } : m
      ));
      apiFetch('/evolution', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'error', title: `Chat fetch error`, description: (err as Error).message, priority: 'high', source: 'runtime' }),
      }).catch(() => {});
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages-scroll">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <motion.div
              className="raven-glyph"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              🦅
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <h2>Hey, I'm Raven.</h2>
              <p style={{ marginTop: 8 }}>
                Your personal AI coach. I'm here to talk, plan, push back when you need it, and help you get where you're going.
              </p>
            </motion.div>
            <motion.div className="suggestion-chips" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} className="chip" onClick={() => sendMessage(s)}>{s}</button>
              ))}
            </motion.div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                className={`message ${msg.role}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="message-avatar">
                  {msg.role === 'assistant' ? '🦅' : '🧠'}
                </div>
                <div className="message-bubble-wrapper" style={{ flex: 1, minWidth: 0 }}>

                  {/* Tool trace — persisted actions above the response */}
                  {msg.role === 'assistant' && (msg.toolEvents?.filter(e => e.done).length ?? 0) > 0 && (
                    <ToolTrace events={msg.toolEvents!} />
                  )}

                  {/* Live tool indicator */}
                  <AnimatePresence>
                    {msg.activeToolIndicator && (
                      <LiveToolIndicator text={msg.activeToolIndicator} />
                    )}
                  </AnimatePresence>

                  {/* Message bubble */}
                  {(msg.content || (!msg.streaming && !msg.activeToolIndicator)) && (
                    <div className={`message-bubble ${msg.streaming && !msg.activeToolIndicator ? 'streaming-cursor' : ''}`}>
                      {msg.role === 'assistant'
                        ? <RavenMarkdown content={msg.content} />
                        : <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                      }
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Talk to Raven... (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="Message input"
            disabled={isStreaming}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
          >
            {isStreaming
              ? <Sparkles size={16} style={{ animation: 'pulse 1s infinite' }} />
              : <Send size={16} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
