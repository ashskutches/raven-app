'use client';

/**
 * Mind — what she thought without being asked.
 *
 * Chat is what she says when spoken to. This is the other half: the thoughts she
 * filed on her own, what she has been told about herself, and what she believes she
 * is running on right now.
 *
 * The screen restored in `28f9f71` was the v1 component brought back verbatim. That
 * was the right call for getting the queue visible again, but it was written against
 * a `/mind` that only listed rows, and the API has grown five more surfaces since:
 * `/mind/summary`, `/mind/self`, `/mind/guide`, `/mind/feedback` and `/mind/outcomes`.
 * It used none of them, so the most direct answer to "what is she thinking" — the
 * self-knowledge block that goes into her prompt this turn — had no reader.
 *
 * Two things worth knowing about the numbers here:
 *
 *   - Counts come from `/mind/summary`, which counts server-side. The old screen
 *     measured `items.length` on a list PostgREST caps, so a backlog of 14,000 read
 *     as 200. A number that silently stops going up is worse than no number.
 *   - Unaddressed is the figure on the badges, not total. Total is history; only
 *     unaddressed is a queue with something owed on it.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, MessageCircleQuestion, Lightbulb, Sparkles, Eye, RefreshCw, Check,
  Undo2, Cpu, Wrench, EyeOff, BookOpen, MessageSquareQuote, Plug, Trash2,
  ClipboardCheck, ChevronDown, ChevronRight, Send,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

/* ── Types ────────────────────────────────────────────────────────────────── */

type DialogType =
  | 'question_for_ash' | 'observation' | 'research_idea' | 'self_improvement' | 'reflection';

interface DialogItem {
  id:          string;
  type:        DialogType;
  content:     string;
  addressed:   boolean;
  priority:    number | null;
  created_at:  string;
  asked_at:    string | null;
  answered_at: string | null;
}

interface Summary {
  summary:     Record<string, { total: number; unaddressed: number }>;
  total:       number;
  unaddressed: number;
}

interface GuideEntry {
  id:     string;
  title:  string;
  body:   string;
  source: 'ash' | 'raven' | 'seed';
  at:     string;
}

interface SelfPicture {
  tools:      { available: string[]; withheld: { name: string; why: string }[]; cap: number };
  model:      string;
  mcpServers: string[];
  guide:      GuideEntry[];
  rendered:   string;
}

interface FeedbackItem {
  id:           string;
  at:           string;
  text:         string;
  context?:     string;
  processed:    boolean;
  processedAt?: string;
  action?:      'guide_note' | 'request_filed' | 'retracted' | 'acknowledged' | 'none';
  response?:    string;
}

interface OutcomeReport {
  checked: number; closed: number; implemented: number;
  needsAsh: number; declined: number; notified: string;
}

/* ── Config ───────────────────────────────────────────────────────────────── */

const TYPE_CONFIG: Record<DialogType, {
  icon: React.ReactNode; label: string; short: string;
  color: string; bg: string; border: string; blurb: string;
}> = {
  question_for_ash: {
    icon: <MessageCircleQuestion size={14} />, label: 'Questions for Ash', short: 'Questions',
    color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)',
    blurb: 'Things she wanted to ask and had nowhere to ask them.',
  },
  observation: {
    icon: <Eye size={14} />, label: 'Observations', short: 'Observations',
    color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.22)',
    blurb: 'Patterns she noticed while working.',
  },
  research_idea: {
    icon: <Lightbulb size={14} />, label: 'Research ideas', short: 'Ideas',
    color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.22)',
    blurb: 'Threads she wants to pull on.',
  },
  self_improvement: {
    icon: <Sparkles size={14} />, label: 'Self-improvement', short: 'Self-improve',
    color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.22)',
    blurb: 'What she thinks she should do differently.',
  },
  reflection: {
    icon: <Brain size={14} />, label: 'Reflections', short: 'Reflections',
    color: '#f472b6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.22)',
    blurb: 'Her twice-daily review of her own performance.',
  },
};

const TYPE_ORDER: DialogType[] =
  ['question_for_ash', 'observation', 'self_improvement', 'research_idea', 'reflection'];

type TabId = 'now' | 'thoughts' | 'self' | 'guide' | 'feedback';

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  guide_note:    { label: 'Wrote a guide note',    color: '#a78bfa' },
  request_filed: { label: 'Filed a request',       color: '#fbbf24' },
  retracted:     { label: 'Retracted a belief',    color: '#f472b6' },
  acknowledged:  { label: 'Acknowledged',          color: '#34d399' },
  none:          { label: 'No action needed',      color: 'var(--color-text-subtle)' },
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Two of the three writers stamp a marker onto `content` before filing. Left inline
 * they read as noise at the front of every card; pulled out they are the most useful
 * thing on it — especially the outreach one, which means she wrote this to send and
 * the daily cap swallowed it.
 */
function parsePrefix(content: string): {
  body: string;
  research: string | null;
  wasQueued: boolean;
} {
  let body = content;
  let wasQueued = false;

  const queued = '[Queued outreach — surface organically] ';
  if (body.startsWith(queued)) {
    body = body.slice(queued.length);
    wasQueued = true;
  }

  const m = /^\[From research on "(.+?)"\]\s*/s.exec(body);
  if (m) return { body: body.slice(m[0].length), research: m[1], wasQueued };

  return { body, research: null, wasQueued };
}

/* ── Thought card ─────────────────────────────────────────────────────────── */

function ThoughtCard({ item, onAddress, onUnaddress }: {
  item: DialogItem;
  onAddress: (id: string) => void;
  onUnaddress: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.reflection;
  const { body, research, wasQueued } = parsePrefix(item.content);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: item.addressed ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="mind-item"
      style={{ borderColor: cfg.border, background: cfg.bg }}
    >
      <div className="mind-item-icon" style={{ color: cfg.color }}>{cfg.icon}</div>

      <div className="mind-item-body">
        <div className="mind-item-meta">
          <span className="mind-item-type" style={{ color: cfg.color }}>{cfg.label}</span>
          {(item.priority ?? 0) >= 4 && <span className="mind-item-priority">High priority</span>}
          {wasQueued && (
            <span
              title="She wrote this to send you, and hit her daily outreach cap"
              style={{
                fontSize: 10, background: 'var(--color-gold-dim)', color: 'var(--color-gold)',
                border: '1px solid rgba(251,191,36,0.25)', borderRadius: 100, padding: '1px 7px',
              }}
            >
              Never sent
            </span>
          )}
          <span className="mind-item-time">{ago(item.created_at)}</span>
        </div>

        <p className="mind-item-content" style={{ color: 'var(--color-text)' }}>{body}</p>

        {research && (
          <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 6 }}>
            while researching &ldquo;{research}&rdquo;
          </p>
        )}
      </div>

      <button
        className="mind-item-address"
        onClick={() => (item.addressed ? onUnaddress(item.id) : onAddress(item.id))}
        aria-label={item.addressed ? 'Move back to the queue' : 'Mark as addressed'}
        title={item.addressed ? 'Move back to the queue' : 'Mark as addressed'}
      >
        {item.addressed ? <Undo2 size={12} /> : <Check size={12} />}
      </button>
    </motion.div>
  );
}

/* ── Now ──────────────────────────────────────────────────────────────────── */

function NowView({ summary, pending, self, onOpenType, onAddress }: {
  summary: Summary | null;
  pending: DialogItem[];
  self: SelfPicture | null;
  onOpenType: (t: DialogType) => void;
  onAddress: (id: string) => void;
}) {
  const owed = summary?.unaddressed ?? 0;
  const top = [...pending]
    .sort((a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      {/* State of mind */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.05) 100%)',
        border: '1px solid rgba(139,92,246,0.22)',
        borderRadius: 'var(--radius-lg)', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Brain size={15} color="var(--color-lavender)" />
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--color-lavender)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            State of mind
          </span>
        </div>

        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.5 }}>
          {owed === 0
            ? 'Nothing outstanding — she has said everything she wanted to say.'
            : `${owed} thing${owed === 1 ? '' : 's'} she has thought and you have not seen.`}
        </p>

        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.55 }}>
          {summary
            ? `${summary.total.toLocaleString()} thoughts filed since she started.`
            : 'Counting…'}
          {self && ` Running on ${self.model}, with ${self.tools.available.length} of ${self.tools.cap} tools available.`}
        </p>
      </div>

      {/* Per-type backlog */}
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
      }}>
        {TYPE_ORDER.map((type, i) => {
          const cfg   = TYPE_CONFIG[type];
          const stats = summary?.summary?.[type] ?? { total: 0, unaddressed: 0 };

          return (
            <motion.button
              key={type}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              id={`mind-card-${type}`}
              onClick={() => onOpenType(type)}
              style={{
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                borderRadius: 'var(--radius-md)', padding: 15,
                textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                <span style={{ color: cfg.color, display: 'flex' }}>{cfg.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontSize: 24, fontWeight: 800,
                  color: stats.unaddressed > 0 ? 'var(--color-text)' : 'var(--color-text-subtle)',
                }}>
                  {stats.unaddressed}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-subtle)' }}>
                  waiting · {stats.total.toLocaleString()} all time
                </span>
              </div>

              <p style={{
                fontSize: 11.5, color: 'var(--color-text-subtle)',
                marginTop: 8, lineHeight: 1.5,
              }}>
                {cfg.blurb}
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* What she is waiting on */}
      {top.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-subtle)', marginTop: 2,
          }}>
            Waiting on you
          </div>
          {top.map(item => (
            <ThoughtCard key={item.id} item={item} onAddress={onAddress} onUnaddress={onAddress} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Self ─────────────────────────────────────────────────────────────────── */

function SelfPanel({ icon, label, children }: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div className="glass" style={{ padding: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--color-text-subtle)',
      }}>
        {icon}{label}
      </div>
      {children}
    </div>
  );
}

function chip(text: string, color: string, bg: string, border: string) {
  return (
    <span key={text} style={{
      fontSize: 11.5, fontFamily: 'var(--font-mono)', color, background: bg,
      border: `1px solid ${border}`, borderRadius: 100, padding: '3px 9px',
    }}>
      {text}
    </span>
  );
}

function SelfView({ self }: { self: SelfPicture | null }) {
  const [showRaw, setShowRaw] = useState(false);

  if (!self) return <div className="mind-empty">Reading her self-knowledge…</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        Generated fresh every turn from the same functions that build her API call, so this
        is what she actually believes about herself right now — not what her prompt said
        when it was written.
      </p>

      <SelfPanel icon={<Cpu size={12} />} label="Running on">
        <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          {self.model}
        </div>
      </SelfPanel>

      <SelfPanel
        icon={<Wrench size={12} />}
        label={`Tools she has (${self.tools.available.length} of a cap of ${self.tools.cap})`}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {self.tools.available.map(t =>
            chip(t, 'var(--color-text-muted)', 'rgba(255,255,255,0.05)', 'var(--color-border)'))}
        </div>
      </SelfPanel>

      {self.tools.withheld.length > 0 && (
        <SelfPanel icon={<EyeOff size={12} />} label="Defined, but switched off this turn">
          <p style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginBottom: 10, lineHeight: 1.55 }}>
            These exist in her codebase and are not being offered to her. A request to
            &ldquo;add&rdquo; one of these is her misreading her own surface.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {self.tools.withheld.map(w => (
              <div key={w.name} style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
                {chip(w.name, 'var(--color-gold)', 'var(--color-gold-dim)', 'rgba(251,191,36,0.25)')}
                <span style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>{w.why}</span>
              </div>
            ))}
          </div>
        </SelfPanel>
      )}

      <SelfPanel icon={<Plug size={12} />} label="MCP servers">
        {self.mcpServers.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-subtle)' }}>
            None registered. Connect one in Settings.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {self.mcpServers.map(s =>
              chip(s, 'var(--color-teal)', 'rgba(20,184,166,0.10)', 'rgba(20,184,166,0.25)'))}
          </div>
        )}
      </SelfPanel>

      <div className="glass" style={{ padding: 16 }}>
        <button
          onClick={() => setShowRaw(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, background: 'none',
            border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text-subtle)',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', fontFamily: 'var(--font-sans)',
          }}
        >
          {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          The exact text in her prompt ({self.rendered.length.toLocaleString()} chars)
        </button>

        {showRaw && (
          <pre style={{
            marginTop: 12, fontSize: 11.5, fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', lineHeight: 1.6, maxHeight: 420,
            overflowY: 'auto', background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            padding: 14,
          }}>
            {self.rendered}
          </pre>
        )}
      </div>
    </motion.div>
  );
}

/* ── Guide ────────────────────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  ash:   { label: 'Ash told her',      color: 'var(--color-lavender)' },
  raven: { label: 'She worked it out', color: 'var(--color-teal)' },
  seed:  { label: 'Seeded',            color: 'var(--color-text-subtle)' },
};

function GuideView({ entries, onAdd, onRemove }: {
  entries: GuideEntry[];
  onAdd: (title: string, body: string) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true); setErr(null);
    try {
      await onAdd(title.trim(), body.trim());
      setTitle(''); setBody('');
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        Notes she carries into every single turn. Each one is paid for on every request,
        so the bar is a mistake that actually happened — not a nice thought.
      </p>

      <form
        onSubmit={submit} className="glass"
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <input
          type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="What she got wrong, in a few words"
        />
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          placeholder="What is actually true, so she stops getting it wrong"
          rows={3} style={{ resize: 'vertical' }}
        />
        {err && <div style={{ fontSize: 12, color: 'var(--color-rose)' }}>{err}</div>}
        <button
          type="submit" className="btn btn-primary"
          disabled={busy || !title.trim() || !body.trim()}
          style={{ alignSelf: 'flex-start' }}
        >
          <BookOpen size={14} /> {busy ? 'Adding…' : 'Add to her guide'}
        </button>
      </form>

      {entries.length === 0 ? (
        <div className="mind-empty">Nothing in her guide yet.</div>
      ) : entries.map(e => {
        const src = SOURCE_LABEL[e.source] ?? SOURCE_LABEL.seed;
        return (
          <motion.div key={e.id} layout className="glass" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
                <p style={{
                  fontSize: 12.5, color: 'var(--color-text-muted)',
                  lineHeight: 1.6, marginTop: 6, whiteSpace: 'pre-wrap',
                }}>
                  {e.body}
                </p>
                <div style={{
                  display: 'flex', gap: 10, marginTop: 8,
                  fontSize: 11, color: 'var(--color-text-subtle)',
                }}>
                  <span style={{ color: src.color }}>{src.label}</span>
                  <span>{ago(e.at)}</span>
                </div>
              </div>
              <button
                onClick={() => onRemove(e.id)}
                className="mind-item-address"
                title="Remove — a note that turned out wrong is worse than none"
                aria-label="Remove entry"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ── Feedback ─────────────────────────────────────────────────────────────── */

function FeedbackView({ items, onSend }: {
  items: FeedbackItem[];
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await onSend(text.trim()); setText(''); }
    finally { setBusy(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        Telling her something in chat corrects one turn; the next one starts from the same
        habits. This goes somewhere that survives the conversation. She reads whatever is
        unprocessed at her next reflection (06:00 / 18:00) and writes back what she did about
        it — changed a habit, filed a capability request, retracted a belief, or nothing.
      </p>

      <form
        onSubmit={submit} className="glass"
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder="How is she behaving, and what should change?"
          rows={3} style={{ resize: 'vertical' }}
        />
        <button
          type="submit" className="btn btn-primary" disabled={busy || !text.trim()}
          style={{ alignSelf: 'flex-start' }}
        >
          <Send size={14} /> {busy ? 'Sending…' : 'Tell her'}
        </button>
      </form>

      {items.length === 0 ? (
        <div className="mind-empty">Nothing said yet.</div>
      ) : items.map(f => {
        const act = f.action ? (ACTION_LABEL[f.action] ?? ACTION_LABEL.none) : null;
        return (
          <motion.div key={f.id} layout className="glass" style={{ padding: 16 }}>
            <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{f.text}</p>

            <div style={{
              display: 'flex', gap: 10, marginTop: 8, fontSize: 11,
              color: 'var(--color-text-subtle)', flexWrap: 'wrap',
            }}>
              <span>{ago(f.at)}</span>
              {f.context && <span>{f.context}</span>}
              {!f.processed && (
                <span style={{ color: 'var(--color-gold)' }}>waiting for her next reflection</span>
              )}
            </div>

            {f.processed && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6,
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  textTransform: 'uppercase', color: act?.color ?? 'var(--color-text-subtle)',
                }}>
                  <MessageSquareQuote size={12} />
                  {act?.label ?? 'Processed'}
                  {f.processedAt && (
                    <span style={{
                      color: 'var(--color-text-subtle)', fontWeight: 400,
                      textTransform: 'none', letterSpacing: 0,
                    }}>
                      · {ago(f.processedAt)}
                    </span>
                  )}
                </div>
                {f.response && (
                  <p style={{
                    fontSize: 12.5, color: 'var(--color-text-muted)',
                    lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  }}>
                    {f.response}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────────── */

export default function MindScreen() {
  const [tab, setTab]           = useState<TabId>('now');
  const [typeFilter, setFilter] = useState<DialogType | ''>('');
  const [showAddressed, setShowAddressed] = useState(false);

  const [summary, setSummary]   = useState<Summary | null>(null);
  const [pending, setPending]   = useState<DialogItem[]>([]);
  const [thoughts, setThoughts] = useState<DialogItem[]>([]);
  const [self, setSelf]         = useState<SelfPicture | null>(null);
  const [guide, setGuide]       = useState<GuideEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);

  const [loading, setLoading]       = useState(true);
  const [reflecting, setReflecting] = useState(false);
  const [checking, setChecking]     = useState(false);
  const [flash, setFlash]           = useState<string | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /* ── Loads ─────────────────────────────────────────────── */

  const loadOverview = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        apiFetch('/mind/summary'),
        apiFetch('/mind?addressed=false&limit=200'),
      ]);
      if (s.ok) setSummary(await s.json() as Summary);
      if (p.ok) setPending(await p.json() as DialogItem[]);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  const loadThoughts = useCallback(async () => {
    try {
      const q = new URLSearchParams({ limit: '200' });
      if (typeFilter) q.set('type', typeFilter);
      if (!showAddressed) q.set('addressed', 'false');
      const r = await apiFetch(`/mind?${q}`);
      if (r.ok) setThoughts(await r.json() as DialogItem[]);
    } catch { /* silent */ }
  }, [typeFilter, showAddressed]);

  const loadSelf = useCallback(async () => {
    try {
      const r = await apiFetch('/mind/self');
      if (r.ok) setSelf(await r.json() as SelfPicture);
    } catch { /* silent */ }
  }, []);

  const loadGuide = useCallback(async () => {
    try {
      const r = await apiFetch('/mind/guide');
      if (r.ok) setGuide(((await r.json()) as { entries: GuideEntry[] }).entries ?? []);
    } catch { /* silent */ }
  }, []);

  const loadFeedback = useCallback(async () => {
    try {
      const r = await apiFetch('/mind/feedback');
      if (r.ok) setFeedback(((await r.json()) as { items: FeedbackItem[] }).items ?? []);
    } catch { /* silent */ }
  }, []);

  // The overview drives the badges on every tab, so it loads regardless of where you are.
  useEffect(() => { loadOverview(); loadSelf(); }, [loadOverview, loadSelf]);

  useEffect(() => { if (tab === 'thoughts') loadThoughts(); }, [tab, loadThoughts]);
  useEffect(() => { if (tab === 'guide')    loadGuide();    }, [tab, loadGuide]);
  useEffect(() => { if (tab === 'feedback') loadFeedback(); }, [tab, loadFeedback]);

  useEffect(() => {
    const id = setInterval(loadOverview, 60_000);
    return () => clearInterval(id);
  }, [loadOverview]);

  /* ── Actions ───────────────────────────────────────────── */

  const bumpSummary = useCallback((type: DialogType, delta: number) => {
    setSummary(s => {
      if (!s) return s;
      const row = s.summary[type] ?? { total: 0, unaddressed: 0 };
      return {
        ...s,
        unaddressed: Math.max(0, s.unaddressed + delta),
        summary: {
          ...s.summary,
          [type]: { ...row, unaddressed: Math.max(0, row.unaddressed + delta) },
        },
      };
    });
  }, []);

  const address = useCallback(async (id: string) => {
    const item = pending.find(i => i.id === id) ?? thoughts.find(i => i.id === id);
    setPending(l => l.filter(i => i.id !== id));
    setThoughts(l => l.map(i => (i.id === id ? { ...i, addressed: true } : i)));
    if (item) bumpSummary(item.type, -1);
    try {
      const r = await apiFetch(`/mind/${id}/address`, { method: 'PATCH' });
      if (!r.ok) throw new Error('address failed');
    } catch {
      // Put it back rather than leave the screen claiming something was written.
      if (item) { setPending(l => [item, ...l]); bumpSummary(item.type, 1); }
      setThoughts(l => l.map(i => (i.id === id ? { ...i, addressed: false } : i)));
    }
  }, [pending, thoughts, bumpSummary]);

  const unaddress = useCallback(async (id: string) => {
    const item = thoughts.find(i => i.id === id);
    setThoughts(l => l.map(i => (i.id === id ? { ...i, addressed: false } : i)));
    if (item) bumpSummary(item.type, 1);
    try {
      const r = await apiFetch(`/mind/${id}/unaddress`, { method: 'PATCH' });
      if (!r.ok) throw new Error('unaddress failed');
      loadOverview();
    } catch {
      setThoughts(l => l.map(i => (i.id === id ? { ...i, addressed: true } : i)));
      if (item) bumpSummary(item.type, -1);
    }
  }, [thoughts, bumpSummary, loadOverview]);

  async function reflectNow() {
    setReflecting(true);
    setFlash('Reflection started — she is reading recent events now.');
    try { await apiFetch('/mind/reflect', { method: 'POST' }); } catch { /* silent */ }
    // A reflection is an LLM call plus several table reads; it is not done in a second.
    later(() => {
      loadOverview();
      if (tab === 'thoughts') loadThoughts();
      setReflecting(false);
      setFlash(null);
    }, 20_000);
  }

  async function checkOutcomes() {
    setChecking(true);
    try {
      const r = await apiFetch('/mind/outcomes', { method: 'POST' });
      if (r.ok) {
        const o = await r.json() as OutcomeReport;
        setFlash(o.checked === 0
          ? 'Nothing of hers is in progress right now.'
          : `Checked ${o.checked} — ${o.implemented} built, ${o.needsAsh} back to you, ${o.declined} declined.`);
        later(() => setFlash(null), 8_000);
        loadOverview();
      }
    } catch { /* silent */ } finally {
      setChecking(false);
    }
  }

  async function addGuide(title: string, body: string) {
    const r = await apiFetch('/mind/guide', {
      method: 'POST',
      body: JSON.stringify({ title, body, source: 'ash' }),
    });
    const payload = await r.json().catch(() => ({})) as { entries?: GuideEntry[]; error?: string };
    if (!r.ok) throw new Error(payload.error ?? 'Could not add that');
    setGuide(payload.entries ?? []);
    loadSelf();
  }

  async function removeGuide(id: string) {
    try {
      const r = await apiFetch(`/mind/guide/${id}`, { method: 'DELETE' });
      if (!r.ok) return;
      setGuide(l => l.filter(e => e.id !== id));
      loadSelf();
    } catch { /* silent */ }
  }

  async function sendFeedback(text: string) {
    try {
      const r = await apiFetch('/mind/feedback', { method: 'POST', body: JSON.stringify({ text }) });
      if (!r.ok) return;
      loadFeedback();
      setFlash('Filed. She will read it at her next reflection.');
      later(() => setFlash(null), 6_000);
    } catch { /* silent */ }
  }

  /* ── Render ────────────────────────────────────────────── */

  const owed = summary?.unaddressed ?? 0;
  const unprocessedFeedback = feedback.filter(f => !f.processed).length;

  const TABS: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'now',      label: 'Now',      icon: <Brain size={13} />,                badge: owed },
    { id: 'thoughts', label: 'Thoughts', icon: <MessageCircleQuestion size={13} /> },
    { id: 'self',     label: 'Self',     icon: <Cpu size={13} /> },
    { id: 'guide',    label: 'Guide',    icon: <BookOpen size={13} />,             badge: guide.length },
    { id: 'feedback', label: 'Feedback', icon: <MessageSquareQuote size={13} />,   badge: unprocessedFeedback },
  ];

  return (
    <div className="mind-screen">
      <div className="mind-header">
        <div className="mind-header-info">
          <Brain size={16} className="mind-brain-icon" />
          <p className="mind-header-desc">
            What she thought without being asked — the questions she is holding, what she
            believes she is running on, and the notes she carries into every turn.
          </p>
        </div>

        <div className="mind-header-actions">
          <button
            className="mind-toggle-addressed"
            onClick={checkOutcomes}
            disabled={checking}
            title="Check what became of the requests she filed. If any have closed, she will also tell you on Discord."
          >
            <ClipboardCheck size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
            {checking ? 'Checking…' : 'Check outcomes'}
          </button>

          <button
            className={`mind-reflect-btn ${reflecting ? 'reflecting' : ''}`}
            onClick={reflectNow}
            disabled={reflecting}
          >
            <RefreshCw size={12} className={reflecting ? 'spinning' : ''} />
            {reflecting ? 'Reflecting…' : 'Reflect now'}
          </button>
        </div>
      </div>

      <div className="mind-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            id={`mind-tab-${t.id}`}
            className={`mind-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
            {!!t.badge && <span className="mind-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'rgba(167,139,250,0.10)',
              borderBottom: '1px solid rgba(167,139,250,0.22)',
              color: 'var(--color-lavender)', fontSize: 12.5,
              padding: '9px 24px', flexShrink: 0, overflow: 'hidden',
            }}
          >
            {flash}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mind-feed">
        {loading ? (
          <div className="mind-empty">Reading her mind…</div>
        ) : tab === 'now' ? (
          <NowView
            summary={summary} pending={pending} self={self}
            onOpenType={t => { setFilter(t); setTab('thoughts'); }}
            onAddress={address}
          />
        ) : tab === 'self' ? (
          <SelfView self={self} />
        ) : tab === 'guide' ? (
          <GuideView entries={guide} onAdd={addGuide} onRemove={removeGuide} />
        ) : tab === 'feedback' ? (
          <FeedbackView items={feedback} onSend={sendFeedback} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              <button
                className={`mind-tab ${typeFilter === '' ? 'active' : ''}`}
                onClick={() => setFilter('')}
              >
                Everything
              </button>
              {TYPE_ORDER.map(t => (
                <button
                  key={t}
                  className={`mind-tab ${typeFilter === t ? 'active' : ''}`}
                  onClick={() => setFilter(t)}
                >
                  {TYPE_CONFIG[t].icon}
                  {TYPE_CONFIG[t].short}
                  {!!summary?.summary?.[t]?.unaddressed && (
                    <span className="mind-tab-badge">{summary.summary[t].unaddressed}</span>
                  )}
                </button>
              ))}
              <button
                className="mind-toggle-addressed"
                style={{ marginLeft: 'auto' }}
                onClick={() => setShowAddressed(v => !v)}
              >
                {showAddressed ? 'Only what is waiting' : 'Include what you have handled'}
              </button>
            </div>

            {thoughts.length === 0 ? (
              <div className="mind-empty">
                <Brain size={32} opacity={0.3} />
                <p>Nothing here. Hit &ldquo;Reflect now&rdquo; to have her process recent events.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {thoughts.map(item => (
                  <ThoughtCard
                    key={item.id} item={item}
                    onAddress={address} onUnaddress={unaddress}
                  />
                ))}
              </AnimatePresence>
            )}
          </>
        )}
      </div>
    </div>
  );
}
