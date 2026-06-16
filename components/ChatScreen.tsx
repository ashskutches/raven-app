'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';

type Message = { id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean; toolIndicator?: string };


const SUGGESTIONS = [
  "Let's set a goal together",
  "How am I doing this week?",
  "I need to talk something through",
  "What should I focus on today?",
];




const CONV_KEY = 'raven_conversation_id';
const CONV_TS_KEY = 'raven_conversation_ts';
const CONV_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => loadPersistedConversationId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMessage, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      // Build message history for API
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: text });

      const response = await fetch('/api/proxy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, conversationId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Extract conversation ID from header
      const convId = response.headers.get('X-Conversation-Id');
      if (convId) setConversationId(convId);

      // Parse SSE stream
      const reader = response.body!.getReader();
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
            const data = JSON.parse(line.slice(6));

            if (data.text) {
              accumulated += data.text;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: accumulated, toolIndicator: undefined } : m
                )
              );
            }

            // Tool call starting — show live indicator
            if (data.tool_call) {
              const labels: Record<string, string> = {
                web_search: `🔍 Searching: "${(data.args as Record<string,string>)?.query ?? '...'}"`,
                read_url: `📄 Reading article...`,
                store_research: `💾 Saving to library...`,
                recall_memory: `🧠 Recalling memories...`,
              };
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, toolIndicator: labels[data.tool_call as string] ?? `⚙️ Working...` } : m
                )
              );
            }

            // Tool done — clear indicator
            if (data.tool_result !== undefined) {
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, toolIndicator: undefined } : m)
              );
            }

            // Capability tags stripped
            if (data.correctedText) {
              accumulated = data.correctedText;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: accumulated } : m
                )
              );
            }

            // Stream-level error from API — capture + show
            if (data.error) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: 'I hit a snag. Please try again.', streaming: false }
                    : m
                )
              );
              // Report to evolution queue
              apiFetch('/evolution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'error',
                  title: `Chat stream error: ${String(data.error).slice(0, 120)}`,
                  description: data.error,
                  priority: 'high',
                  source: 'runtime',
                  context: { phase: 'streaming', conversationId },
                }),
              }).catch(() => {});
              return;
            }

            if (data.done) {
              // Persist conversationId so thread survives page refresh (24h TTL)
              const serverId = (data as { conversationId?: string }).conversationId;
              if (serverId && serverId !== conversationId) {
                setConversationId(serverId);
                persistConversationId(serverId);
              } else if (conversationId) {
                persistConversationId(conversationId);
              }
              break;
            }
          } catch { /* skip malformed */ }
        }
      }

      // Mark streaming complete
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m)
      );

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = (err as Error).message ?? 'Unknown fetch error';
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'I hit a snag. Please try again.', streaming: false }
            : m
        )
      );
      // Report fetch-level error to evolution queue
      apiFetch(`/evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'error',
          title: `Chat fetch error: ${msg.slice(0, 120)}`,
          description: msg,
          priority: 'high',
          source: 'runtime',
          context: { phase: 'fetch' },
        }),
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
          /* Empty state */
          <div className="chat-empty">
            <motion.div
              className="raven-glyph"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              🦅
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h2>Hey, I'm Raven.</h2>
              <p style={{ marginTop: 8 }}>
                Your personal AI coach. I'm here to talk, plan, push back when you need it, and help you get where you're going.
              </p>
            </motion.div>
            <motion.div
              className="suggestion-chips"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              {SUGGESTIONS.map(s => (
                <button key={s} className="chip" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </motion.div>
          </div>
        ) : (
          /* Message thread */
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
                <div className={`message-bubble ${msg.streaming && !msg.toolIndicator ? 'streaming-cursor' : ''}`}>
                  {msg.toolIndicator ? (
                    <div className="tool-indicator">
                      <span className="tool-indicator-text">{msg.toolIndicator}</span>
                      <span className="tool-indicator-dots"><span>.</span><span>.</span><span>.</span></span>
                    </div>
                  ) : (
                    <SimpleMarkdown content={msg.content} />
                  )}
                  {msg.toolIndicator && msg.content && <SimpleMarkdown content={msg.content} />}
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

/** Lightweight markdown renderer — handles bold, italic, lists, inline code */
function SimpleMarkdown({ content }: { content: string }) {
  const html = content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .split('\n')
    .map(line => {
      if (line.startsWith('- ') || line.startsWith('• ')) return `<li>${line.slice(2)}</li>`;
      if (line.startsWith('## ')) return `<h3>${line.slice(3)}</h3>`;
      if (line.trim() === '') return '<br/>';
      return `<p>${line}</p>`;
    })
    .join('');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
