'use client';

/**
 * Work — the page.
 *
 * A box to give Raven a task, and a list showing where every task actually
 * stands: which run it is on, what it is waiting on, what it queued for
 * approval, and the report when it finishes.
 *
 * The design rule: a task should never look like nothing is happening. Every
 * row says either what she is doing or what is blocking her, because "in
 * progress" with no explanation is indistinguishable from stuck.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Loader, CheckCircle2, AlertOctagon, PauseCircle,
  HelpCircle, ShieldQuestion, ChevronDown, ChevronRight, Play, MessageSquarePlus,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface Task {
  id: string;
  title: string;
  outcome: string | null;
  notes: string | null;
  next_action: string | null;
  owner: 'ash' | 'raven' | 'person';
  state: 'inbox' | 'next' | 'doing' | 'waiting' | 'blocked' | 'done' | 'dropped';
  arena_id: string | null;
  blocked_on: string | null;
  run_count: number;
  max_runs: number;
  last_progress: string | null;
  priority: number;
  created_at: string;
}

interface Question {
  id: string;
  question: string;
  context: string | null;
  why_not_researched: string | null;
  status: string;
  answer: string | null;
  asked_of: string;
  asked_at: string;
}

interface Approval {
  id: string;
  action_type: string;
  summary: string | null;
  amount_usd: number | null;
  state: string;
}

interface Report {
  id: string;
  headline: string;
  what_was_done: string;
  why: string | null;
  tools_used: string[];
  outcome: string;
}

interface ToolCall {
  name: string;
  input: string;
  ok: boolean;
  result: string;
}

interface WorkRun {
  id: string;
  run_number: number;
  started_at: string;
  ended_at: string | null;
  steps: number;
  tool_calls: ToolCall[];
  progress: string | null;
  outcome: 'running' | 'continued' | 'done' | 'dropped' | 'waiting' | 'blocked' | 'exhausted' | 'error';
  error: string | null;
}

/**
 * Something Ash said about this task, and what she did about it.
 *
 * `action` is filled in by her twice-daily reflection, not on submit — so a
 * fresh note reads "not looked at yet", which is honest rather than a spinner
 * pretending something is happening.
 */
interface FeedbackItem {
  id: string;
  at: string;
  text: string;
  processed: boolean;
  action?: 'guide_note' | 'request_filed' | 'retracted' | 'acknowledged' | 'none';
  response?: string;
}

interface TaskDetail extends Task {
  questions: Question[];
  approvals: Approval[];
  report: Report | null;
  runs: WorkRun[];
  feedback: FeedbackItem[];
}

interface Arena { id: string; slug: string; name: string }

const STATE_META: Record<Task['state'], { label: string; icon: React.ReactNode; color: string }> = {
  inbox:   { label: 'Inbox',    icon: <PauseCircle size={13} />,  color: 'var(--color-text-subtle)' },
  next:    { label: 'Queued',   icon: <Play size={13} />,         color: 'var(--color-lavender)' },
  doing:   { label: 'Running',  icon: <Loader size={13} />,       color: 'var(--color-lavender)' },
  waiting: { label: 'Waiting',  icon: <HelpCircle size={13} />,   color: 'var(--color-gold)' },
  blocked: { label: 'Blocked',  icon: <AlertOctagon size={13} />, color: 'var(--color-rose)' },
  done:    { label: 'Done',     icon: <CheckCircle2 size={13} />, color: 'var(--color-emerald)' },
  dropped: { label: 'Dropped',  icon: <PauseCircle size={13} />,  color: 'var(--color-text-subtle)' },
};

/**
 * A run in flight and a run that died look identical in the database: both are
 * `outcome='running'` with no `ended_at`, because the row is opened at claim
 * time precisely so a process killed mid-run leaves a trace. Only elapsed time
 * separates them.
 *
 * `MAX_STEPS` is 14 and a step can be a slow search, so a live run is minutes,
 * not seconds. Twenty is comfortably past the longest real run and comfortably
 * short of leaving a dead run looking busy all afternoon.
 */
const RUN_STALE_MINUTES = 20;

function isLive(run: WorkRun): boolean {
  if (run.ended_at) return false;
  return Date.now() - new Date(run.started_at).getTime() < RUN_STALE_MINUTES * 60_000;
}

/**
 * How a run ended, in a word and a colour.
 *
 * `running` is not a fourth kind of success — it is a run that was claimed and
 * never reported back. Past `RUN_STALE_MINUTES` that means the process died
 * mid-flight, and it reads "no reply" rather than "in progress" so it cannot be
 * mistaken for work still happening. Inside that window it is genuinely working,
 * and `isLive` overrides this label.
 */
const RUN_OUTCOME: Record<WorkRun['outcome'], { label: string; color: string }> = {
  running:   { label: 'no reply',  color: 'var(--color-rose)' },
  continued: { label: 'continued', color: 'var(--color-text-subtle)' },
  done:      { label: 'finished',  color: 'var(--color-emerald)' },
  dropped:   { label: 'dropped',   color: 'var(--color-text-subtle)' },
  waiting:   { label: 'asked',     color: 'var(--color-gold)' },
  blocked:   { label: 'blocked',   color: 'var(--color-rose)' },
  exhausted: { label: 'out of runs', color: 'var(--color-rose)' },
  error:     { label: 'errored',   color: 'var(--color-rose)' },
};

function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
}

/**
 * The trail — every run of one task, oldest first.
 *
 * This is the answer to "what has she actually been doing". Before it existed
 * the page could show `run 7/12` and the seventh progress note, and nothing of
 * the six runs that got her there. The tool calls are collapsed by default
 * because a fourteen-step run is a wall; the progress note is the story and the
 * calls are the evidence for it.
 */
function RunTrail({ runs }: { runs: WorkRun[] }) {
  const [openRun, setOpenRun] = useState<string | null>(null);
  if (!runs?.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em',
        color: 'var(--color-text-subtle)', marginBottom: 8,
      }}>
        Runs ({runs.length})
      </div>

      {runs.map(run => {
        const live = isLive(run);
        const meta = live
          ? { label: 'working…', color: 'var(--color-lavender)' }
          : (RUN_OUTCOME[run.outcome] ?? RUN_OUTCOME.continued);
        const calls = run.tool_calls ?? [];
        // A live run's calls are the only thing on it — the progress note is
        // written when it settles — so open it rather than making him click
        // into the one run that is actually happening.
        const isOpen = openRun === run.id || (live && openRun === null);

        return (
          <div key={run.id} style={{
            borderLeft: `2px solid ${meta.color}`,
            paddingLeft: 10, marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11 }}>
              <strong style={{ color: 'var(--color-text)' }}>Run {run.run_number}</strong>
              <span style={{ color: 'var(--color-text-subtle)' }}>{clockOf(run.started_at)}</span>
              <span style={{ color: meta.color, ...(live ? { animation: 'breathe 1.6s ease-in-out infinite' } : {}) }}>
                {meta.label}
              </span>
              {calls.length > 0 && (
                <button
                  onClick={() => setOpenRun(isOpen ? null : run.id)}
                  style={{
                    marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-subtle)', fontSize: 11, padding: 0,
                  }}
                >
                  {calls.length} tool call{calls.length === 1 ? '' : 's'} {isOpen ? '▾' : '▸'}
                </button>
              )}
            </div>

            {run.progress ? (
              <div style={{
                fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4,
                whiteSpace: 'pre-wrap',
              }}>
                {run.progress}
              </div>
            ) : live ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 4 }}>
                {calls.length
                  ? `${calls.length} step${calls.length === 1 ? '' : 's'} in — ${calls[calls.length - 1].name}`
                  : 'starting…'}
              </div>
            ) : null}

            {run.error && (
              <div style={{ fontSize: 12, color: 'var(--color-rose)', marginTop: 4 }}>
                {run.error}
              </div>
            )}

            {isOpen && (
              <div style={{ marginTop: 8 }}>
                {calls.map((c, i) => (
                  <div key={i} style={{
                    fontSize: 11, marginBottom: 6, padding: '6px 8px', borderRadius: 6,
                    background: 'rgba(0,0,0,0.25)',
                    borderLeft: `2px solid ${c.ok ? 'var(--color-border-strong)' : 'var(--color-rose)'}`,
                  }}>
                    <div style={{ color: 'var(--color-lavender)', fontFamily: 'ui-monospace, monospace' }}>
                      {c.name}
                    </div>
                    <div style={{
                      color: 'var(--color-text-subtle)', wordBreak: 'break-word',
                      fontFamily: 'ui-monospace, monospace',
                    }}>
                      {c.input}
                    </div>
                    {c.result && (
                      <div style={{
                        color: c.ok ? 'var(--color-text-muted)' : 'var(--color-rose)',
                        marginTop: 3, whiteSpace: 'pre-wrap',
                      }}>
                        → {c.result}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const FEEDBACK_VERDICT: Record<string, string> = {
  guide_note:   'added it to how she works',
  request_filed: 'filed a request for it',
  retracted:    'dropped what she believed',
  acknowledged: 'noted it',
  none:         'decided nothing needed changing',
};

/**
 * Notes Ash has left on a finished task, and the box for leaving another.
 *
 * Deliberately last and deliberately quiet. Saying nothing is the normal case:
 * a prompt that reads as an obligation turns every finished task into homework,
 * and feedback given under duress is worth less than the silence it replaced.
 *
 * What she DID with a note is rendered beside it, because a correction that
 * disappears is indistinguishable from one nobody read — and that is how a
 * person learns to stop bothering.
 */
function FeedbackBlock({
  items, value, busy, onChange, onSubmit,
}: {
  items: FeedbackItem[];
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
      {items.map(f => (
        <div key={f.id} style={{ fontSize: 12, marginBottom: 8 }}>
          <div style={{ color: 'var(--color-text-muted)' }}>&ldquo;{f.text}&rdquo;</div>
          <div style={{ color: f.processed ? 'var(--color-emerald)' : 'var(--color-text-subtle)', fontSize: 11, marginTop: 2 }}>
            {f.processed
              ? `She ${FEEDBACK_VERDICT[f.action ?? 'acknowledged'] ?? 'acted on it'}${f.response ? ` — ${f.response}` : ''}`
              : 'Not looked at yet — she reviews these at 6am and 6pm'}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <MessageSquarePlus size={13} style={{ color: 'var(--color-text-subtle)', flexShrink: 0 }} />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="Anything she should do differently? (optional)"
          style={{
            flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '6px 9px', outline: 'none',
            color: 'var(--color-text)', fontSize: 12,
          }}
        />
        {value.trim() && (
          <button className="btn btn-ghost" disabled={busy} onClick={onSubmit}>
            {busy ? 'Saving' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function WorkScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [detail, setDetail] = useState<Record<string, TaskDetail>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [arena, setArena] = useState('personal');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState<Record<string, string>>({});
  const [noting, setNoting] = useState<Record<string, string>>({});
  const [notingBusy, setNotingBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([
        apiFetch('/tasks?state=inbox,next,doing,waiting,blocked,done'),
        apiFetch('/tasks/arenas'),
      ]);
      if (t.ok) setTasks(await t.json() as Task[]);
      if (a.ok) setArenas(await a.json() as Arena[]);
    } catch {
      setError('Could not reach Raven.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const r = await apiFetch(`/tasks/${id}`);
      if (!r.ok) return;
      const body = await r.json() as TaskDetail;
      setDetail(d => ({ ...d, [id]: body }));
    } catch { /* the row still renders without detail */ }
  }, []);

  async function openDetail(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    await loadDetail(id);
  }

  /**
   * Keep the open task's detail fresh while it is open.
   *
   * The detail — which carries the run trail — used to be fetched once, on the
   * click that expanded the row. So the trail froze at the moment you opened
   * it: the 15s poll refreshed the list underneath while the thing you were
   * actually watching went stale, and a run finishing in front of you showed
   * nothing until you collapsed the row and expanded it again.
   *
   * Five seconds rather than the list's fifteen, because the runner publishes
   * after every tool call and this is the one thing on the page somebody is
   * deliberately watching.
   */
  useEffect(() => {
    if (!expanded) return;
    const t = setInterval(() => { loadDetail(expanded); }, 5_000);
    return () => clearInterval(t);
  }, [expanded, loadDetail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), outcome: outcome.trim() || null, arena }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({})) as { error?: string };
        setError(b.error ?? 'That did not go through.');
      } else {
        setTitle('');
        setOutcome('');
        await load();
      }
    } catch {
      setError('That did not go through.');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Leave a note on a finished task.
   *
   * Optional by design — most tasks get nothing, and that has to stay the
   * frictionless default. This is not an approval step and closing a task does
   * not wait on it.
   */
  async function leaveFeedback(taskId: string) {
    const text = noting[taskId]?.trim();
    if (!text || notingBusy) return;
    setNotingBusy(taskId);
    try {
      const r = await apiFetch(`/tasks/${taskId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback: text }),
      });
      if (r.ok) {
        setNoting(n => ({ ...n, [taskId]: '' }));
        await loadDetail(taskId);
      }
    } catch { /* the box keeps what he typed */ } finally {
      setNotingBusy(null);
    }
  }

  async function answer(questionId: string, taskId: string) {
    const text = answering[questionId]?.trim();
    if (!text) return;
    try {
      await apiFetch(`/tasks/questions/${questionId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ answer: text }),
      });
      setAnswering(a => ({ ...a, [questionId]: '' }));
      // Await the body before storing it — setting the unresolved Promise here
      // renders an empty panel and looks like the answer was lost.
      const r = await apiFetch(`/tasks/${taskId}`);
      if (r.ok) {
        const body = await r.json() as TaskDetail;
        setDetail(d => ({ ...d, [taskId]: body }));
      }
      await load();
    } catch { /* silent — the poll will catch up */ }
  }

  async function runNow() {
    try { await apiFetch('/tasks/run', { method: 'POST' }); await load(); }
    catch { /* silent */ }
  }

  const arenaName = (id: string | null) => arenas.find(a => a.id === id)?.name ?? null;

  const active = tasks.filter(t => t.state !== 'done');
  const done   = tasks.filter(t => t.state === 'done');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 48 }}>

      {/* ── The box ─────────────────────────────────────────── */}
      <form onSubmit={submit} className="glass" style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Give Raven something to do…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--color-text)', fontSize: 15,
            }}
          />
          <select
            value={arena}
            onChange={e => setArena(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)', borderRadius: 8,
              padding: '6px 8px', fontSize: 12,
            }}
          >
            {arenas.map(a => <option key={a.id} value={a.slug}>{a.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!title.trim() || submitting}>
            <Send size={14} /> {submitting ? 'Sending' : 'Go'}
          </button>
        </div>

        {/* The acceptance criterion, and the most useful thing on this form.
            `raven_work.outcome` renders into the run prompt as "Done means: …",
            and it is what stops a task running its whole budget: without one,
            when to stop is hers to decide, and a model with runs left will
            always find more to do. Optional rather than required — a one-line
            errand does not need one — but prompted, because it is the field
            most worth filling and it was not on this form at all. */}
        {title.trim() && (
          <input
            value={outcome}
            onChange={e => setOutcome(e.target.value)}
            placeholder="Done means… (what she should have when she stops)"
            style={{
              width: '100%', marginTop: 10, background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--color-border)', borderRadius: 8,
              padding: '8px 10px', outline: 'none',
              color: 'var(--color-text)', fontSize: 13,
            }}
          />
        )}

        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 8 }}>
          She works it alone as far as she can, asks only if research genuinely can&apos;t settle it, and reports when it&apos;s done.
        </div>
      </form>

      {error && (
        <div className="glass" style={{ padding: 12, borderColor: 'rgba(244,63,94,0.4)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Active ──────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <h2 className="section-title" style={{ margin: 0 }}>In flight ({active.length})</h2>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={runNow} title="Run the next due task now">
            <Play size={13} /> Run now
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : active.length === 0 ? (
          <div className="empty-state" style={{ padding: 28 }}>
            Nothing running. Give her something above.
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {active.map(task => {
              const meta = STATE_META[task.state];
              const d = detail[task.id];
              const isOpen = expanded === task.id;
              const openQ = d?.questions?.filter(q => q.status === 'open') ?? [];

              return (
                <motion.div key={task.id} layout className="glass" style={{ padding: 16, marginBottom: 10 }}>
                  <div
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
                    onClick={() => openDetail(task.id)}
                  >
                    <span style={{ color: meta.color, display: 'flex', marginTop: 2 }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 11, color: 'var(--color-text-subtle)' }}>
                        <span style={{ color: meta.color }}>{meta.label}</span>
                        {task.owner === 'raven' && <span>🦅 hers</span>}
                        {task.owner === 'person' && <span>🤝 handed off</span>}
                        {arenaName(task.arena_id) && arenaName(task.arena_id) !== 'Personal' && (
                          <span>{arenaName(task.arena_id)}</span>
                        )}
                        {task.run_count > 0 && <span>run {task.run_count}/{task.max_runs}</span>}
                      </div>
                      {task.blocked_on && (
                        <div style={{ fontSize: 12, color: 'var(--color-rose)', marginTop: 5 }}>
                          {task.blocked_on}
                        </div>
                      )}
                      {!task.blocked_on && task.next_action && task.state !== 'waiting' && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 5 }}>
                          next: {task.next_action}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--color-text-subtle)', display: 'flex', marginTop: 2 }}>
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </span>
                  </div>

                  {isOpen && d && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}
                    >
                      {/* The trail supersedes the old single "Last run:" line —
                          it carries that note as its final entry plus every run
                          before it. Falling back to `last_progress` covers tasks
                          that ran before `raven_work_runs` existed. */}
                      {d.runs?.length ? <RunTrail runs={d.runs} /> : d.last_progress ? (
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                          <strong style={{ color: 'var(--color-text)' }}>Last run: </strong>{d.last_progress}
                        </div>
                      ) : null}

                      {/* Answer her here rather than on Discord */}
                      {openQ.map(q => (
                        <div key={q.id} style={{
                          padding: 12, marginBottom: 10, borderRadius: 8,
                          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)',
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                            <HelpCircle size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
                            {q.question}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginBottom: 8 }}>
                            asked {q.asked_of}
                            {q.why_not_researched && <> · couldn&apos;t research it: {q.why_not_researched}</>}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              value={answering[q.id] ?? ''}
                              onChange={e => setAnswering(a => ({ ...a, [q.id]: e.target.value }))}
                              placeholder="Answer…"
                              style={{
                                flex: 1, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--color-border)',
                                borderRadius: 6, padding: '6px 9px', color: 'var(--color-text)', fontSize: 13,
                              }}
                            />
                            <button className="btn btn-primary" onClick={() => answer(q.id, task.id)}>
                              Send
                            </button>
                          </div>
                        </div>
                      ))}

                      {d.questions?.filter(q => q.status === 'answered').map(q => (
                        <div key={q.id} style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                          <strong>{q.question}</strong> → {q.answer}
                        </div>
                      ))}

                      {d.approvals?.filter(a => a.state === 'proposed').map(a => (
                        <a key={a.id} href="/approvals" style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: 10, marginTop: 8,
                          borderRadius: 8, background: 'rgba(245,158,11,0.07)',
                          border: '1px solid rgba(245,158,11,0.3)', textDecoration: 'none', color: 'inherit',
                          fontSize: 13,
                        }}>
                          <ShieldQuestion size={14} color="var(--color-gold)" />
                          {a.summary ?? a.action_type}
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-subtle)' }}>
                            Approve →
                          </span>
                        </a>
                      ))}

                      {d.notes && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 10, whiteSpace: 'pre-wrap' }}>
                          {d.notes}
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </section>

      {/* ── Finished ────────────────────────────────────────── */}
      {done.length > 0 && (
        <section>
          <h2 className="section-title">Finished ({done.length})</h2>
          {done.slice(0, 15).map(task => {
            const d = detail[task.id];
            const isOpen = expanded === task.id;
            return (
              <div key={task.id} className="glass" style={{ padding: 14, marginBottom: 8 }}>
                <div
                  style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => openDetail(task.id)}
                >
                  <CheckCircle2 size={14} color="var(--color-emerald)" />
                  <span style={{ fontSize: 13, flex: 1 }}>{task.title}</span>
                  <span style={{ color: 'var(--color-text-subtle)', display: 'flex' }}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </div>

                {isOpen && d && !d.report && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                    <RunTrail runs={d.runs} />
                    <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>
                      Finished without writing a report.
                    </div>
                    <FeedbackBlock
                      items={d.feedback ?? []}
                      value={noting[task.id] ?? ''}
                      busy={notingBusy === task.id}
                      onChange={v => setNoting(n => ({ ...n, [task.id]: v }))}
                      onSubmit={() => leaveFeedback(task.id)}
                    />
                  </div>
                )}

                {isOpen && d?.report && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{d.report.headline}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>
                      {d.report.what_was_done}
                    </div>
                    {d.report.why && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-subtle)' }}>Why</div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{d.report.why}</div>
                      </div>
                    )}
                    {d.report.tools_used?.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 10 }}>
                        Used: {[...new Set(d.report.tools_used)].join(', ')}
                      </div>
                    )}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                      <RunTrail runs={d.runs} />
                    </div>
                    {/* Replaces "tell her on Discord if any of this was wrong" —
                        that line was the only feedback route and it pointed off
                        the page, at a regex-gated path that attached to whichever
                        report happened to be most recent rather than to this one. */}
                    <FeedbackBlock
                      items={d.feedback ?? []}
                      value={noting[task.id] ?? ''}
                      busy={notingBusy === task.id}
                      onChange={v => setNoting(n => ({ ...n, [task.id]: v }))}
                      onSubmit={() => leaveFeedback(task.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
