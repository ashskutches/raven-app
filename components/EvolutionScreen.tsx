'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Zap, Bug, RefreshCw, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_RAVEN_API_URL ?? '';

type ItemType = 'error' | 'capability' | 'bug';
type Status = 'pending' | 'in_progress' | 'resolved' | 'wont_fix';
type Priority = 'critical' | 'high' | 'medium' | 'low';

interface EvolutionItem {
  id: string;
  type: ItemType;
  title: string;
  description?: string;
  priority: Priority;
  status: Status;
  source: string;
  context?: Record<string, unknown>;
  affected_file?: string;
  hit_count?: number;
  suggested_fix?: string;
  created_at: string;
}

const TYPE_CONFIG: Record<ItemType, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  error:      { label: 'Error',      icon: <AlertCircle size={13} />, color: '#fda4af', bg: 'rgba(251,113,133,0.12)', border: 'rgba(251,113,133,0.28)' },
  capability: { label: 'Capability', icon: <Zap size={13} />,         color: '#c4b5fd', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.28)' },
  bug:        { label: 'Bug',        icon: <Bug size={13} />,          color: '#fcd34d', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.28)'  },
};

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: '#fda4af',
  high:     '#fcd34d',
  medium:   '#a5b4fc',
  low:      'rgba(255,255,255,0.4)',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function ItemCard({ item, onUpdate }: { item: EvolutionItem; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const tc = TYPE_CONFIG[item.type];

  async function updateStatus(status: Status) {
    setUpdating(true);
    try {
      await fetch(`${API}/evolution/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      onUpdate();
    } finally {
      setUpdating(false);
    }
  }

  const why = item.context && typeof item.context === 'object' ? (item.context as Record<string, string>).why : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${tc.border}`,
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Type badge */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 100,
          background: tc.bg, border: `1px solid ${tc.border}`,
          color: tc.color, fontSize: 11, fontWeight: 700,
          flexShrink: 0,
        }}>
          {tc.icon}{tc.label}
        </span>

        {/* Priority dot */}
        <span style={{
          width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
          background: PRIORITY_COLOR[item.priority],
          boxShadow: `0 0 6px ${PRIORITY_COLOR[item.priority]}`,
        }} title={`Priority: ${item.priority}`} />

        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', lineHeight: 1.4 }}>
            {item.title}
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{timeAgo(item.created_at)}</span>
            {(item.hit_count ?? 1) > 1 && (
              <span style={{ fontSize: 11, color: '#fda4af' }}>×{item.hit_count} hits</span>
            )}
            {item.source && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{item.source}</span>
            )}
          </div>
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 2 }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expandable body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            {item.affected_file && (
              <p style={{ fontSize: 12, color: '#a5b4fc', marginBottom: 6, fontFamily: 'monospace' }}>
                📁 {item.affected_file}
              </p>
            )}
            {why && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8, fontStyle: 'italic' }}>
                Why: {why}
              </p>
            )}
            {item.description && (
              <pre style={{
                fontSize: 12, color: 'rgba(255,255,255,0.45)',
                background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 12px',
                overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 200, overflow: 'auto', marginBottom: 8,
              }}>
                {item.description.slice(0, 800)}
              </pre>
            )}
            {item.suggested_fix && (
              <div style={{
                background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
                borderRadius: 8, padding: '10px 12px', marginBottom: 8,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6ee7b7', marginBottom: 4 }}>💡 AI Suggestion</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', whiteSpace: 'pre-wrap' }}>
                  {item.suggested_fix.slice(0, 600)}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status actions */}
      {item.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => updateStatus('in_progress')}
            disabled={updating}
          >
            <Clock size={12} /> In Progress
          </button>
          <button
            className="btn btn-success"
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => updateStatus('resolved')}
            disabled={updating}
          >
            <CheckCircle size={12} /> Resolved
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '6px 12px', color: 'rgba(255,255,255,0.3)' }}
            onClick={() => updateStatus('wont_fix')}
            disabled={updating}
          >
            <XCircle size={12} /> Won&apos;t Fix
          </button>
        </div>
      )}

      {item.status !== 'pending' && (
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {item.status.replace('_', ' ')}
        </span>
      )}
    </motion.div>
  );
}

type Tab = 'pending' | 'in_progress' | 'resolved';

export default function EvolutionScreen({ onResolved }: { onResolved: () => void }) {
  const [items, setItems] = useState<EvolutionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'pending' || tab === 'in_progress') params.set('status', tab);
      else params.set('status', 'pending');

      const r = await fetch(`${API}/evolution?${params}`);
      if (!r.ok) throw new Error('Failed to fetch');
      const data = await r.json() as { items: EvolutionItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter);
  const errors = items.filter(i => i.type === 'error').length;
  const caps   = items.filter(i => i.type === 'capability').length;
  const critical = items.filter(i => i.priority === 'critical').length;

  return (
    <div className="dashboard-container">
      {/* Summary strip */}
      {tab === 'pending' && items.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Pending', value: items.length, color: '#a5b4fc' },
            { label: 'Errors',  value: errors,        color: '#fda4af' },
            { label: 'Capabilities', value: caps,     color: '#c4b5fd' },
            ...(critical > 0 ? [{ label: 'Critical', value: critical, color: '#f87171' }] : []),
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="library-tabs">
          {(['pending', 'in_progress', 'resolved'] as Tab[]).map(t => (
            <button
              key={t}
              className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="library-tabs">
          {(['all', 'error', 'capability', 'bug'] as const).map(f => (
            <button
              key={f}
              className={`tab ${typeFilter === f ? 'active' : ''}`}
              onClick={() => setTypeFilter(f)}
            >
              {f === 'all' ? 'All types' : f}
            </button>
          ))}
        </div>

        <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '7px 12px', fontSize: 12 }} onClick={fetchItems}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)' }}>
          Loading evolution queue...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>✅</p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>
            {tab === 'pending' ? 'No pending items — Raven is healthy.' : `No ${tab.replace('_', ' ')} items.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <AnimatePresence>
            {filtered.map(item => (
              <ItemCard key={item.id} item={item} onUpdate={() => { fetchItems(); onResolved(); }} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
