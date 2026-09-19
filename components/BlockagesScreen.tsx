'use client';

/**
 * Blockages — what Raven could not do.
 *
 * Capability gaps, bugs and blockers she files on herself while working. This
 * is the surface that turns "she just didn't do it" into "she couldn't, and
 * here's why" — which is the difference between an assistant you distrust and
 * one you can fix.
 *
 * `hit_count` is the useful column: something she has run into eleven times is
 * a different proposition from something she hit once, and it sorts to the top.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Zap, Bug, Ban, Check, X, ChevronDown, ChevronRight, Lightbulb, KeyRound } from 'lucide-react';
import { apiFetch } from '../lib/api';

/**
 * What she found when she went looking for a way round the wall.
 *
 * Present only on a `capability` filing, and only when she actually researched
 * it — the handler omits the key rather than writing an empty one, because a
 * heading over nothing reads as "she looked and found nothing", which is a
 * different and much stronger claim than "she did not look".
 */
interface Solution {
  options: string[];
  recommended: string;
  needs_from_ash: string | null;
}

interface Item {
  id: string;
  type: 'capability' | 'bug' | 'blocker' | 'error';
  title: string;
  description: string | null;
  priority: string | null;
  status: string;
  source: string | null;
  context: Record<string, unknown> | null;
  hit_count: number | null;
  created_at: string;
}

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  capability: { icon: <Zap size={13} />,  label: 'Needs building', color: 'var(--color-lavender)' },
  bug:        { icon: <Bug size={13} />,  label: 'Broken',         color: 'var(--color-rose)' },
  blocker:    { icon: <Ban size={13} />,  label: 'Blocked',        color: 'var(--color-gold)' },
  error:      { icon: <Bug size={13} />,  label: 'Error',          color: 'var(--color-text-subtle)' },
};

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function BlockagesScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/evolution?status=pending');
      if (!r.ok) return;
      const body = await r.json() as { items: Item[] };
      setItems(body.items ?? []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, status: 'resolved' | 'wont_fix') {
    setBusy(id);
    try {
      await apiFetch(`/evolution/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setItems(list => list.filter(i => i.id !== id));
    } catch { /* silent */ } finally {
      setBusy(null);
    }
  }

  const shown = (filter ? items.filter(i => i.type === filter) : items)
    .sort((a, b) =>
      (b.hit_count ?? 1) - (a.hit_count ?? 1) ||
      (PRIORITY_ORDER[a.priority ?? 'medium'] ?? 2) - (PRIORITY_ORDER[b.priority ?? 'medium'] ?? 2),
    );

  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.type] = (acc[i.type] ?? 0) + 1;
    return acc;
  }, {});

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[{ id: '', label: `All (${items.length})` },
          ...Object.entries(counts).map(([t, n]) => ({ id: t, label: `${TYPE_META[t]?.label ?? t} (${n})` }))
        ].map(f => (
          <button
            key={f.id}
            className={`btn ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty-state" style={{ padding: 32 }}>
          Nothing outstanding. When Raven hits something she genuinely can&apos;t do, it lands here instead of quietly not happening.
        </div>
      ) : shown.map(item => {
        const meta = TYPE_META[item.type] ?? TYPE_META.blocker;
        const isOpen = expanded === item.id;
        const ctx = item.context as { why?: string; solution?: Solution } | null;
        const why = ctx?.why;
        const solution = ctx?.solution ?? null;

        return (
          <motion.div key={item.id} layout className="glass" style={{ padding: 16 }}>
            <div
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
              onClick={() => setExpanded(isOpen ? null : item.id)}
            >
              <span style={{ color: meta.color, display: 'flex', marginTop: 2 }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 11, color: 'var(--color-text-subtle)' }}>
                  <span style={{ color: meta.color }}>{meta.label}</span>
                  {item.priority && <span>{item.priority}</span>}
                  {(item.hit_count ?? 1) > 1 && (
                    <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>
                      hit {item.hit_count}×
                    </span>
                  )}
                  {solution && (
                    <span style={{ color: 'var(--color-lavender)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Lightbulb size={11} /> has a proposal
                    </span>
                  )}
                  <span>{item.created_at?.slice(0, 10)}</span>
                </div>
              </div>
              <span style={{ color: 'var(--color-text-subtle)', display: 'flex', marginTop: 2 }}>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </span>
            </div>

            {isOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                {item.description && (
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>
                    {item.description}
                  </div>
                )}
                {why && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-subtle)' }}>
                      What it stopped
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{why}</div>
                  </div>
                )}

                {/* The proposal. This is the half that makes the row actionable:
                    "she cannot make phone calls" is a complaint, "she cannot, and
                    Vapi does it for ~$0.05/min, and you need an account" is a
                    decision you can make in thirty seconds. */}
                {solution && (
                  <div style={{
                    marginTop: 12, padding: 12, borderRadius: 8,
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.22)',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em',
                      color: 'var(--color-lavender)',
                    }}>
                      <Lightbulb size={12} /> What she found
                    </div>

                    <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
                      {solution.recommended}
                    </div>

                    {solution.options?.length > 0 && (
                      <ul style={{
                        margin: '8px 0 0', paddingLeft: 16,
                        fontSize: 12, color: 'var(--color-text-muted)',
                      }}>
                        {solution.options.map((o, i) => <li key={i} style={{ marginBottom: 2 }}>{o}</li>)}
                      </ul>
                    )}

                    {solution.needs_from_ash && (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10,
                        paddingTop: 10, borderTop: '1px solid rgba(167,139,250,0.18)',
                        fontSize: 13, color: 'var(--color-gold)',
                      }}>
                        <KeyRound size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span><strong>Needs you:</strong> {solution.needs_from_ash}</span>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn btn-success" disabled={busy === item.id} onClick={() => decide(item.id, 'resolved')}>
                    <Check size={14} /> Fixed
                  </button>
                  <button className="btn btn-ghost" disabled={busy === item.id} onClick={() => decide(item.id, 'wont_fix')}>
                    <X size={14} /> Not doing it
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
