'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/api';
import {
  Users, Plus, Trash2, Edit3, Check, X, ChevronDown,
  Shield, MessageSquare, Star, RefreshCw, Search, Server, Hand,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────── */
type Permission = 'chat_only' | 'updates' | 'full';
type Role = 'contact' | 'family' | 'team';

interface Contact {
  id:               string;
  discord_user_id:  string | null;
  telegram_user_id: string | null;
  name:             string;
  username:         string | null;
  avatar_url:       string | null;
  role:             Role;
  permissions:      Permission;
  active:           boolean;
  notes:            string | null;
  last_active_at:   string | null;
  created_at:       string;
}

interface Guild {
  id:       string;
  name:     string;
  icon_url: string | null;
}

interface GuildMember {
  discord_user_id: string;
  username:        string;
  display_name:    string;
  avatar_url:      string | null;
}

/* ─── Helpers ────────────────────────────────────────────────────── */
const PERMISSION_META: Record<Permission, { label: string; desc: string; color: string; icon: typeof Shield }> = {
  chat_only: { label: 'Chat Only',  desc: 'Can talk to Raven. No Ash data shared.',        color: '#a78bfa', icon: MessageSquare },
  updates:   { label: 'Updates',    desc: 'Can receive shared project status updates.',     color: '#fbbf24', icon: Star         },
  full:      { label: 'Full Access',desc: 'Treated like Ash. Use with close trust only.',  color: '#34d399', icon: Shield       },
};

const ROLE_META: Record<Role, { label: string; color: string }> = {
  contact: { label: 'Contact', color: 'rgba(167,139,250,0.2)' },
  family:  { label: 'Family',  color: 'rgba(251,113,133,0.2)' },
  team:    { label: 'Team',    color: 'rgba(52,211,153,0.2)'  },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function Avatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (url) {
    return (
      <img
        src={url} alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(167,139,250,0.3)' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff',
      border: '2px solid rgba(167,139,250,0.3)',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

/* ─── Add-Contact Modal ──────────────────────────────────────────── */
function AddContactModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [step, setStep]           = useState<'guild' | 'members' | 'configure'>('guild');
  const [guilds, setGuilds]       = useState<Guild[]>([]);
  const [members, setMembers]     = useState<GuildMember[]>([]);
  const [selected, setSelected]   = useState<GuildMember | null>(null);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [searchQ, setSearchQ]     = useState('');
  const [role, setRole]           = useState<Role>('contact');
  const [permissions, setPermissions] = useState<Permission>('chat_only');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    setLoadingGuilds(true);
    apiFetch('/contacts/discord/guilds')
      .then(r => r.json())
      .then((data: Guild[]) => { setGuilds(data); setLoadingGuilds(false); })
      .catch(() => { setError('Could not load Discord servers. Is the bot token configured?'); setLoadingGuilds(false); });
  }, []);

  const loadMembers = async (guild: Guild) => {
    setSelectedGuild(guild);
    setLoadingMembers(true);
    setStep('members');
    try {
      const r = await apiFetch(`/contacts/discord/guilds/${guild.id}/members`);
      const data = await r.json() as GuildMember[];
      setMembers(data);
    } catch {
      setError('Could not load members.');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const r = await apiFetch('/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discord_user_id: selected.discord_user_id,
          name: selected.display_name,
          username: selected.username,
          avatar_url: selected.avatar_url,
          role,
          permissions,
          notes: notes || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json() as { error: string };
        throw new Error(err.error);
      }
      onAdded();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filteredMembers = members.filter(m =>
    m.display_name.toLowerCase().includes(searchQ.toLowerCase()) ||
    m.username.toLowerCase().includes(searchQ.toLowerCase())
  );

  const modalStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
  };

  const boxStyle: React.CSSProperties = {
    background: 'rgba(15,12,31,0.98)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: '28px 28px 24px',
    width: 520,
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={modalStyle} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        style={boxStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {step === 'guild' ? '📡 Choose a Discord Server' : step === 'members' ? `👥 Pick a Member from ${selectedGuild?.name}` : `⚙️ Configure ${selected?.display_name}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Step {step === 'guild' ? 1 : step === 'members' ? 2 : 3} of 3
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          {(['guild', 'members', 'configure'] as const).map(s => (
            <div key={s} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: step === s ? 'var(--color-lavender)' :
                (step === 'members' && s === 'guild') || (step === 'configure') ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)', borderRadius: 10, fontSize: 13, color: '#fda4af', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Step 1 — Guild picker */}
        {step === 'guild' && (
          loadingGuilds ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
              Loading servers...
            </div>
          ) : guilds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
              No Discord servers found. Make sure the bot has been added to a server.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guilds.map(g => (
                <button
                  key={g.id}
                  onClick={() => loadMembers(g)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 12, cursor: 'pointer',
                    transition: 'all 0.15s', textAlign: 'left', color: 'var(--color-text)',
                  }}
                >
                  {g.icon_url
                    ? <img src={g.icon_url} alt={g.name} style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover' }} />
                    : <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#5b5bd6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}><Server size={18} /></div>
                  }
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</span>
                  <ChevronDown size={14} style={{ marginLeft: 'auto', transform: 'rotate(-90deg)', color: 'var(--color-text-muted)' }} />
                </button>
              ))}
            </div>
          )
        )}

        {/* Step 2 — Member picker */}
        {step === 'members' && (
          loadingMembers ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>Loading members...</div>
          ) : (
            <>
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  placeholder="Search members..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px 9px 34px',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: 'var(--color-text)', fontSize: 13,
                    outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {filteredMembers.map(m => (
                  <button
                    key={m.discord_user_id}
                    onClick={() => { setSelected(m); setStep('configure'); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      color: 'var(--color-text)', transition: 'all 0.15s',
                    }}
                  >
                    <Avatar url={m.avatar_url} name={m.display_name} size={34} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.display_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>@{m.username}</div>
                    </div>
                    <ChevronDown size={13} style={{ marginLeft: 'auto', transform: 'rotate(-90deg)', color: 'var(--color-text-muted)' }} />
                  </button>
                ))}
                {filteredMembers.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>No members found.</div>
                )}
              </div>
              <button className="btn btn-ghost" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} onClick={() => setStep('guild')}>
                ← Back to servers
              </button>
            </>
          )
        )}

        {/* Step 3 — Configure permissions */}
        {step === 'configure' && selected && (
          <>
            {/* Selected user preview */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: 12, marginBottom: 22,
            }}>
              <Avatar url={selected.avatar_url} name={selected.display_name} size={40} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{selected.username}</div>
              </div>
            </div>

            {/* Role */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Relationship</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['contact', 'family', 'team'] as Role[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                      border: role === r ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      background: role === r ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
                      color: role === r ? 'var(--color-lavender)' : 'var(--color-text-muted)',
                      fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {ROLE_META[r].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>What can they ask Raven?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(Object.entries(PERMISSION_META) as [Permission, typeof PERMISSION_META[Permission]][]).map(([p, meta]) => {
                  const Icon = meta.icon;
                  return (
                    <button
                      key={p}
                      onClick={() => setPermissions(p)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                        border: permissions === p ? `1px solid ${meta.color}55` : '1px solid rgba(255,255,255,0.08)',
                        background: permissions === p ? `${meta.color}18` : 'rgba(255,255,255,0.03)',
                        transition: 'all 0.15s', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <Icon size={16} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: permissions === p ? meta.color : 'var(--color-text)' }}>{meta.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{meta.desc}</div>
                      </div>
                      {permissions === p && <Check size={14} style={{ marginLeft: 'auto', color: meta.color, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Notes (optional)</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Business partner, let them ask about project timelines"
                rows={2}
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10, color: 'var(--color-text)', fontSize: 13,
                  outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setStep('members')} style={{ flex: 1, justifyContent: 'center' }}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2, justifyContent: 'center' }}>
                {saving ? 'Authorizing...' : `✓ Authorize ${selected.display_name}`}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ─── Edit-in-place permissions ──────────────────────────────────── */
function PermissionPill({
  contact,
  onUpdate,
}: {
  contact: Contact;
  onUpdate: (id: string, updates: Partial<Contact>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const meta = PERMISSION_META[contact.permissions];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 100,
          background: `${meta.color}20`, border: `1px solid ${meta.color}44`,
          color: meta.color, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'var(--font-sans)', letterSpacing: '0.04em',
        }}
      >
        {meta.label}
        <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
              background: 'rgba(15,12,31,0.98)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 12, padding: 8, minWidth: 180,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            {(Object.entries(PERMISSION_META) as [Permission, typeof PERMISSION_META[Permission]][]).map(([p, m]) => (
              <button
                key={p}
                onClick={async () => { setOpen(false); await onUpdate(contact.id, { permissions: p }); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  background: contact.permissions === p ? `${m.color}18` : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: contact.permissions === p ? m.color : 'var(--color-text-muted)',
                  fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  transition: 'all 0.1s',
                }}
              >
                {contact.permissions === p && <Check size={12} />}
                {contact.permissions !== p && <div style={{ width: 12 }} />}
                {m.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main Screen ────────────────────────────────────────────────── */
export default function ContactsScreen() {
  const [contacts, setContacts]   = useState<Contact[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQ, setSearchQ]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/contacts');
      const data = await r.json() as Contact[];
      setContacts(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [sayingHello, setSayingHello] = useState<string | null>(null); // contact ID being greeted
  const [helloResult, setHelloResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const sayHello = async (contact: Contact) => {
    if (!contact.discord_user_id) return;
    setSayingHello(contact.id);
    setHelloResult(null);
    try {
      const r = await apiFetch(`/contacts/${contact.id}/say-hello`, { method: 'POST' });
      const d = await r.json() as { sent?: boolean; name?: string; error?: string };
      if (r.ok && d.sent) {
        setHelloResult({ id: contact.id, ok: true, msg: `Raven said hello to ${d.name ?? contact.name} on Discord!` });
      } else {
        setHelloResult({ id: contact.id, ok: false, msg: d.error ?? 'Failed to send greeting' });
      }
    } catch (e) {
      setHelloResult({ id: contact.id, ok: false, msg: (e as Error).message });
    } finally {
      setSayingHello(null);
      setTimeout(() => setHelloResult(null), 4000);
    }
  };

  const handleUpdate = async (id: string, updates: Partial<Contact>) => {
    try {
      await apiFetch(`/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch { /* silent */ }
  };

  const handleRemove = async (id: string) => {
    await handleUpdate(id, { active: false } as Partial<Contact>);
  };

  const filtered = contacts
    .filter(c => showInactive || c.active)
    .filter(c =>
      c.name.toLowerCase().includes(searchQ.toLowerCase()) ||
      (c.username ?? '').toLowerCase().includes(searchQ.toLowerCase())
    );

  const active   = filtered.filter(c => c.active);
  const inactive = filtered.filter(c => !c.active);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}
      >
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', marginBottom: 4 }}>Trusted Contacts</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 480 }}>
            People you've authorized to message Raven on Discord. They get a sandboxed experience — no access to your private data.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load} aria-label="Refresh" style={{ gap: 6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ gap: 6 }}>
            <Plus size={14} /> Add Contact
          </button>
        </div>
      </motion.div>

      {/* How it works banner */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
        style={{
          padding: '14px 18px', marginBottom: 24,
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: 14, fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.65,
        }}
      >
        <span style={{ color: 'var(--color-lavender)', fontWeight: 700 }}>🛡️ How it works: </span>
        When a trusted contact messages Raven on Discord, she responds with a <strong>sandboxed</strong> version of herself — helpful and conversational, but completely private. She <strong>never</strong> shares your goals, feelings, health data, or anything personal unless you've given them Full Access.
      </motion.div>

      {/* Search */}
      {contacts.length > 3 && (
        <div style={{ position: 'relative', marginBottom: 20, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            placeholder="Search contacts..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px 9px 34px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, color: 'var(--color-text)', fontSize: 13,
              outline: 'none', fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
          Loading contacts...
        </div>
      ) : active.length === 0 && !showInactive ? (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', padding: '64px 0' }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, #4338ca, #6d28d9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 32,
            boxShadow: '0 0 40px rgba(99,102,241,0.3)',
          }}>
            <Users size={32} style={{ color: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>No contacts yet</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 320, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Add someone from your Discord server and Raven will be able to talk to them in a sandboxed, private mode.
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ gap: 8 }}>
            <Plus size={14} /> Add Your First Contact
          </button>
        </motion.div>
      ) : (
        <>
          {/* Stats strip */}
          {active.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
              style={{ display: 'flex', gap: 12, marginBottom: 22 }}
            >
              {[
                { label: 'Total authorized', value: active.length },
                { label: 'Chat only', value: active.filter(c => c.permissions === 'chat_only').length },
                { label: 'Updates', value: active.filter(c => c.permissions === 'updates').length },
                { label: 'Full access', value: active.filter(c => c.permissions === 'full').length },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, padding: '14px 16px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #fff 50%, var(--color-lavender))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Contact cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AnimatePresence>
              {active.map((c, i) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '16px 18px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 16, transition: 'border-color 0.2s',
                  }}
                >
                  <Avatar url={c.avatar_url} name={c.name} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                        background: ROLE_META[c.role].color, color: 'var(--color-text)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {ROLE_META[c.role].label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {c.username && <span>@{c.username}</span>}
                      {c.discord_user_id && <span style={{ opacity: 0.5 }}>· Discord</span>}
                      {c.last_active_at && <span>· Active {timeAgo(c.last_active_at)}</span>}
                    </div>
                    {c.notes && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 4, fontStyle: 'italic' }}>{c.notes}</div>
                    )}
                  </div>

                  <PermissionPill contact={c} onUpdate={handleUpdate} />

                  {/* Say Hello button — only if contact has Discord */}
                  {c.discord_user_id && (
                    <button
                      onClick={() => sayHello(c)}
                      disabled={sayingHello === c.id}
                      aria-label={`Say hello to ${c.name}`}
                      title="Raven introduces herself via Discord DM"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px',
                        background: sayingHello === c.id ? 'rgba(52,211,153,0.08)' : 'rgba(52,211,153,0.1)',
                        border: '1px solid rgba(52,211,153,0.25)',
                        borderRadius: 8, cursor: sayingHello === c.id ? 'wait' : 'pointer',
                        color: '#34d399', fontSize: 11, fontWeight: 600,
                        fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                        transition: 'all 0.15s',
                        opacity: sayingHello === c.id ? 0.7 : 1,
                      }}
                      onMouseEnter={e => { if (sayingHello !== c.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.1)'; }}
                      id={`say-hello-${c.id}`}
                    >
                      <Hand size={11} />
                      {sayingHello === c.id ? 'Saying hi...' : 'Say Hello'}
                    </button>
                  )}

                  <button
                    onClick={() => handleRemove(c.id)}
                    aria-label={`Remove ${c.name}`}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-subtle)', padding: 6, borderRadius: 8,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#fb7185')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-subtle)')}
                  >
                    <Trash2 size={15} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Inactive toggle */}
          {inactive.length > 0 && (
            <button
              onClick={() => setShowInactive(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 20, background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)',
              }}
            >
              <ChevronDown size={13} style={{ transform: showInactive ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              {showInactive ? 'Hide' : 'Show'} {inactive.length} removed contact{inactive.length !== 1 ? 's' : ''}
            </button>
          )}

          {showInactive && inactive.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 18px', marginTop: 8,
              background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.07)',
              borderRadius: 14, opacity: 0.6,
            }}>
              <Avatar url={c.avatar_url} name={c.name} size={38} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, textDecoration: 'line-through', color: 'var(--color-text-muted)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>Removed</div>
              </div>
              <button
                onClick={() => handleUpdate(c.id, { active: true } as Partial<Contact>)}
                className="btn btn-ghost"
                style={{ fontSize: 12, gap: 5 }}
              >
                <Plus size={11} /> Re-authorize
              </button>
            </div>
          ))}
        </>
      )}

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && (
          <AddContactModal
            onClose={() => setShowAdd(false)}
            onAdded={load}
          />
        )}
      </AnimatePresence>

      {/* Say Hello result toast */}
      <AnimatePresence>
        {helloResult && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
              padding: '12px 18px', borderRadius: 12, maxWidth: 320,
              background: helloResult.ok ? 'rgba(16,40,30,0.96)' : 'rgba(40,16,18,0.96)',
              border: `1px solid ${helloResult.ok ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
              color: helloResult.ok ? '#34d399' : '#f87171',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(12px)',
            }}
            role="alert"
          >
            {helloResult.ok ? '👋 ' : '⚠️ '}{helloResult.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
