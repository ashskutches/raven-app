'use client';

/**
 * Console — a REPL into Raven.
 *
 * ── Why a terminal and not another chat box ─────────────────────────────────
 *
 * Ash demos Raven often, and the thing being demoed is an agent that acts: it
 * calls tools, spends money behind a Gate, runs work to completion. Chat hides
 * exactly that. A chat bubble shows the sentence at the end and a spinner in the
 * middle, so the most interesting part of the system — twelve tool calls, each
 * with a name and a duration — is the part the audience never sees.
 *
 * A console inverts it. The tool calls ARE the output, printed as they happen with
 * their timings, and her prose arrives in the same stream. That is both the more
 * impressive object and the more honest one: it shows the work rather than
 * asserting it.
 *
 * It reuses `/api/proxy/chat` unchanged — same SSE contract as `ChatScreen`, same
 * events, same conversation header. This is a second view onto the same pipe, not
 * a second pipe.
 *
 * ── Talking to a local API ──────────────────────────────────────────────────
 *
 * Nothing here is bound to production. The proxy resolves its upstream from
 * `RAVEN_API_URL` at request time, so `RAVEN_API_URL=http://localhost:3001 npm run
 * dev` points the whole app — this screen included — at a local raven-api. `/api`
 * prints which one is actually answering, because the failure this prevents is
 * demoing against prod while believing you are on local, or the reverse.
 *
 * ── The conversation is fresh every mount ───────────────────────────────────
 *
 * `ChatScreen` persists its conversation id to localStorage, deliberately: a chat
 * that forgot last week would be a worse assistant. A console should not do that.
 * A demo has to be repeatable, and "why is she talking about the invoice from
 * Tuesday" is a bad opening. `/new` starts another one mid-session.
 *
 * This drops the THREAD, not her memory, and the distinction is worth stating
 * because the obvious reading is wrong: her recall lives in her own memory layer
 * and survives every thread. A fresh console still gets an assistant who knows
 * you, which is the version worth demoing anyway.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

// ── Lines ────────────────────────────────────────────────────────────────────

type LineKind = 'in' | 'out' | 'sys' | 'dim' | 'ok' | 'warn' | 'err' | 'tool';

interface Line {
  id: number;
  kind: LineKind;
  text: string;
}

/**
 * Colour carries meaning, so it is defined once rather than at each call site.
 * Everything resolves to a token from globals.css — a console that invented its
 * own greens would be the one screen that stops matching when the theme moves.
 */
const LINE_COLOR: Record<LineKind, string> = {
  in:   'var(--color-text)',
  out:  'var(--color-text)',
  sys:  'var(--color-lavender)',
  dim:  'var(--color-text-subtle)',
  ok:   'var(--color-emerald)',
  warn: 'var(--color-gold)',
  err:  'var(--color-rose)',
  tool: 'var(--color-indigo-bright)',
};

let lineSeq = 0;
const mkLine = (kind: LineKind, text: string): Line => ({ id: ++lineSeq, kind, text });

// ── Commands ─────────────────────────────────────────────────────────────────

/**
 * Kept as data so `/help` renders itself.
 *
 * A help text maintained separately from the dispatch is a help text that goes
 * out of date the first time somebody adds a command in a hurry — and on this
 * screen that error is visible to an audience.
 */
interface Command {
  name: string;
  args?: string;
  blurb: string;
}

const COMMANDS: Command[] = [
  { name: 'help',      blurb: 'this list' },
  { name: 'whoami',    blurb: 'model, register, autonomy, pending approvals — one read' },
  { name: 'register',  args: '[clipped|measured|present|vivid]', blurb: 'how much of herself shows; no argument reads it' },
  { name: 'voiceprint', blurb: 'is she still sounding like herself — drift, breaches, what moved' },
  { name: 'work',      blurb: 'the live queue by state' },
  { name: 'approvals', blurb: 'what is waiting on a decision, and for how long' },
  { name: 'model',     blurb: 'what she is running on, and what it has cost' },
  { name: 'api',       blurb: 'which raven-api is actually answering' },
  { name: 'new',       blurb: 'start a new thread (she keeps her memory — see /help)' },
  { name: 'clear',     blurb: 'clear the screen (the conversation survives)' },
];

// ── Small helpers ────────────────────────────────────────────────────────────

const ms = (n: number) => (n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`);

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

/** A signed percentage, because "hedging up 40%" and "down 40%" are different news. */
const signed = (n: number | null) =>
  n === null ? '—' : `${n > 0 ? '+' : ''}${n}%`;

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ConsoleScreen() {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const historyRef = useRef<string[]>([]);
  const histPos    = useRef<number>(-1);
  const booted     = useRef(false);

  const emit = useCallback((kind: LineKind, text: string) => {
    setLines(prev => [...prev, mkLine(kind, text)]);
  }, []);

  const emitMany = useCallback((entries: Array<[LineKind, string]>) => {
    setLines(prev => [...prev, ...entries.map(([k, t]) => mkLine(k, t))]);
  }, []);

  // Pinned to the bottom, the way a terminal is.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // ── Boot ──────────────────────────────────────────────────────────────────

  /**
   * The boot sequence is three real reads, not a cosmetic animation.
   *
   * Every line either states a fact about the running system or says it could not
   * be read. A fake boot that always prints green would be worse than no boot at
   * all: it is a status display that cannot report a failure, which is the exact
   * class of lie `voiceprint.ts` refuses to tell with its `note` field.
   */
  const boot = useCallback(async () => {
    emitMany([
      ['sys', 'raven console'],
      ['dim', 'A REPL into her. Type to talk; /help for commands.'],
      ['dim', ''],
    ]);

    const t0 = performance.now();

    const read = async (label: string, path: string): Promise<unknown | null> => {
      const started = performance.now();
      try {
        const r = await apiFetch(path);
        if (!r.ok) {
          emit('err', `✗ ${pad(label, 22)} HTTP ${r.status}`);
          return null;
        }
        const body = await r.json();
        emit('ok', `✓ ${pad(label, 22)} ${ms(performance.now() - started)}`);
        return body;
      } catch (err) {
        emit('err', `✗ ${pad(label, 22)} ${(err as Error).message}`);
        return null;
      }
    };

    const [settings, voice, approvals] = await Promise.all([
      read('settings', '/settings'),
      read('voice register', '/settings/voice'),
      read('approval queue', '/approvals'),
    ]);

    emit('dim', '');

    const s = settings as { llm?: { current_model?: string }; autonomy?: { paused?: boolean } } | null;
    const v = voice as { register?: string } | null;
    const pending = Array.isArray(approvals) ? approvals.length : null;

    const facts: Array<[LineKind, string]> = [];
    facts.push(['dim', `${pad('model', 14)}${s?.llm?.current_model ?? 'unreadable'}`]);
    facts.push(['dim', `${pad('register', 14)}${v?.register ?? 'unreadable'}`]);

    // Autonomy paused is the single most demo-relevant piece of state on the box:
    // she will answer chat perfectly while doing nothing on her own, and that
    // looks identical to working. It gets a colour rather than a grey line.
    if (s?.autonomy?.paused === true) {
      facts.push(['warn', `${pad('autonomy', 14)}PAUSED — her scheduled work is not running`]);
    } else if (s?.autonomy?.paused === false) {
      facts.push(['dim', `${pad('autonomy', 14)}running`]);
    }

    if (pending === null) {
      facts.push(['dim', `${pad('approvals', 14)}unreadable`]);
    } else if (pending > 0) {
      facts.push(['warn', `${pad('approvals', 14)}${pending} waiting on a decision`]);
    } else {
      facts.push(['dim', `${pad('approvals', 14)}clear`]);
    }

    facts.push(['dim', '']);
    facts.push(['dim', `ready in ${ms(performance.now() - t0)}`]);
    facts.push(['dim', '']);
    emitMany(facts);
  }, [emit, emitMany]);

  useEffect(() => {
    // React 18+ StrictMode double-invokes effects in dev; a boot sequence printed
    // twice reads as a bug to anyone watching.
    if (booted.current) return;
    booted.current = true;
    void boot();
    inputRef.current?.focus();
  }, [boot]);

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * `signal` is not decoration: every read here is a call to a raven-api that can
   * stop answering, and the console disables its input for the whole command. It
   * is threaded through each fetch so Escape cancels the request itself rather
   * than only unsticking the UI on top of it.
   */
  const runCommand = useCallback(async (raw: string, signal: AbortSignal): Promise<void> => {
    const [name, ...rest] = raw.slice(1).trim().split(/\s+/);
    const arg = rest.join(' ');

    switch (name) {
      case 'help': {
        emit('sys', 'commands');
        for (const c of COMMANDS) {
          emit('dim', `  /${pad(c.name + (c.args ? ' ' + c.args : ''), 44)}${c.blurb}`);
        }
        emit('dim', '');
        emit('dim', '  Anything not starting with / goes to her as a message.');
        emit('dim', '  Esc aborts a running turn. ↑/↓ walk the history.');
        emit('dim', '  The console opens a new thread each time; her memory persists regardless.');
        return;
      }

      case 'clear': {
        setLines([]);
        return;
      }

      case 'new': {
        setConversationId(null);
        emit('ok', 'New thread.');
        // Worth being exact about, because the obvious reading is wrong: this drops
        // the conversation id, not her memory. Raven's recall lives in her own
        // memory layer (episodes, library, preferences) and survives every thread,
        // so she will still know what you told her five minutes ago. Verified by
        // accident on 2026-09-16 — a reload answered a follow-up with "already
        // pulled this a moment ago", which is the correct behaviour and the exact
        // opposite of what this line originally claimed.
        emit('dim', 'Her memory is not a thread — she still knows what you told her.');
        return;
      }

      case 'api': {
        try {
          const r = await fetch('/api/target', { signal });
          const t = await r.json() as { upstream?: string; authenticated?: boolean; local?: boolean };
          emit('sys', `upstream  ${t.upstream ?? 'unknown'}`);
          emit(t.local ? 'warn' : 'dim', t.local ? 'This is a LOCAL raven-api.' : 'This is the deployed raven-api.');
          emit(t.authenticated ? 'dim' : 'warn',
            t.authenticated ? 'Bearer token configured.' : 'No RAVEN_API_SECRET set — every call will 401.');
        } catch (err) {
          // An abort is not a failure to read the target; it is Ash saying stop.
          // Let submit() report it as one.
          if ((err as Error).name === 'AbortError') throw err;
          emit('err', `Could not read the proxy target: ${(err as Error).message}`);
        }
        return;
      }

      case 'whoami': {
        const [sr, vr, ar] = await Promise.all([
          apiFetch('/settings', { signal }).then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/settings/voice', { signal }).then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/approvals', { signal }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        // These three swallow their own errors, so an abort would otherwise be
        // reported as four `unreadable` rows — a claim about her, when in fact
        // the read was cancelled.
        if (signal.aborted) { emit('dim', '^C  aborted'); return; }
        const s = sr as { llm?: { current_model?: string }; autonomy?: { paused?: boolean } } | null;
        const v = vr as { register?: string; voiceprint?: { drift?: number; breaches?: string[] } } | null;
        emit('sys', 'Raven');
        emit('dim', `  ${pad('model', 14)}${s?.llm?.current_model ?? 'unreadable'}`);
        emit('dim', `  ${pad('register', 14)}${v?.register ?? 'unreadable'}`);
        emit('dim', `  ${pad('autonomy', 14)}${s?.autonomy?.paused === true ? 'paused' : s?.autonomy?.paused === false ? 'running' : 'unreadable'}`);
        emit('dim', `  ${pad('approvals', 14)}${Array.isArray(ar) ? `${ar.length} pending` : 'unreadable'}`);
        emit('dim', `  ${pad('drift', 14)}${typeof v?.voiceprint?.drift === 'number' ? v.voiceprint.drift : '—'}`);
        for (const b of v?.voiceprint?.breaches ?? []) emit('err', `  ! ${b}`);
        return;
      }

      case 'register': {
        if (!arg) {
          const r = await apiFetch('/settings/voice', { signal });
          if (!r.ok) { emit('err', `Could not read the register (HTTP ${r.status})`); return; }
          const v = await r.json() as { register: string; options: Array<{ id: string; note: string }> };
          emit('sys', `register  ${v.register}`);
          for (const o of v.options) {
            emit(o.id === v.register ? 'ok' : 'dim', `  ${o.id === v.register ? '›' : ' '} ${pad(o.id, 10)}${o.note}`);
          }
          return;
        }
        const r = await apiFetch('/settings/voice', {
          method: 'PATCH',
          body: JSON.stringify({ register: arg }),
          signal,
        });
        const body = await r.json() as {
          register?: string; previous?: string; error?: string;
          baseline?: { drift?: number; note?: string | null };
        };
        if (!r.ok) { emit('err', body.error ?? `HTTP ${r.status}`); return; }
        emit('ok', `register  ${body.previous} → ${body.register}`);
        // The topbar carries the register and does not poll for it — see the
        // comment on loadIdentity in app/[screen]/page.tsx.
        window.dispatchEvent(new Event('raven:identity-changed'));
        // The reading from before the change is the only baseline this switch will
        // ever have — it stops existing the moment she talks in the new register.
        if (typeof body.baseline?.drift === 'number') {
          emit('dim', `  baseline drift before the change: ${body.baseline.drift}`);
        }
        if (body.baseline?.note) emit('dim', `  ${body.baseline.note}`);
        return;
      }

      case 'voiceprint': {
        const r = await apiFetch('/settings/voice', { signal });
        if (!r.ok) { emit('err', `Could not read the voiceprint (HTTP ${r.status})`); return; }
        const v = await r.json() as {
          register: string;
          voiceprint: {
            drift: number; note: string | null; breaches: string[];
            recent: { messages: number };
            moved: Array<{ label: string; recent: number; previous: number; changePct: number | null }>;
          };
        };
        const p = v.voiceprint;
        emit('sys', `voiceprint  drift ${p.drift}  ·  register ${v.register}  ·  ${p.recent.messages} messages read`);
        // The note is the honest answer when there is not enough data. Printing a
        // drift of 0 without it would read as "perfectly consistent".
        if (p.note) emit('warn', `  ${p.note}`);
        if (!p.moved.length && !p.note) emit('dim', '  Nothing moved more than the noise floor.');
        for (const m of p.moved) {
          emit('dim', `  ${pad(m.label, 26)}${pad(String(m.previous), 10)}→ ${pad(String(m.recent), 10)}${signed(m.changePct)}`);
        }
        for (const b of p.breaches) emit('err', `  ! ${b}`);
        if (!p.breaches.length) emit('ok', '  No breaches.');
        return;
      }

      case 'work': {
        const r = await apiFetch('/tasks?state=inbox,next,doing,waiting,blocked', { signal });
        if (!r.ok) { emit('err', `Could not read the queue (HTTP ${r.status})`); return; }
        const body = await r.json() as unknown;
        const tasks = (Array.isArray(body) ? body : (body as { items?: unknown[] }).items ?? []) as
          Array<{ title: string; state: string; owner: string; blocked_on: string | null }>;
        if (!tasks.length) { emit('dim', 'Queue is empty.'); return; }
        emit('sys', `work  ${tasks.length} open`);
        for (const t of tasks) {
          const kind: LineKind = t.state === 'blocked' ? 'err' : t.state === 'doing' ? 'ok' : 'dim';
          emit(kind, `  ${pad(t.state, 9)}${pad(t.owner, 8)}${t.title}${t.blocked_on ? `  — blocked on ${t.blocked_on}` : ''}`);
        }
        return;
      }

      case 'approvals': {
        const r = await apiFetch('/approvals', { signal });
        if (!r.ok) { emit('err', `Could not read the queue (HTTP ${r.status})`); return; }
        const items = await r.json() as Array<{
          action_type: string; summary: string | null; amount_usd: number | null; expires_at: string;
        }>;
        if (!items.length) { emit('ok', 'Nothing waiting on you.'); return; }
        emit('sys', `approvals  ${items.length} waiting`);
        for (const it of items) {
          const hours = Math.floor((Date.parse(it.expires_at) - Date.now()) / 3_600_000);
          const left = hours <= 0 ? 'EXPIRED' : `${hours}h left`;
          const amount = typeof it.amount_usd === 'number' ? `$${it.amount_usd.toFixed(2)}  ` : '';
          emit(hours <= 4 ? 'warn' : 'dim', `  ${pad(it.action_type, 20)}${amount}${it.summary ?? ''}  (${left})`);
        }
        emit('dim', '  Decide them on the Approvals screen.');
        return;
      }

      case 'model': {
        const r = await apiFetch('/settings', { signal });
        if (!r.ok) { emit('err', `Could not read settings (HTTP ${r.status})`); return; }
        const s = await r.json() as {
          llm: { current_model: string; options: Array<{ id: string; label?: string }>; usage?: Record<string, unknown> };
        };
        emit('sys', `model  ${s.llm.current_model}`);
        for (const o of s.llm.options ?? []) {
          emit(o.id === s.llm.current_model ? 'ok' : 'dim', `  ${o.id === s.llm.current_model ? '›' : ' '} ${o.id}`);
        }
        emit('dim', '  Change it in Settings — it is not a console command on purpose.');
        return;
      }

      default:
        emit('err', `Unknown command: /${name}`);
        emit('dim', 'Try /help.');
    }
  }, [emit]);

  // ── Talking to her ────────────────────────────────────────────────────────

  /**
   * The same SSE contract `ChatScreen` uses, rendered as a log instead of a bubble.
   *
   * The one substantive difference: a tool call opens a timer and its result closes
   * it and prints the duration.
   *
   * ── Two `tool_call` events per call, on purpose ──────────────────────────
   *
   * `routes/chat.ts` sends one at `content_block_start` with `args: {}` — she has
   * committed to the tool but the arguments are still streaming — and a second with
   * the arguments filled in, immediately before it executes. `ChatScreen` treats
   * both as new entries; it gets away with it because it only ever renders one
   * spinner. A log cannot get away with it: the first pass of this printed
   * `→ calendar` twice and then reported `calendar never returned`, because two
   * opens were closed by one result.
   *
   * So the entry is opened on the first event and *printed* on the second, when
   * there is something to print. The timer starts at the first, which makes the
   * duration "from the moment she reached for it" rather than "from the moment the
   * arguments finished" — the longer and more honest of the two.
   *
   * Pairing is by tool name (`tool_result` carries `tool`), falling back to the
   * oldest open call. Two different tools in flight at once therefore pair
   * correctly; two calls to the SAME tool in flight would pair oldest-first, which
   * is right for their durations as a set and can transpose their results.
   */
  const send = useCallback(async (text: string): Promise<void> => {
    setBusy(true);
    abortRef.current = new AbortController();

    const openTools: Array<{ tool: string; at: number; printed: boolean }> = [];
    let accumulated = '';
    let printedUpTo = 0;

    // Her prose is flushed line by line rather than character by character: a
    // terminal that reflows its last line on every token looks like a rendering
    // bug, not a stream.
    const flush = (final = false) => {
      const upTo = final ? accumulated.length : accumulated.lastIndexOf('\n') + 1;
      if (upTo <= printedUpTo) return;
      const chunk = accumulated.slice(printedUpTo, upTo);
      printedUpTo = upTo;
      for (const l of chunk.split('\n')) {
        if (l.trim() || final) emit('out', l);
      }
    };

    try {
      const response = await fetch('/api/proxy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], conversationId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const convId = response.headers.get('X-Conversation-Id');
      if (convId) setConversationId(convId);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffered = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // An SSE frame can split across reads. ChatScreen decodes each chunk on its
        // own and drops the remainder; over a slow connection that silently loses
        // tokens, so this keeps the tail until a newline completes it.
        buffered += decoder.decode(value, { stream: true });
        const parts = buffered.split('\n');
        buffered = parts.pop() ?? '';

        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          let data: Record<string, unknown>;
          try { data = JSON.parse(line.slice(6)) as Record<string, unknown>; } catch { continue; }

          if (data.text) { accumulated += data.text as string; flush(); }

          if (data.tool_call) {
            const tool = String(data.tool_call);
            const args = (data.args ?? {}) as Record<string, unknown>;
            const hint = Object.entries(args)
              .map(([k, v]) => `${k}=${String(v).slice(0, 48)}`)
              .join(' ')
              .slice(0, 96);

            // Whatever she said before reaching for the tool goes out FIRST.
            // `prompt.ts` has her write a standalone line before a lookup ("speak
            // before you disappear"), and it arrives with no trailing newline, so
            // line-buffering held it back until the answer landed and then printed
            // the two run together — below the tool call that came between them.
            if (hint) flush(true);

            const pending = openTools.find(t => t.tool === tool && !t.printed);
            if (!pending) {
              openTools.push({ tool, at: performance.now(), printed: Boolean(hint) });
              if (hint) emit('tool', `→ ${tool}  ${hint}`);
            } else if (hint) {
              pending.printed = true;
              emit('tool', `→ ${tool}  ${hint}`);
            }
          }

          if (data.tool_result !== undefined) {
            const named = typeof data.tool === 'string' ? String(data.tool) : null;
            const idx = named ? openTools.findIndex(t => t.tool === named) : 0;
            const opened = openTools.splice(idx >= 0 ? idx : 0, 1)[0];
            // A tool that streamed no arguments has nothing to print but still
            // happened; it gets its arrow here rather than vanishing.
            if (opened && !opened.printed) emit('tool', `→ ${opened.tool}`);
            const took = opened ? `  ${ms(performance.now() - opened.at)}` : '';
            const result = typeof data.tool_result === 'string'
              ? data.tool_result.replace(/\s+/g, ' ').slice(0, 96)
              : '';
            emit('tool', `← ${opened?.tool ?? named ?? 'tool'}${took}${result ? `  ${result}` : ''}`);
          }

          if (data.correctedText) {
            // The correction strips a trailing CAPABILITY_REQUEST block, so the
            // corrected text is a PREFIX of what already streamed. Reprinting from
            // zero would duplicate every line already on screen — a bubble can be
            // replaced, a log cannot. Clamp and print only anything genuinely new.
            accumulated = data.correctedText as string;
            printedUpTo = Math.min(printedUpTo, accumulated.length);
            flush();
          }

          if (data.error) {
            flush(true);
            // Same invariant ChatScreen now holds: what broke, and what next. No
            // apology, no passive voice, and the cause shown rather than eaten.
            emit('err', `stream failed — ${String(data.error).slice(0, 160)}`);
            emit('dim', 'Nothing after that point was saved. Send it again.');
            return;
          }

          if (data.done) break;
        }
      }
      flush(true);
    } catch (err) {
      if ((err as Error).name === 'AbortError') { emit('dim', '^C  aborted'); return; }
      flush(true);
      emit('err', `stream failed — ${(err as Error).message}`);
      emit('dim', 'Nothing after that point was saved. Send it again.');
    } finally {
      for (const t of openTools) emit('dim', `  ${t.tool} never returned`);
      setBusy(false);
      abortRef.current = null;
      emit('dim', '');
    }
  }, [conversationId, emit]);

  // ── Input ─────────────────────────────────────────────────────────────────

  const submit = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    historyRef.current = [text, ...historyRef.current.filter(h => h !== text)].slice(0, 100);
    histPos.current = -1;
    setInput('');
    emit('in', `❯ ${text}`);

    if (text.startsWith('/')) {
      setBusy(true);
      // The controller belongs here and not only in send(): a command disables the
      // input and advertises "Esc to abort" exactly like a chat turn does, and
      // commands are the likelier of the two to hang, being plain reads of a
      // raven-api that may have gone quiet. Built only in send(), abortRef.current
      // was null for every command, so the Escape listener fired, swallowed the
      // keystroke, and aborted nothing.
      abortRef.current = new AbortController();
      try { await runCommand(text, abortRef.current.signal); }
      catch (err) {
        if ((err as Error).name === 'AbortError') emit('dim', '^C  aborted');
        else emit('err', (err as Error).message);
      }
      finally { setBusy(false); abortRef.current = null; emit('dim', ''); }
      return;
    }
    await send(text);
  }, [input, busy, emit, runCommand, send]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); return; }

    // Escape is not handled here — see the document listener below for why it
    // cannot be.

    // Shell history. Only reaches for it when there is one, so an empty console
    // does not swallow the arrow keys.
    if (e.key === 'ArrowUp' && historyRef.current.length) {
      e.preventDefault();
      histPos.current = Math.min(histPos.current + 1, historyRef.current.length - 1);
      setInput(historyRef.current[histPos.current] ?? '');
      return;
    }
    if (e.key === 'ArrowDown' && histPos.current >= 0) {
      e.preventDefault();
      histPos.current -= 1;
      setInput(histPos.current < 0 ? '' : historyRef.current[histPos.current] ?? '');
    }
  }, [submit]);

  /**
   * Escape has to be heard at the document, not at the input.
   *
   * The only window in which an abort means anything is while a turn is
   * streaming — and that is exactly the window in which the input carries
   * `disabled`. The browser blurs a disabled control and routes the keystroke to
   * `document.body`, which is an ancestor of this screen rather than a
   * descendant, so neither `onKeyDown` on the input nor a handler on any wrapper
   * inside `.console` ever sees it. Bound there, the branch was unreachable for
   * the entire time the affordance was being advertised: the placeholder reads
   * "working — Esc to abort" and `/help` says "Esc aborts a running turn", and
   * both were false.
   *
   * Only while busy, so an idle console still leaves Escape to the browser.
   */
  useEffect(() => {
    if (!busy) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      abortRef.current?.abort();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [busy]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="console" onClick={() => inputRef.current?.focus()}>
      <div className="console-scroll" ref={scrollRef}>
        {lines.map(l => (
          <div key={l.id} className="console-line" style={{ color: LINE_COLOR[l.kind] }}>
            {l.text || ' '}
          </div>
        ))}

        <div className="console-prompt">
          <span className="console-caret" aria-hidden>❯</span>
          <input
            ref={inputRef}
            className="console-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            placeholder={busy ? 'working — Esc to abort' : 'message, or /help'}
            spellCheck={false}
            autoComplete="off"
            aria-label="Console input"
          />
          {busy && <span className="console-working" aria-hidden />}
        </div>
      </div>
    </div>
  );
}
