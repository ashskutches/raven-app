'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';

type Message = { id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean };

const SUGGESTIONS = [
  "Let's set a goal together",
  "How am I doing this week?",
  "I need to talk something through",
  "What should I focus on today?",
];

const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL || 'http://localhost:4000';

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
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

      const response = await fetch(`${RAVEN_API}/chat`, {
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
                  m.id === assistantId
                    ? { ...m, content: accumulated }
                    : m
                )
              );
            }
            if (data.done) break;
          } catch { /* skip malformed */ }
        }
      }

      // Mark streaming complete
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m)
      );

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: "I hit a snag. Please try again.", streaming: false }
            : m
        )
      );
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
                <div className={`message-bubble ${msg.streaming ? 'streaming-cursor' : ''}`}>
                  <SimpleMarkdown content={msg.content} />
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
