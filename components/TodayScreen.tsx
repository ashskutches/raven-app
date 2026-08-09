'use client';

/**
 * Today — the answer to "what happened while I was asleep, and what needs me".
 *
 * Ordering is the whole design. What Raven already did comes first, because the
 * point of the rebuild is that things move without Ash. What needs him comes
 * second and is deliberately short. Her queue comes last, as evidence rather
 * than as a request.
 *
 * This replaces the old Dashboard, which led with mood, energy and streaks.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader, AlertOctagon, PauseCircle, ShieldQuestion, Inbox } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface WorkItem {
  id: string;
  title: string;
  outcome: string | null;
  notes: string | null;
  next_action: string | null;
  owner: 'ash' | 'raven';
  state: 'inbox' | 'next' | 'doing' | 'waiting' | 'blocked' | 'done' | 'dropped';
  arena_id: string | null;
  due_at: string | null;
  blocked_on: string | null;
  starred: boolean;
  priority: number;
  completed_at: string | null;
}

interface Arena { id: string; slug: string; name: string }
interface LedgerRow {
  id: string;
  action_type: string;
  outcome: string;
  reason: string | null;
  amount_usd: number | null;
  created_at: string;
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return d === today;
}

export default function TodayScreen() {
  const [work, setWork] = useState<WorkItem[]>([]);
  const [doneToday, setDoneToday] = useState<WorkItem[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [approvals, setApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [openRes, doneRes, arenaRes, ledgerRes, apprRes] = await Promise.all([
        apiFetch('/work'),
        apiFetch('/work?state=done'),
        apiFetch('/work/arenas'),
        apiFetch('/approvals/ledger?limit=40'),
        apiFetch('/approvals'),
      ]);
      if (openRes.ok)   setWork(await openRes.json() as WorkItem[]);
      if (doneRes.ok)   setDoneToday(((await doneRes.json()) as WorkItem[]).filter(w => isToday(w.completed_at)));
      if (arenaRes.ok)  setArenas(await arenaRes.json() as Arena[]);
      if (ledgerRes.ok) setLedger(((await ledgerRes.json()) as LedgerRow[]).filter(r => isToday(r.created_at)));
      if (apprRes.ok)   setApprovals(((await apprRes.json()) as unknown[]).length);
    } catch { /* silent — the panels below degrade to empty */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const arenaName = (id: string | null) => arenas.find(a => a.id === id)?.name ?? null;

  const inFlight  = work.filter(w => w.state === 'doing');
  const needsAsh  = work
    .filter(w => w.owner === 'ash' && (w.state === 'next' || w.state === 'inbox'))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || b.priority - a.priority)
    .slice(0, 5);
  const ravenNext = work.filter(w => w.owner === 'raven' && w.state === 'next');
  const stalled   = work.filter(w => w.state === 'blocked' || w.state === 'waiting');
  const executed  = ledger.filter(r => r.outcome === 'executed');

  if (loading) return <div className="empty-state">Loading…</div>;

  const Row = ({ item, muted }: { item: WorkItem; muted?: boolean }) => {
    const arena = arenaName(item.arena_id);
    return (
      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: 14, opacity: muted ? 0.6 : 1, textDecoration: muted ? 'line-through' : 'none' }}>
          {item.starred && <span style={{ marginRight: 6 }}>⭐</span>}
          {item.title}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3, fontSize: 11, color: 'var(--color-text-subtle)' }}>
          {arena && arena !== 'Personal' && <span>{arena}</span>}
          {item.next_action && <span>next: {item.next_action}</span>}
          {item.blocked_on && <span style={{ color: 'var(--color-rose)' }}>blocked: {item.blocked_on}</span>}
          {item.due_at && <span>due {item.due_at.slice(0, 10)}</span>}
        </div>
      </div>
    );
  };

  const Panel = ({
    icon, title, count, accent, children,
  }: {
    icon: React.ReactNode; title: string; count?: number; accent?: string; children: React.ReactNode;
  }) => (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass"
      style={{ padding: 20 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: accent ?? 'var(--color-lavender)', display: 'flex' }}>{icon}</span>
        <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.01em' }}>{title}</h2>
        {count !== undefined && count > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 12, fontWeight: 700,
            color: accent ?? 'var(--color-lavender)',
          }}>{count}</span>
        )}
      </div>
      {children}
    </motion.section>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 48 }}>

      {/* Approvals jump to the top when they exist — they are the one thing
          that stalls Raven entirely until Ash answers. */}
      {approvals > 0 && (
        <motion.a
          href="/approvals"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass"
          style={{
            padding: 16, display: 'flex', alignItems: 'center', gap: 10,
            borderColor: 'rgba(245,158,11,0.45)', textDecoration: 'none', color: 'inherit',
          }}
        >
          <ShieldQuestion size={18} color="var(--color-gold)" />
          <span style={{ fontSize: 14 }}>
            <strong>{approvals}</strong> {approvals === 1 ? 'decision is' : 'decisions are'} waiting on you
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-subtle)' }}>Review →</span>
        </motion.a>
      )}

      {/* What Raven already did — first, on purpose. */}
      <Panel
        icon={<CheckCircle2 size={16} />}
        title="Done today"
        count={doneToday.length + executed.length}
        accent="var(--color-emerald)"
      >
        {doneToday.length === 0 && executed.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Nothing finished yet today.
          </div>
        ) : (
          <>
            {doneToday.map(w => <Row key={w.id} item={w} muted />)}
            {executed.map(r => (
              <div key={r.id} style={{ padding: '8px 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                🦅 {r.action_type}
                {r.amount_usd !== null && <span style={{ color: 'var(--color-gold)' }}> · ${Number(r.amount_usd).toFixed(2)}</span>}
              </div>
            ))}
          </>
        )}
      </Panel>

      {/* In flight */}
      {inFlight.length > 0 && (
        <Panel icon={<Loader size={16} />} title="In flight" count={inFlight.length}>
          {inFlight.map(w => <Row key={w.id} item={w} />)}
        </Panel>
      )}

      {/* Only Ash can do these */}
      <Panel
        icon={<Inbox size={16} />}
        title="Only you can do these"
        count={needsAsh.length}
        accent="var(--color-gold)"
      >
        {needsAsh.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Nothing is waiting on you. Raven has the rest.
          </div>
        ) : needsAsh.map(w => <Row key={w.id} item={w} />)}
      </Panel>

      {/* Raven's own queue — evidence, not a request */}
      <Panel icon={<Loader size={16} />} title="Raven's queue" count={ravenNext.length}>
        {ravenNext.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Her queue is empty. She will pick up planning or research on the next tick.
          </div>
        ) : ravenNext.slice(0, 8).map(w => <Row key={w.id} item={w} />)}
      </Panel>

      {/* Stalled */}
      {stalled.length > 0 && (
        <Panel
          icon={<AlertOctagon size={16} />}
          title="Stalled"
          count={stalled.length}
          accent="var(--color-rose)"
        >
          {stalled.map(w => <Row key={w.id} item={w} />)}
          <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 10 }}>
            The unblocker runs hourly and chases these. Anything here for days is worth a look.
          </p>
        </Panel>
      )}

      {/* Denials — quiet, but never hidden. A refused action is the one thing
          that must not disappear silently. */}
      {ledger.some(r => r.outcome === 'denied') && (
        <Panel icon={<PauseCircle size={16} />} title="Refused today" accent="var(--color-text-subtle)">
          {ledger.filter(r => r.outcome === 'denied').map(r => (
            <div key={r.id} style={{ padding: '6px 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
              {r.action_type} — {r.reason ?? 'no reason recorded'}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
