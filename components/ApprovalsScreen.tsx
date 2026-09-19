'use client';

/**
 * Approvals — the decision inbox.
 *
 * Everything Raven wants to do outward-facing but has no mandate for waits
 * here. Three answers: yes once, yes always (which mints a mandate), or no.
 *
 * "Always allow" is how mandates actually get created. Nobody writes a spending
 * policy in the abstract; they approve a $40 purchase and mean "keep doing
 * that". The server infers the narrowest mandate that would have permitted the
 * action rather than an open-ended one, and this screen says so out loud —
 * granting authority should never feel like it happened by accident.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ShieldCheck, Clock, Trash2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface PendingRequest {
  id: string;
  action_type: string;
  summary: string | null;
  rationale: string | null;
  /** Why this is a decision rather than something she already did. */
  queued_reason: string | null;
  payload: Record<string, unknown>;
  amount_usd: number | null;
  proposed_at: string;
  expires_at: string;
}

interface Mandate {
  id: string;
  capability: string;
  arena_id: string | null;
  constraints: Record<string, unknown>;
  note: string | null;
  granted_at: string;
  expires_at: string | null;
}

interface Arena { id: string; slug: string; name: string }

function timeLeft(expiresAt: string): { text: string; urgent: boolean } {
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return { text: 'expired', urgent: true };
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return { text: `${Math.max(1, Math.floor(ms / 60_000))}m left`, urgent: true };
  if (hours < 4) return { text: `${hours}h left`, urgent: true };
  return { text: `${hours}h left`, urgent: false };
}

function describeConstraints(c: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof c.max_amount_usd === 'number') parts.push(`max $${c.max_amount_usd} each`);
  if (typeof c.period_limit_usd === 'number') parts.push(`$${c.period_limit_usd}/${c.period ?? 'month'}`);
  if (typeof c.max_per_day === 'number') parts.push(`${c.max_per_day}×/day`);
  if (Array.isArray(c.merchant_allowlist)) parts.push(`only ${(c.merchant_allowlist as string[]).join(', ')}`);
  if (Array.isArray(c.recipient_allowlist)) parts.push(`only ${(c.recipient_allowlist as string[]).join(', ')}`);
  return parts.length ? parts.join(' · ') : 'no limits set';
}

export default function ApprovalsScreen() {
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, m, a] = await Promise.all([
        apiFetch('/approvals'),
        apiFetch('/approvals/mandates'),
        apiFetch('/work/arenas'),
      ]);
      if (p.ok) setPending(await p.json() as PendingRequest[]);
      if (m.ok) setMandates(await m.json() as Mandate[]);
      if (a.ok) setArenas(await a.json() as Arena[]);
    } catch {
      setError('Could not reach Raven.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(id: string, action: 'approve' | 'reject', alwaysAllow = false) {
    setBusy(id);
    setError(null);
    try {
      const r = await apiFetch(`/approvals/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(alwaysAllow ? { always_allow: true } : {}),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string; reason?: string };
        setError(body.error ?? body.reason ?? 'That did not go through.');
      }
      await load();
    } catch {
      setError('That did not go through.');
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    try {
      await apiFetch(`/approvals/mandates/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const arenaName = (id: string | null) =>
    id ? (arenas.find(a => a.id === id)?.name ?? 'one arena') : 'everywhere';

  if (loading) {
    return <div className="empty-state">Loading…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {error && (
        <div className="glass" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', borderColor: 'rgba(244,63,94,0.4)' }}>
          <AlertCircle size={16} color="var(--color-rose)" />
          <span style={{ fontSize: 14 }}>{error}</span>
        </div>
      )}

      {/* ── Pending ─────────────────────────────────────────── */}
      <section>
        <h2 className="section-title">
          Waiting on you {pending.length > 0 && <span style={{ color: 'var(--color-gold)' }}>({pending.length})</span>}
        </h2>

        {pending.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            Nothing needs a decision. Raven is either working inside her mandates or has nothing outward-facing queued.
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {pending.map(req => {
              const left = timeLeft(req.expires_at);
              return (
                <motion.div
                  key={req.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="glass"
                  style={{ padding: 18, marginBottom: 12 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                        {req.summary ?? req.action_type}
                      </div>
                      {req.rationale && (
                        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                          {req.rationale}
                        </div>
                      )}
                      {/* Her reason for wanting it is above; this is the system's
                          reason for stopping it. When a run of cards all say the
                          same thing, that is the leash talking and not Raven. */}
                      {req.queued_reason && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginBottom: 8, fontStyle: 'italic' }}>
                          Waiting because {req.queued_reason}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-subtle)' }}>
                        <span style={{ fontFamily: 'monospace' }}>{req.action_type}</span>
                        {req.amount_usd !== null && (
                          <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>
                            ${Number(req.amount_usd).toFixed(2)}
                          </span>
                        )}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          color: left.urgent ? 'var(--color-rose)' : 'var(--color-text-subtle)',
                        }}>
                          <Clock size={12} /> {left.text}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-success"
                      disabled={busy === req.id}
                      onClick={() => decide(req.id, 'approve')}
                    >
                      <Check size={14} /> Approve
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={busy === req.id}
                      onClick={() => decide(req.id, 'approve', true)}
                      title="Approve and grant a standing mandate, limited to what this action already does"
                    >
                      <ShieldCheck size={14} /> Always allow
                    </button>
                    <button
                      className="btn btn-danger"
                      disabled={busy === req.id}
                      onClick={() => decide(req.id, 'reject')}
                    >
                      <X size={14} /> Reject
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        <p style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 10 }}>
          Anything left undecided expires on its own. Silence is never read as yes.
        </p>
      </section>

      {/* ── Mandates ────────────────────────────────────────── */}
      <section>
        <h2 className="section-title">Standing mandates</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          What Raven can do without asking. Revoking one takes effect on her next action.
        </p>

        {mandates.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            No mandates yet. Every outward-facing action queues for you. Use <strong>Always allow</strong> on an approval to grant the first one.
          </div>
        ) : (
          mandates.map(m => (
            <div key={m.id} className="glass" style={{ padding: 14, marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {m.capability}
                  <span style={{ fontWeight: 400, color: 'var(--color-text-subtle)', marginLeft: 8, fontSize: 12 }}>
                    {arenaName(m.arena_id)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {describeConstraints(m.constraints ?? {})}
                </div>
                {m.note && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 4 }}>{m.note}</div>
                )}
              </div>
              <button
                className="btn btn-ghost"
                disabled={busy === m.id}
                onClick={() => revoke(m.id)}
                title="Revoke this mandate"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
