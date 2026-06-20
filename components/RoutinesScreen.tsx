'use client';
import { apiFetch } from '../lib/api';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock, Play } from 'lucide-react';


interface Routine {
  id: string;
  name: string;
  description: string | null;
  cron: string;
  prompt: string;
  enabled: boolean;
  channel: string;
  created_by: string;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
}

/** Convert a cron expression to a human-readable string */
function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, , dow] = parts;

  const days: Record<string, string> = { '0': 'Sundays', '1': 'Mondays', '2': 'Tuesdays', '3': 'Wednesdays', '4': 'Thursdays', '5': 'Fridays', '6': 'Saturdays' };
  const h = parseInt(hour);
  const m = parseInt(min);
  const timeStr = isNaN(h) ? '' : `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} ET`;

  if (dow !== '*' && dom === '*') return `Every ${days[dow] ?? `day ${dow}`} at ${timeStr}`;
  if (dow === '*' && dom === '*') return `Daily at ${timeStr}`;
  if (min === '*/5') return 'Every 5 minutes';
  if (min === '*/30') return 'Every 30 minutes';
  return expr;
}

const CHANNEL_BADGE: Record<string, string> = {
  telegram: '📱 Telegram',
  discord: '💬 Discord',
  both: '📱💬 Both',
};

export default function RoutinesScreen() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function fetchRoutines() {
    try {
      const r = await apiFetch(`/routines`);
      if (!r.ok) return;
      setRoutines(await r.json() as Routine[]);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRoutines(); }, []);

  async function toggleRoutine(id: string, enabled: boolean) {
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
    try {
      await apiFetch(`/routines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch { await fetchRoutines(); }
  }

  async function deleteRoutine(id: string) {
    setDeleting(id);
    try {
      await apiFetch(`/routines/${id}`, { method: 'DELETE' });
      setRoutines(prev => prev.filter(r => r.id !== id));
    } catch { /* silent */ } finally {
      setDeleting(null);
    }
  }

  const ravenRoutines = routines.filter(r => r.created_by === 'raven');
  const ashRoutines = routines.filter(r => r.created_by !== 'raven');

  return (
    <div className="routines-screen">
      <div className="routines-hint">
        <span>🦅</span>
        <p>Raven creates routines automatically based on your conversations. Talk to her about recurring struggles, goals, or things you want regular check-ins on — she&apos;ll schedule them herself.</p>
      </div>

      {loading ? (
        <div className="routines-empty">Loading routines...</div>
      ) : routines.length === 0 ? (
        <div className="routines-empty">
          <span style={{ fontSize: 36 }}>🗓</span>
          <p>No routines yet.</p>
          <p style={{ fontSize: 12, opacity: 0.5 }}>Tell Raven about something you want to be reminded about regularly — she&apos;ll create a routine for it.</p>
        </div>
      ) : (
        <>
          {ravenRoutines.length > 0 && (
            <section className="routines-section">
              <h3 className="routines-section-title">
                <span>🦅</span> Created by Raven
                <span className="routines-count">{ravenRoutines.length}</span>
              </h3>
              <div className="routines-list">
                <AnimatePresence>
                  {ravenRoutines.map(r => (
                    <RoutineCard
                      key={r.id}
                      routine={r}
                      expanded={expanded === r.id}
                      onExpand={() => setExpanded(expanded === r.id ? null : r.id)}
                      onToggle={toggleRoutine}
                      onDelete={deleteRoutine}
                      deleting={deleting === r.id}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {ashRoutines.length > 0 && (
            <section className="routines-section">
              <h3 className="routines-section-title">
                <span>🧠</span> Created by You
                <span className="routines-count">{ashRoutines.length}</span>
              </h3>
              <div className="routines-list">
                <AnimatePresence>
                  {ashRoutines.map(r => (
                    <RoutineCard
                      key={r.id}
                      routine={r}
                      expanded={expanded === r.id}
                      onExpand={() => setExpanded(expanded === r.id ? null : r.id)}
                      onToggle={toggleRoutine}
                      onDelete={deleteRoutine}
                      deleting={deleting === r.id}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RoutineCard({
  routine, expanded, onExpand, onToggle, onDelete, deleting,
}: {
  routine: Routine;
  expanded: boolean;
  onExpand: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`routine-card ${!routine.enabled ? 'routine-card--disabled' : ''}`}
    >
      <div className="routine-card-header" onClick={onExpand} role="button" tabIndex={0}>
        <div className="routine-card-info">
          <div className="routine-card-name">{routine.name}</div>
          <div className="routine-card-schedule">
            <Clock size={11} /> {cronToHuman(routine.cron)}
            <span className="routine-card-channel">{CHANNEL_BADGE[routine.channel] ?? routine.channel}</span>
          </div>
          {routine.last_run_at && (
            <div className="routine-card-lastrun">
              <Play size={10} /> Last ran {new Date(routine.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {routine.run_count > 0 && ` · ${routine.run_count}× total`}
            </div>
          )}
        </div>
        <div className="routine-card-actions" onClick={e => e.stopPropagation()}>
          <button
            className={`routine-toggle ${routine.enabled ? 'routine-toggle--on' : ''}`}
            onClick={() => onToggle(routine.id, !routine.enabled)}
            aria-label={routine.enabled ? 'Disable routine' : 'Enable routine'}
          >
            <span className="routine-toggle-knob" />
          </button>
          <button
            className="routine-delete"
            onClick={() => onDelete(routine.id)}
            disabled={deleting}
            aria-label="Delete routine"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          style={{ overflow: 'hidden' }}
          className="routine-card-detail"
        >
          {routine.description && <p className="routine-card-desc">{routine.description}</p>}
          <div className="routine-card-prompt-label">Raven&apos;s prompt when this fires:</div>
          <pre className="routine-card-prompt">{routine.prompt}</pre>
          <div className="routine-card-meta">
            Created {new Date(routine.created_at).toLocaleDateString()}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
