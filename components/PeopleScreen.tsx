'use client';

/**
 * PeopleScreen — Personal CRM (merged with Trusted Contacts)
 *
 * Raven knows the important people in your life:
 *  - Syncs automatically from Discord guilds
 *  - Tracks relationship type, birthday, contact info
 *  - Logs Raven's intel notes on each person
 *  - Can message authorized people directly via Discord
 *  - Trust access: mark who can message Raven, with permission levels
 *  - Privacy-first: Raven never shares your data without authorization
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Trash2, Edit3, Check, X, Cake,
  Phone, Mail, RefreshCw, MessageSquare, Shield,
  ShieldOff, ChevronDown, ChevronUp, Send, StickyNote,
  Search, Wifi, Lock, Unlock, Star, Server, Hand,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/* ── Types ─────────────────────────────────────────────────── */

type Permission  = 'chat_only' | 'updates' | 'full';
type AccessRole  = 'contact' | 'family' | 'team';

interface Person {
  id: string;
  name: string;
  relationship_type: string | null;
  birthday: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  raven_notes: string | null;
  discord_user_id: string | null;
  discord_username: string | null;
  discord_avatar_url: string | null;
  telegram_user_id: string | null;
  can_raven_contact: boolean;
  trusted_contact: boolean;
  permission: Permission;
  access_role: AccessRole;
  active: boolean;
  last_active_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
}

interface ContactNote {
  id: string;
  note: string;
  source: string;
  created_at: string;
}

interface Guild {
  id: string;
  name: string;
  icon_url: string | null;
}

interface GuildMember {
  discord_user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

/* ── Constants ──────────────────────────────────────────────── */

const RELATIONSHIP_TYPES = [
  'friend', 'family', 'partner', 'colleague',
  'mentor', 'client', 'acquaintance', 'employee', 'manager', 'other',
];

const PERMISSION_META: Record<Permission, { label: string; desc: string; color: string }> = {
  chat_only: { label: 'Chat Only',   desc: 'Can talk to Raven. No Ash data shared.',       color: '#a78bfa' },
  updates:   { label: 'Updates',     desc: 'Can receive project updates Ash shares.',       color: '#fbbf24' },
  full:      { label: 'Full Access', desc: 'Treated like Ash. Close trust only.',           color: '#34d399' },
};

const ACCESS_ROLE_META: Record<AccessRole, { label: string; color: string }> = {
  contact: { label: 'Contact', color: 'rgba(167,139,250,0.2)' },
  family:  { label: 'Family',  color: 'rgba(251,113,133,0.2)' },
  team:    { label: 'Team',    color: 'rgba(52,211,153,0.2)'  },
};

const REL_COLORS: Record<string, string> = {
  friend:       'rgba(167,139,250,0.2)',
  family:       'rgba(251,113,133,0.2)',
  partner:      'rgba(244,63,94,0.2)',
  colleague:    'rgba(99,102,241,0.2)',
  mentor:       'rgba(251,191,36,0.2)',
  client:       'rgba(52,211,153,0.2)',
  acquaintance: 'rgba(255,255,255,0.08)',
  employee:     'rgba(34,211,238,0.2)',
  manager:      'rgba(249,115,22,0.2)',
  other:        'rgba(255,255,255,0.06)',
};

const REL_TEXT: Record<string, string> = {
  friend:       '#a78bfa',
  family:       '#fb7185',
  partner:      '#f43f5e',
  colleague:    '#818cf8',
  mentor:       '#fbbf24',
  client:       '#34d399',
  acquaintance: 'rgba(255,255,255,0.5)',
  employee:     '#22d3ee',
  manager:      '#f97316',
  other:        'rgba(255,255,255,0.35)',
};

/* ── Helpers ────────────────────────────────────────────────── */

function formatBirthday(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

/* ── Avatar ─────────────────────────────────────────────────── */

function Avatar({ person, size = 44 }: { person: Person; size?: number }) {
  const [imgErr, setImgErr] = useState(false);

  if (person.discord_avatar_url && !imgErr) {
    return (
      <img
        src={person.discord_avatar_url}
        alt={person.name}
        width={size}
        height={size}
        onError={() => setImgErr(true)}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(99,102,241,0.4)' }}
      />
    );
  }

  const initials = person.name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = [...person.name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, hsl(${hue},65%,30%), hsl(${(hue + 60) % 360},55%,45%))`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, color: '#fff', flexShrink: 0,
      border: '2px solid rgba(255,255,255,0.08)',
    }}>
      {initials}
    </div>
  );
}

/* ── Message Modal ──────────────────────────────────────────── */

function MessageModal({ person, onClose }: { person: Person; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!msg.trim()) return;
    setSending(true); setError('');
    try {
      await apiFetch(`/people/${person.id}/message`, { method: 'POST', body: JSON.stringify({ message: msg.trim() }) });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(15,15,25,0.98)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Avatar person={person} size={40} />
          <div>
            <div style={{ color: '#fff', fontWeight: 600 }}>Message {person.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>via Discord as Raven</div>
          </div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', color: '#34d399', padding: '20px 0', fontSize: 15 }}>
            ✅ Message sent!
          </div>
        ) : (
          <>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder={`Write a message to ${person.name}...`}
              rows={4}
              autoFocus
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={send} disabled={!msg.trim() || sending} style={{ flex: 2, padding: '10px 0', background: sending ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, color: '#fff', cursor: msg.trim() && !sending ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Send size={14} /> {sending ? 'Sending...' : 'Send as Raven'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ── Person Modal (Add/Edit) ────────────────────────────────── */

function PersonModal({ initial, onClose, onSaved }: {
  initial?: Person;
  onClose: () => void;
  onSaved: (p: Person) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    relationship_type: initial?.relationship_type ?? '',
    birthday: initial?.birthday ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    notes: initial?.notes ?? '',
    discord_username: initial?.discord_username ?? '',
    discord_user_id: initial?.discord_user_id ?? '',
    telegram_user_id: initial?.telegram_user_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        name: form.name.trim(),
        relationship_type: form.relationship_type || null,
        birthday: form.birthday || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        discord_username: form.discord_username.trim() || null,
        discord_user_id: form.discord_user_id.trim() || null,
        telegram_user_id: form.telegram_user_id.trim() || null,
      };
      const res = initial
        ? await apiFetch(`/people/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/people', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json().catch(() => ({})) as { error?: string }; throw new Error(err.error ?? `HTTP ${res.status}`); }
      const p: Person = await res.json() as Person;

      onSaved(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '10px 13px', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}
    >
      <motion.div initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(12,12,20,0.99)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 22, padding: 28, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 48px 96px rgba(0,0,0,0.7)' }}
      >
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 22 }}>
          {initial ? `Edit ${initial.name}` : 'Add Person'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <input placeholder="Full name *" value={form.name} onChange={field('name')} style={inputStyle} />

          <select value={form.relationship_type} onChange={field('relationship_type')} style={{ ...inputStyle, appearance: 'none' }}>
            <option value="">Relationship type...</option>
            {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>

          <input type="date" placeholder="Birthday (optional)" value={form.birthday} onChange={field('birthday')} style={inputStyle} />
          <input placeholder="Email" value={form.email} onChange={field('email')} style={inputStyle} />
          <input placeholder="Phone" value={form.phone} onChange={field('phone')} style={inputStyle} />

          <div style={{ border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 14px', background: 'rgba(99,102,241,0.06)' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Discord</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Username" value={form.discord_username} onChange={field('discord_username')} style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="User ID (snowflake)" value={form.discord_user_id} onChange={field('discord_user_id')} style={{ ...inputStyle, flex: 1 }} />
            </div>
          </div>

          <div style={{ border: '1px solid rgba(52,211,153,0.15)', borderRadius: 10, padding: '10px 14px', background: 'rgba(52,211,153,0.04)' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Telegram</div>
            <input placeholder="Telegram User ID (optional)" value={form.telegram_user_id} onChange={field('telegram_user_id')} style={inputStyle} />
          </div>

          <textarea placeholder="Notes about this person..." value={form.notes} onChange={field('notes')} rows={3}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14 }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: '10px 0', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {saving ? 'Saving...' : initial ? 'Save Changes' : 'Add Person'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Person Card ─────────────────────────────────────────────── */

function PersonCard({
  person, onEdit, onDelete, onToggleContact, onTrustChange, onMessage,
}: {
  person: Person;
  onEdit: () => void;
  onDelete: () => void;
  onToggleContact: () => void;
  onTrustChange: (updates: Partial<Person>) => void;
  onMessage: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const relColor = REL_COLORS[person.relationship_type ?? 'other'];
  const relText = REL_TEXT[person.relationship_type ?? 'other'];

  async function loadNotes() {
    if (notes.length > 0) return;
    setLoadingNotes(true);
    try {
      const res = await apiFetch(`/people/${person.id}/notes`);
      const data: ContactNote[] = await res.json() as ContactNote[];
      setNotes(data);
    } catch { /* ignore */ }
    setLoadingNotes(false);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const noteRes = await apiFetch(`/people/${person.id}/notes`, { method: 'POST', body: JSON.stringify({ note: newNote.trim(), source: 'manual' }) });
      const note = await noteRes.json() as ContactNote;
      setNotes(prev => [note, ...prev]);
      setNewNote('');
    } catch { /* ignore */ }
    setAddingNote(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      style={{
        background: `linear-gradient(135deg, ${relColor}, rgba(255,255,255,0.02))`,
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      {/* Main row */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar person={person} size={48} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{person.name}</span>
            {person.relationship_type && (
              <span style={{ background: relColor, color: relText, fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${relText}33` }}>
                {person.relationship_type}
              </span>
            )}
            {person.discord_username && (
              <span style={{ background: 'rgba(88,101,242,0.2)', color: '#7289da', fontSize: 11, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(88,101,242,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Wifi size={10} /> @{person.discord_username}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            {person.birthday && (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Cake size={11} /> {formatBirthday(person.birthday)}
              </span>
            )}
            {person.email && (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Mail size={11} /> {person.email}
              </span>
            )}
            {person.phone && (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={11} /> {person.phone}
              </span>
            )}
            {person.last_contacted_at && (
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                Last: {timeAgo(person.last_contacted_at)}
              </span>
            )}
          </div>
        </div>

          {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {/* Trust toggle */}
          <button
            onClick={async () => {
              const res = await apiFetch(`/people/${person.id}`, { method: 'PATCH', body: JSON.stringify({ trusted_contact: !person.trusted_contact }) });
              const updated = await res.json() as Person;
              onTrustChange(updated);
            }}
            title={person.trusted_contact ? 'Trusted — can message Raven (click to revoke)' : 'Grant access to message Raven'}
            style={{ background: person.trusted_contact ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${person.trusted_contact ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: person.trusted_contact ? '#fbbf24' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center' }}
          >
            {person.trusted_contact ? <Lock size={14} /> : <Unlock size={14} />}
          </button>

          {/* Outreach toggle */}
          <button
            onClick={onToggleContact}
            title={person.can_raven_contact ? 'Raven can DM this person — click to revoke' : 'Allow Raven to DM this person'}
            style={{ background: person.can_raven_contact ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${person.can_raven_contact ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: person.can_raven_contact ? '#34d399' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center' }}
          >
            {person.can_raven_contact ? <Shield size={14} /> : <ShieldOff size={14} />}
          </button>

          {/* Message button */}
          {person.discord_user_id && person.can_raven_contact && (
            <button onClick={onMessage} title="Send Discord message as Raven"
              style={{ background: 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.35)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#7289da', display: 'flex', alignItems: 'center' }}>
              <MessageSquare size={14} />
            </button>
          )}

          <button onClick={onEdit} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}>
            <Edit3 size={14} />
          </button>

          <button onClick={() => { setExpanded(e => !e); if (!expanded) loadNotes(); }}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button onClick={onDelete} style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#f87171', display: 'flex', alignItems: 'center' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}
          >
            <div style={{ padding: '14px 20px 18px' }}>

              {/* Trust access section */}
              {person.trusted_contact && (
                <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ color: '#fbbf24', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={11} /> Raven Access
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Permission level */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['chat_only', 'updates', 'full'] as Permission[]).map(p => {
                        const m = PERMISSION_META[p];
                        const active = person.permission === p;
                        return (
                          <button key={p} onClick={async () => {
                            const res = await apiFetch(`/people/${person.id}`, { method: 'PATCH', body: JSON.stringify({ permission: p }) });
                            const u = await res.json() as Person;
                            onTrustChange(u);
                          }}
                            title={m.desc}
                            style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? m.color : 'rgba(255,255,255,0.1)'}`, background: active ? `${m.color}22` : 'transparent', color: active ? m.color : 'rgba(255,255,255,0.4)' }}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Access role */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['contact', 'family', 'team'] as AccessRole[]).map(r => {
                        const m = ACCESS_ROLE_META[r];
                        const active = person.access_role === r;
                        return (
                          <button key={r} onClick={async () => {
                            const res = await apiFetch(`/people/${person.id}`, { method: 'PATCH', body: JSON.stringify({ access_role: r }) });
                            const u = await res.json() as Person;
                            onTrustChange(u);
                          }}
                            style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`, background: active ? m.color : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.35)' }}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Say hello */}
                    {person.discord_user_id && (
                      <button onClick={async () => {
                        await apiFetch(`/people/${person.id}/say-hello`, { method: 'POST' });
                      }}
                        style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(88,101,242,0.4)', background: 'rgba(88,101,242,0.12)', color: '#7289da', display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Raven sends intro DM on Discord"
                      >
                        <Hand size={11} /> Say Hello
                      </button>
                    )}
                    {person.last_active_at && (
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Last active {timeAgo(person.last_active_at)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Raven's summary notes */}
              {person.raven_notes && (
                <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <div style={{ color: '#818cf8', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>🦅 Raven's Summary</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.6 }}>{person.raven_notes}</div>
                </div>
              )}

              {/* Notes from Ash */}
              {person.notes && (
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.6, marginBottom: 14, padding: '0 2px' }}>
                  {person.notes}
                </div>
              )}

              {/* Intel log */}
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <StickyNote size={11} /> Intel Log
              </div>

              {loadingNotes ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {notes.length === 0 && <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>No intel notes yet.</div>}
                  {notes.map(n => (
                    <div key={n.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.5 }}>{n.note}</div>
                      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 4 }}>
                        {n.source === 'raven_outreach' ? '🦅 Raven outreach' : n.source === 'raven_observation' ? '🦅 Raven' : '✏️ Manual'} · {timeAgo(n.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add note */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Add a note about this person..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote()}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={addNote} disabled={!newNote.trim() || addingNote}
                  style={{ background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: '#818cf8', display: 'flex', alignItems: 'center' }}>
                  <Check size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Guild Picker Modal ────────────────────────────────────────── */

function GuildPickerModal({ onClose, onImport }: {
  onClose: () => void;
  onImport: (member: GuildMember) => Promise<void>;
}) {
  const [step, setStep]                     = useState<'guild' | 'members'>('guild');
  const [guilds, setGuilds]                 = useState<Guild[]>([]);
  const [members, setMembers]               = useState<GuildMember[]>([]);
  const [selectedGuild, setSelectedGuild]   = useState<Guild | null>(null);
  const [loadingGuilds, setLoadingGuilds]   = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [importing, setImporting]           = useState<string | null>(null);
  const [search, setSearch]                 = useState('');
  const [error, setError]                   = useState('');

  useEffect(() => {
    apiFetch('/people/discord/guilds')
      .then(r => r.json() as Promise<Guild[]>)
      .then(data => { setGuilds(data); setLoadingGuilds(false); })
      .catch(() => { setError('Could not load Discord servers.'); setLoadingGuilds(false); });
  }, []);

  async function loadMembers(guild: Guild) {
    setSelectedGuild(guild);
    setLoadingMembers(true);
    setStep('members');
    try {
      const r = await apiFetch(`/people/discord/guilds/${guild.id}/members`);
      const data = await r.json() as GuildMember[];
      setMembers(data);
    } catch { setError('Could not load members.'); }
    setLoadingMembers(false);
  }

  const filtered = members.filter(m =>
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    m.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}
    >
      <motion.div initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(12,12,20,0.99)', border: '1px solid rgba(88,101,242,0.3)', borderRadius: 22, padding: 28, width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 48px 96px rgba(0,0,0,0.7)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Server size={16} style={{ color: '#7289da' }} />
            {step === 'guild' ? 'Pick a Server' : selectedGuild?.name}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 'members' && (
              <button onClick={() => { setStep('guild'); setSearch(''); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 12px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12 }}>← Back</button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {step === 'guild' && (
          loadingGuilds ? <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 30 }}>Loading servers...</div>
          : guilds.length === 0 ? <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 30 }}>No servers found.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guilds.map(g => (
                <button key={g.id} onClick={() => loadMembers(g)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}>
                  {g.icon_url
                    ? <img src={g.icon_url} alt={g.name} width={32} height={32} style={{ borderRadius: '50%' }} />
                    : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(88,101,242,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Server size={14} style={{ color: '#7289da' }} /></div>
                  }
                  <span style={{ color: '#fff', fontWeight: 500, fontSize: 14 }}>{g.name}</span>
                </button>
              ))}
            </div>
        )}

        {step === 'members' && (
          <>
            <input placeholder="Search members..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 12 }}
            />
            {loadingMembers ? <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 30 }}>Loading members...</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.map(m => (
                  <div key={m.discord_user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt={m.display_name} width={28} height={28} style={{ borderRadius: '50%' }} />
                      : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(88,101,242,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#7289da', fontWeight: 700 }}>{m.display_name[0]}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#fff', fontWeight: 500, fontSize: 13 }}>{m.display_name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>@{m.username}</div>
                    </div>
                    <button
                      onClick={async () => { setImporting(m.discord_user_id); await onImport(m); setImporting(null); }}
                      disabled={importing === m.discord_user_id}
                      style={{ padding: '5px 12px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {importing === m.discord_user_id ? '...' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            }
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ── Main Screen ─────────────────────────────────────────────── */

export default function PeopleScreen() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [search, setSearch] = useState('');
  const [filterRel, setFilterRel] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showGuildPicker, setShowGuildPicker] = useState(false);
  const [editing, setEditing] = useState<Person | undefined>();
  const [messagingPerson, setMessagingPerson] = useState<Person | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/people');
      const data: Person[] = await res.json() as Person[];
      setPeople(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function syncDiscord() {
    setSyncing(true); setSyncResult('');
    try {
      const res = await apiFetch('/people/sync/discord', { method: 'POST' });
      const result = await res.json() as { message?: string; imported: number; updated: number };
      setSyncResult(result.message ?? `Imported ${result.imported}, updated ${result.updated}`);
      await load();
    } catch (e) {
      setSyncResult(`Sync failed: ${(e as Error).message}`);
    }
    setSyncing(false);
  }

  async function deletePerson(id: string) {
    if (!confirm('Remove this person from Raven\'s CRM?')) return;
    await apiFetch(`/people/${id}`, { method: 'DELETE' });
    setPeople(p => p.filter(x => x.id !== id));
  }

  async function toggleContact(person: Person) {
    const res = await apiFetch(`/people/${person.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ can_raven_contact: !person.can_raven_contact }),
    });
    const updated = await res.json() as Person;
    setPeople(p => p.map(x => x.id === person.id ? { ...x, ...updated } : x));
  }

  function onSaved(p: Person) {
    setPeople(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      if (idx >= 0) { const a = [...prev]; a[idx] = p; return a; }
      return [p, ...prev];
    });
    setShowModal(false);
    setEditing(undefined);
  }

  const filtered = people.filter(p => {
    const q = search.toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !(p.discord_username ?? '').toLowerCase().includes(q)) return false;
    if (filterRel && p.relationship_type !== filterRel) return false;
    return true;
  });

  const discordLinked = people.filter(p => p.discord_user_id).length;
  const authorized = people.filter(p => p.can_raven_contact).length;

  return (
    <div style={{ padding: '28px 20px', maxWidth: 740, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 22, margin: 0 }}>People</h2>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
              {people.length} contacts · {discordLinked} on Discord · {authorized} Raven can contact
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowGuildPicker(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.3)', borderRadius: 10, color: '#7289da', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              <Server size={14} /> Browse Members
            </button>
            <button
              onClick={syncDiscord}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: syncing ? 'rgba(88,101,242,0.2)' : 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.4)', borderRadius: 10, color: syncing ? 'rgba(114,137,218,0.6)' : '#7289da', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              <RefreshCw size={14} className={syncing ? 'spinning' : ''} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Syncing...' : 'Sync Discord'}
            </button>
            <button
              onClick={() => { setEditing(undefined); setShowModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              <Plus size={14} /> Add Person
            </button>
          </div>
        </div>

        {/* Sync result */}
        <AnimatePresence>
          {syncResult && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 10, color: '#34d399', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {syncResult}
              <button onClick={() => setSyncResult('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#34d399', lineHeight: 1 }}>
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            placeholder="Search people..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
        <select value={filterRel} onChange={e => setFilterRel(e.target.value)}
          style={{ padding: '9px 13px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: filterRel ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 13, outline: 'none', cursor: 'pointer', appearance: 'none' }}>
          <option value="">All relationships</option>
          {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>

      {/* Privacy legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          <Shield size={12} style={{ color: '#34d399' }} /> Raven can contact
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          <ShieldOff size={12} style={{ color: 'rgba(255,255,255,0.25)' }} /> Contact off (Raven only observes)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          <MessageSquare size={12} style={{ color: '#7289da' }} /> Send Discord DM as Raven
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 60 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', padding: 60 }}>
          {search || filterRel ? 'No people match your filters.' : 'No people yet. Click "Sync Discord" to auto-import from your servers, or add someone manually.'}
        </div>
      ) : (
        <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <AnimatePresence>
            {filtered.map(p => (
              <PersonCard
                key={p.id}
                person={p}
                onEdit={() => { setEditing(p); setShowModal(true); }}
                onDelete={() => deletePerson(p.id)}
                onToggleContact={() => toggleContact(p)}
                onTrustChange={(updated) => setPeople(prev => prev.map(x => x.id === p.id ? { ...x, ...updated } : x))}
                onMessage={() => setMessagingPerson(p)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showModal && (
          <PersonModal
            initial={editing}
            onClose={() => { setShowModal(false); setEditing(undefined); }}
            onSaved={onSaved}
          />
        )}
        {messagingPerson && (
          <MessageModal
            person={messagingPerson}
            onClose={() => setMessagingPerson(undefined)}
          />
        )}
        {showGuildPicker && (
          <GuildPickerModal
            onClose={() => setShowGuildPicker(false)}
            onImport={async (member) => {
              // Upsert into people: if discord_user_id already exists, skip; else create
              const existing = people.find(p => p.discord_user_id === member.discord_user_id);
              if (existing) return; // already in the list
              const res = await apiFetch('/people', {
                method: 'POST',
                body: JSON.stringify({
                  name: member.display_name,
                  discord_user_id: member.discord_user_id,
                  discord_username: member.username,
                  discord_avatar_url: member.avatar_url,
                }),
              });
              if (res.ok) {
                const created = await res.json() as Person;
                setPeople(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
