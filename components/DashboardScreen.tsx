'use client';
import { apiFetch } from '../lib/api';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Target, BookOpen, Zap, MessageSquare,
  TrendingUp, Clock, AlertCircle, ChevronRight, RefreshCw,
  DollarSign, Heart, Users, Sparkles,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────── */
type Goal      = { id: string; title: string; status: string; progress: number };
type Thought   = { id: string; content: string; type: string; priority: number };
type Research  = { id: string; topic: string; status: string; created_at: string };
type Activity  = { id: string; type: string; description: string; created_at: string };
type LibStats  = { total: number; byType: Record<string, number> };
type EvoSummary = { total_pending: number; critical: number };
type Health    = { status: string; uptime: number };
type FinSummary = { monthly_income: number; monthly_expenses: number; monthly_net: number };
type WishItem  = { id: string; purchased: boolean };
type Contact   = { id: string; active: boolean };

/* ─── Helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/* ─── Sub-components ──────────────────────────────────────────── */
function Card({ children, style, onClick }: {
  children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick ? 'border-color 0.15s' : undefined,
        ...style,
      }}
      onMouseEnter={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.14)'; } : undefined}
      onMouseLeave={onClick ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'; } : undefined}
    >
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, color, title, count, onSeeAll }: {
  icon: typeof Brain; color: string; title: string; count?: number; onSeeAll?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Icon size={14} style={{ color }} />
      <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
        {title}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700,
          background: `${color}22`, color, borderRadius: 100, padding: '1px 7px',
        }}>{count}</span>
      )}
      {onSeeAll && (
        <button onClick={onSeeAll} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 2,
          padding: 0, fontFamily: 'var(--font-sans)',
        }}>
          all <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
type DashboardProps = { onNavigate: (screen: string) => void };

export default function DashboardScreen({ onNavigate }: DashboardProps) {
  const [health,     setHealth]     = useState<Health | null>(null);
  const [goals,      setGoals]      = useState<Goal[]>([]);
  const [thoughts,   setThoughts]   = useState<Thought[]>([]);
  const [research,   setResearch]   = useState<Research[]>([]);
  const [activity,   setActivity]   = useState<Activity[]>([]);
  const [libStats,   setLibStats]   = useState<LibStats>({ total: 0, byType: {} });
  const [evoSummary, setEvoSummary] = useState<EvoSummary>({ total_pending: 0, critical: 0 });
  const [finSummary, setFinSummary] = useState<FinSummary | null>(null);
  const [wishlist,   setWishlist]   = useState<WishItem[]>([]);
  const [contacts,   setContacts]   = useState<Contact[]>([]);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiFetch('/health').then(r => r.json()),
        apiFetch('/goals?status=active&limit=4').then(r => r.json()),
        apiFetch('/mind?type=question_for_ash&addressed=false&limit=3').then(r => r.json()),
        apiFetch('/research/queue?status=pending&limit=3').then(r => r.json()),
        apiFetch('/activity?limit=4').then(r => r.json()),
        apiFetch('/library?limit=200').then(r => r.json()),
        apiFetch('/evolution/summary').then(r => r.json()),
        apiFetch('/finances/summary').then(r => r.json()),
        apiFetch('/amazon/wishlist').then(r => r.json()),
        apiFetch('/contacts').then(r => r.json()),
      ]);

      const [healthR, goalsR, thoughtsR, researchR, activityR, libR, evoR, finR, wishR, contactsR] = results;

      if (healthR.status   === 'fulfilled') setHealth(healthR.value);
      if (goalsR.status    === 'fulfilled') setGoals(Array.isArray(goalsR.value) ? goalsR.value.slice(0, 4) : []);
      if (thoughtsR.status === 'fulfilled') {
        const raw = thoughtsR.value;
        setThoughts((Array.isArray(raw) ? raw : (raw?.items ?? [])).slice(0, 3));
      }
      if (researchR.status === 'fulfilled') setResearch(Array.isArray(researchR.value) ? researchR.value.slice(0, 3) : []);
      if (activityR.status === 'fulfilled') setActivity(Array.isArray(activityR.value) ? activityR.value.slice(0, 4) : []);
      if (libR.status      === 'fulfilled' && Array.isArray(libR.value)) {
        const data = libR.value as Array<{ type: string }>;
        const byType: Record<string, number> = {};
        data.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
        setLibStats({ total: data.length, byType });
      }
      if (evoR.status  === 'fulfilled') setEvoSummary(evoR.value ?? { total_pending: 0, critical: 0 });
      if (finR.status  === 'fulfilled') setFinSummary(finR.value);
      if (wishR.status === 'fulfilled') setWishlist(Array.isArray(wishR.value) ? wishR.value : []);
      if (contactsR.status === 'fulfilled') setContacts(Array.isArray(contactsR.value) ? contactsR.value : []);
    } catch { /* non-critical */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uptimeMin = health ? Math.floor(health.uptime / 60) : null;
  const activeContacts = contacts.filter(c => c.active).length;
  const wishlistOpen   = wishlist.filter(w => !w.purchased).length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

      {/* ── Status bar ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 18px',
          background: 'rgba(52,211,153,0.05)',
          border: '1px solid rgba(52,211,153,0.12)',
          borderRadius: 12, marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="status-dot" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Raven is online</span>
          {uptimeMin !== null && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              · up {uptimeMin < 60 ? `${uptimeMin}m` : `${Math.round(uptimeMin / 60)}h`}
            </span>
          )}
        </div>
        <button
          onClick={load}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: 'var(--font-sans)' }}
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </motion.div>

      {/* ── Critical alert ─────────────────────────────────────── */}
      <AnimatePresence>
        {evoSummary.critical > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{
              overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 16px', marginBottom: 16,
              background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.25)',
              borderRadius: 10, cursor: 'pointer',
            }}
            onClick={() => onNavigate('evolution')}
          >
            <AlertCircle size={15} style={{ color: '#fb7185', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#fda4af', flex: 1 }}>
              {evoSummary.critical} critical item{evoSummary.critical > 1 ? 's' : ''} in the evolution queue
            </span>
            <ChevronRight size={13} style={{ color: '#fb7185' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Snapshot stat strip ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}
      >
        {[
          {
            label: 'Monthly Net',
            value: finSummary ? fmt(finSummary.monthly_net) : '—',
            sub: finSummary ? `${fmt(finSummary.monthly_income)} in · ${fmt(finSummary.monthly_expenses)} out` : 'Set up finances',
            color: finSummary ? (finSummary.monthly_net >= 0 ? '#34d399' : '#f87171') : 'var(--color-text-muted)',
            icon: DollarSign,
            onClick: () => onNavigate('finances'),
          },
          {
            label: 'Active Goals',
            value: goals.length || '—',
            sub: goals.length > 0 ? `${goals.filter(g => g.progress >= 80).length} near done` : 'None active',
            color: 'var(--color-emerald)',
            icon: Target,
            onClick: () => onNavigate('goals'),
          },
          {
            label: 'Wishlist',
            value: wishlistOpen || '—',
            sub: wishlistOpen > 0 ? `${wishlist.filter(w => w.purchased).length} already got` : 'Nothing yet',
            color: '#fb7185',
            icon: Heart,
            onClick: () => onNavigate('shopping'),
          },
          {
            label: 'Contacts',
            value: activeContacts || '—',
            sub: activeContacts > 0 ? `${activeContacts} authorized` : 'None added',
            color: 'var(--color-lavender)',
            icon: Users,
            onClick: () => onNavigate('contacts'),
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04 }}
            onClick={s.onClick}
            style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            whileHover={{ borderColor: 'rgba(255,255,255,0.14)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)' }}>
                {s.label}
              </span>
              <s.icon size={13} style={{ color: s.color, opacity: 0.8 }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-0.5px', marginBottom: 3 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--color-text-subtle)', lineHeight: 1.4 }}>{s.sub}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Main 2-col grid ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* On Raven's mind — capped at 3 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <SectionHeader
              icon={Brain} color="var(--color-lavender)" title="On Raven's Mind"
              count={thoughts.length > 0 ? thoughts.length : undefined}
              onSeeAll={() => onNavigate('mind')}
            />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : thoughts.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                Raven has no pending questions for you.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {thoughts.map(t => (
                  <div key={t.id} style={{
                    fontSize: 12.5, lineHeight: 1.5,
                    padding: '8px 12px',
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.12)',
                    borderRadius: 9,
                    color: 'var(--color-text)',
                    /* Clamp to 2 lines to prevent overflow */
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  } as React.CSSProperties}>
                    💭 {t.content}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Active Goals */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card>
            <SectionHeader
              icon={Target} color="var(--color-emerald)" title="Active Goals"
              count={goals.length > 0 ? goals.length : undefined}
              onSeeAll={() => onNavigate('goals')}
            />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : goals.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                No active goals. Tell Raven what you&apos;re working toward.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {goals.map(g => (
                  <div key={g.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                        {g.title}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>{g.progress}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${g.progress}%`,
                        background: 'linear-gradient(90deg, var(--color-emerald), var(--color-lavender))',
                        borderRadius: 2, transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Research queue — capped at 3 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <Card>
            <SectionHeader
              icon={BookOpen} color="var(--color-indigo)" title="Researching"
              count={research.length > 0 ? research.length : undefined}
              onSeeAll={() => onNavigate('library')}
            />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : research.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                Queue is clear. Mention a topic in chat and Raven will pick it up.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {research.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>⏳</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.topic}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>{timeAgo(r.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Recent activity — capped at 4 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card>
            <SectionHeader icon={TrendingUp} color="var(--color-gold)" title="Recent Activity" />
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : activity.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No activity yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {activity.map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Clock size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 1 }}>{timeAgo(a.created_at)}</div>
                      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* ── Raven's brain stats ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}
        style={{ display: 'flex', gap: 10, marginBottom: 18 }}
      >
        {[
          { label: "Raven knows",      value: libStats.total,                       color: 'var(--color-lavender)', icon: Brain    },
          { label: "Facts about you",  value: libStats.byType['user_fact'] ?? 0,    color: 'var(--color-gold)',     icon: Sparkles },
          { label: "Research entries", value: libStats.byType['research'] ?? 0,     color: 'var(--color-indigo)',   icon: BookOpen },
          { label: "Evol. pending",    value: evoSummary.total_pending,             color: 'var(--color-rose)',     icon: Zap      },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <s.icon size={13} style={{ color: s.color, opacity: 0.8, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: s.color, letterSpacing: '-0.3px' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── Quick actions ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <button className="btn btn-primary" onClick={() => onNavigate('chat')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageSquare size={13} /> Talk to Raven
        </button>
        <button className="btn btn-ghost" onClick={() => onNavigate('finances')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DollarSign size={13} /> Finances
        </button>
        <button className="btn btn-ghost" onClick={() => onNavigate('goals')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Target size={13} /> Goals
        </button>
        <button className="btn btn-ghost" onClick={() => onNavigate('library')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BookOpen size={13} /> Research
        </button>
      </motion.div>

    </div>
  );
}
