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
  HelpCircle, ShieldQuestion, ChevronDown, ChevronRight, Play,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export interface Task {
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

interface TaskDetail extends Task {
  questions: Question[];
  approvals: Approval[];
  report: Report | null;
}

interface Arena { id: string; slug: string; name: string }

/* `tint` is the pill fill and the card's left edge. Colour is the fastest thing
   on the page to read, so state gets to be a colour rather than a word set in
   the same 11px grey as everything beside it. */
const STATE_META: Record<Task['state'], { label: string; icon: React.ReactNode; color: string; tint: string }> = {
  inbox:   { label: 'Inbox',    icon: <PauseCircle size={12} />,  color: 'var(--color-text-muted)',  tint: 'rgba(255,255,255,0.06)' },
  next:    { label: 'Queued',   icon: <Play size={12} />,         color: 'var(--color-lavender)',    tint: 'rgba(167,139,250,0.13)' },
  doing:   { label: 'Running',  icon: <Loader size={12} className="spinning" />, color: 'var(--color-lavender)', tint: 'rgba(167,139,250,0.13)' },
  waiting: { label: 'Waiting',  icon: <HelpCircle size={12} />,   color: 'var(--color-gold)',        tint: 'rgba(251,191,36,0.13)' },
  blocked: { label: 'Blocked',  icon: <AlertOctagon size={12} />, color: 'var(--color-rose)',        tint: 'rgba(251,113,133,0.13)' },
  done:    { label: 'Done',     icon: <CheckCircle2 size={12} />, color: 'var(--color-emerald)',     tint: 'rgba(52,211,153,0.13)' },
  dropped: { label: 'Dropped',  icon: <PauseCircle size={12} />,  color: 'var(--color-text-subtle)', tint: 'rgba(255,255,255,0.06)' },
};

export interface Lane {
  id: string;
  label: string;
  hint: string;
  attention: boolean;
  tasks: Task[];
}

/**
 * The board as a pipeline rather than a list.
 *
 * Sorting by state alone would put "blocked" wherever the API happened to
 * return it — between two queued rows, below a finished one — so the single
 * lane that is a request to Ash rather than a status update was the hardest
 * thing on the page to find. Three lanes, in the order they need reading:
 * stopped, moving, waiting for a turn.
 *
 * Anything in a state the lanes do not name falls through into a last lane
 * rather than vanishing — a task disappearing from the board is a worse bug
 * than a task in an odd group.
 */
const LANE_SPEC: Array<{ id: string; label: string; hint: string; attention: boolean; states: Task['state'][] }> = [
  { id: 'needs-you', label: 'Needs you', hint: 'stopped until you answer', attention: true,  states: ['waiting', 'blocked'] },
  { id: 'running',   label: 'Running',   hint: 'she is on it now',         attention: false, states: ['doing'] },
  { id: 'queued',    label: 'Queued',    hint: 'waiting for a turn',       attention: false, states: ['next', 'inbox'] },
];

export function groupIntoLanes(tasks: Task[]): Lane[] {
  const claimed = new Set<Task['state']>();
  const lanes: Lane[] = LANE_SPEC.map(spec => {
    spec.states.forEach(s => claimed.add(s));
    return { ...spec, tasks: tasks.filter(t => spec.states.includes(t.state)) };
  });

  const leftover = tasks.filter(t => !claimed.has(t.state));
  if (leftover.length > 0) {
    lanes.push({ id: 'other', label: 'Other', hint: '', attention: false, tasks: leftover });
  }

  return lanes.filter(lane => lane.tasks.length > 0);
}

export default function WorkScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [detail, setDetail] = useState<Record<string, TaskDetail>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [arena, setArena] = useState('personal');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState<Record<string, string>>({});

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

  async function openDetail(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try {
      const r = await apiFetch(`/tasks/${id}`);
      if (!r.ok) return;
      const body = await r.json() as TaskDetail;
      setDetail(d => ({ ...d, [id]: body }));
    } catch { /* the row still renders without detail */ }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), arena }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({})) as { error?: string };
        setError(b.error ?? 'That did not go through.');
      } else {
        setTitle('');
        await load();
      }
    } catch {
      setError('That did not go through.');
    } finally {
      setSubmitting(false);
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
  const lanes  = groupIntoLanes(active);
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
        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 8 }}>
          She works it alone as far as she can, asks only if research genuinely can&apos;t settle it, and reports when it&apos;s done.
        </div>
      </form>

      {error && (
        <div className="glass" style={{ padding: 12, borderColor: 'rgba(244,63,94,0.4)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── The board ───────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <h2 className="section-title" style={{ margin: 0 }}>In flight</h2>
          <span className="lane-count">{active.length}</span>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={runNow} title="Run the next due task now">
            <Play size={13} /> Run now
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : lanes.length === 0 ? (
          <div className="empty-state" style={{ padding: 28 }}>
            Nothing running. Give her something above.
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {lanes.map(lane => (
              <motion.div key={lane.id} layout className={`lane${lane.attention ? ' lane--attention' : ''}`}>
                <div className="lane-header">
                  <span className="lane-label">{lane.label}</span>
                  <span className="lane-count">{lane.tasks.length}</span>
                  {lane.hint && <span className="lane-hint">{lane.hint}</span>}
                </div>

                {lane.tasks.map(task => {
                  const meta = STATE_META[task.state];
                  const d = detail[task.id];
                  const isOpen = expanded === task.id;
                  const openQ = d?.questions?.filter(q => q.status === 'open') ?? [];

                  return (
                    <motion.div key={task.id} layout className="glass task-card" style={{ borderLeftColor: meta.color }}>
                      <div className="task-row" onClick={() => openDetail(task.id)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="task-title">{task.title}</div>
                          <div className="task-meta">
                            <span
                              className="state-pill"
                              style={{ color: meta.color, background: meta.tint, borderColor: meta.tint }}
                            >
                              {meta.icon}{meta.label}
                            </span>
                            {task.owner === 'raven' && <span>🦅 hers</span>}
                            {task.owner === 'person' && <span>🤝 handed off</span>}
                            {arenaName(task.arena_id) && arenaName(task.arena_id) !== 'Personal' && (
                              <span>{arenaName(task.arena_id)}</span>
                            )}
                            {task.run_count > 0 && <span>run {task.run_count}/{task.max_runs}</span>}
                          </div>
                          {task.blocked_on && (
                            <div className="task-note task-note--blocked">{task.blocked_on}</div>
                          )}
                          {!task.blocked_on && task.next_action && task.state !== 'waiting' && (
                            <div className="task-note">
                              <span className="task-note-label">Next</span>{task.next_action}
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
                          {d.last_progress && (
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                              <strong style={{ color: 'var(--color-text)' }}>Last run: </strong>{d.last_progress}
                            </div>
                          )}

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
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </section>

      {/* ── Finished ────────────────────────────────────────── */}
      {done.length > 0 && (
        <section className="lane">
          <div className="lane-header">
            <span className="lane-label">Finished</span>
            <span className="lane-count">{done.length}</span>
          </div>
          {done.slice(0, 15).map(task => {
            const d = detail[task.id];
            const isOpen = expanded === task.id;
            return (
              <div key={task.id} className="glass task-card" style={{ borderLeftColor: 'var(--color-emerald)' }}>
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
                    <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 10, fontStyle: 'italic' }}>
                      Tell her on Discord if any of this was wrong — she&apos;ll remember it.
                    </div>
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
