'use client';

/**
 * Settings — the fifth screen.
 *
 * The calendar section is the reason this screen exists, and its shape follows a
 * specific constraint: Ash's personal calendar and the Leaps & Rebounds calendar
 * must never sit behind one credential. Two things enforce that, and the UI has
 * to make both visible or the guarantee is just a promise:
 *
 *   1. Raven has her OWN Google OAuth client, separate from anything the business
 *      uses. The connected account's email is shown at all times so "connected"
 *      is falsifiable at a glance.
 *   2. Connecting is not consent to read. Every calendar in the account arrives
 *      DISABLED and Ash ticks the ones she may see — because a personal Google
 *      account almost always has work calendars subscribed into it, and no OAuth
 *      scope is granular enough to exclude them.
 *
 * So the honest state right after connecting is "connected, reading nothing", and
 * the screen says exactly that rather than showing a reassuring green dot.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar, Check, X, RefreshCw, Unlink, AlertTriangle, Cpu,
  DollarSign, Pause, Play, Ban, ScrollText, Lock, ExternalLink, Info,
  Link2, Trash2, Plus,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

// ── Types mirroring GET /settings ────────────────────────────────────────────

interface CalendarRow {
  calendar_id: string;
  summary: string | null;
  description: string | null;
  is_primary: boolean;
  access_role: string | null;
  enabled: boolean;
}

interface ModelOption {
  id: string;
  label: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: string;
  note: string;
}

interface UsageBucket { calls: number; input: number; output: number; cost: number }
interface UsageRow extends UsageBucket { key: string }

interface Usage {
  available: boolean;
  reason?: string;
  today?: UsageBucket;
  week?: UsageBucket;
  month?: UsageBucket;
  projected_month?: number;
  by_source?: UsageRow[];
  by_model?: UsageRow[];
  truncated?: boolean;
}

interface Retraction {
  id: string;
  subject: string;
  kind: 'false' | 'closed';
  reason: string | null;
  fact_key: string | null;
  created_at: string;
}

interface Preference {
  id: string;
  key: string;
  value: string;
  scope: string;
  domain: string | null;
  rationale: string | null;
  confidence: number | null;
}

interface Feed {
  id: string;
  label: string;
  url_hint: string | null;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  last_event_count: number | null;
  created_at: string;
}

interface Settings {
  google: {
    client: { configured: boolean; missing: string[]; redirectUri: string | null };
    scopes: string[];
    account: {
      email: string | null;
      connected_at: string;
      last_used_at: string | null;
      last_error: string | null;
      has_refresh_token: boolean;
    } | null;
    calendars: CalendarRow[];
    readable: boolean;
    enabled_count: number;
  };
  feeds: { items: Feed[]; enabled_count: number };
  calendar_readable: boolean;
  llm: { current_model: string; options: ModelOption[]; usage: Usage };
  autonomy: {
    paused: boolean;
    daily_outreach_cap: number;
    unanswered_threshold: number;
    focus_weights: Record<string, number>;
  };
  memory: { retractions: Retraction[]; preferences: Preference[] };
}

// ── Small presentational helpers ─────────────────────────────────────────────

const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : '$0.00';

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k`
  : String(n);

function Section({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <motion.section layout className="glass" style={{ padding: 20 }}>
      <div className="section-title">{icon}{title}</div>
      {subtitle && (
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8, marginBottom: 16, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
      {children}
    </motion.section>
  );
}

function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'good'; children: React.ReactNode }) {
  const colors = {
    info: { border: 'var(--color-border)', bg: 'rgba(255,255,255,0.04)', fg: 'var(--color-text-muted)' },
    warn: { border: 'rgba(251,191,36,0.35)', bg: 'rgba(251,191,36,0.10)', fg: '#fcd34d' },
    good: { border: 'rgba(52,211,153,0.35)', bg: 'rgba(52,211,153,0.10)', fg: '#6ee7b7' },
  }[tone];
  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'flex-start',
      border: `1px solid ${colors.border}`, background: colors.bg,
      borderRadius: 'var(--radius-sm)', padding: '10px 13px',
      fontSize: 12.5, lineHeight: 1.55, color: colors.fg,
    }}>
      {tone === 'warn' ? <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        : tone === 'good' ? <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        : <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
      <div>{children}</div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      flex: '1 1 120px', minWidth: 110, padding: '12px 14px',
      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
    }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--color-text-subtle)' }}>
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3, fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** A checkbox that reads as a consent switch, because that is what it is. */
function Toggle({ on, onChange, disabled, label }: {
  on: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, flexShrink: 0, borderRadius: 100, position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        background: on ? 'var(--color-emerald)' : 'rgba(255,255,255,0.16)',
        border: '1px solid ' + (on ? 'var(--color-emerald)' : 'var(--color-border)'),
        transition: 'background .16s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#0b0a14',
        transition: 'left .16s ease',
      }} />
    </button>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  const [feedUrl, setFeedUrl] = useState('');
  const [feedLabel, setFeedLabel] = useState('');
  const [feedProbe, setFeedProbe] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/settings');
      if (!r.ok) throw new Error(`Settings unavailable (${r.status})`);
      setData(await r.json() as Settings);
    } catch (err) {
      setFlash({ tone: 'warn', text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The OAuth round trip comes back as query params on this page — the API
  // redirects here rather than rendering JSON at Ash.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get('google');
    if (!status) return;

    if (status === 'connected') {
      const email = q.get('email');
      const found = q.get('found');
      setFlash({
        tone: 'good',
        text: `Connected${email ? ` as ${email}` : ''}. ${found ?? 'Some'} calendar(s) found — `
            + `she can read none of them until you tick them below.`,
      });
    } else {
      setFlash({ tone: 'warn', text: q.get('reason') ?? 'Google connect failed.' });
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function act(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try { await fn(); } catch (err) {
      setFlash({ tone: 'warn', text: (err as Error).message });
    } finally { setBusy(null); }
  }

  async function connectGoogle() {
    await act('connect', async () => {
      const r = await apiFetch('/settings/google/authorize', { method: 'POST' });
      const body = await r.json() as { url?: string; error?: string; missing?: string[] };
      if (!r.ok || !body.url) {
        throw new Error(body.error ?? 'Could not start the Google connect flow.');
      }
      window.location.href = body.url;
    });
  }

  async function toggleCalendar(cal: CalendarRow, enabled: boolean) {
    await act(cal.calendar_id, async () => {
      const r = await apiFetch(`/settings/google/calendars/${encodeURIComponent(cal.calendar_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Update failed.');
      const body = await r.json() as { calendars: CalendarRow[]; enabled_count: number };
      setData(d => d && {
        ...d,
        google: {
          ...d.google,
          calendars: body.calendars,
          enabled_count: body.enabled_count,
          readable: Boolean(d.google.account?.has_refresh_token) && body.enabled_count > 0,
        },
      });
    });
  }

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!data) {
    return (
      <div style={{ paddingBottom: 48 }}>
        <Note tone="warn">
          Could not load settings. {flash?.text}
        </Note>
      </div>
    );
  }

  const { google, feeds, llm, autonomy, memory } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 56, maxWidth: 820 }}>
      {flash && (
        <Note tone={flash.tone}>{flash.text}</Note>
      )}

      {/* ── Calendar by secret link — the recommended route ────────────── */}
      <Section
        icon={<Link2 size={16} />}
        title="Calendar by secret link"
        subtitle="The quick route — no Google Cloud project, no consent screen, nothing to publish. Google Calendar gives each calendar its own private iCal address; paste your personal one and she can read that calendar and only that calendar."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {feeds.items.length === 0 && (
            <Note>
              <strong>Where to find it:</strong> open Google Calendar on the web → hover your
              personal calendar in the left list → ⋮ → <em>Settings and sharing</em> → scroll to{' '}
              <em>Integrate calendar</em> → copy <em>Secret address in iCal format</em>.
              <div style={{ marginTop: 6 }}>
                One address covers exactly one calendar, so there is no way for the Leaps &amp;
                Rebounds calendar to come along with it.
              </div>
            </Note>
          )}

          {feeds.items.map(feed => (
            <div
              key={feed.id}
              style={{
                display: 'flex', gap: 12, alignItems: 'center',
                padding: '11px 14px', borderRadius: 'var(--radius-sm)',
                background: feed.enabled ? 'rgba(52,211,153,0.07)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${feed.enabled ? 'rgba(52,211,153,0.28)' : 'var(--color-border)'}`,
              }}
            >
              <Toggle
                on={feed.enabled}
                disabled={busy === feed.id}
                label={`Let Raven read ${feed.label}`}
                onChange={next => act(feed.id, async () => {
                  const r = await apiFetch(`/settings/calendar-feeds/${feed.id}`, {
                    method: 'PATCH', body: JSON.stringify({ enabled: next }),
                  });
                  if (!r.ok) throw new Error('Could not update that calendar.');
                  const body = await r.json() as { feeds: Feed[] };
                  setData(d => d && {
                    ...d,
                    feeds: { items: body.feeds, enabled_count: body.feeds.filter(f => f.enabled).length },
                  });
                })}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{feed.label}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)' }}>
                  {feed.url_hint ?? 'secret address stored'}
                </div>
                {feed.last_error ? (
                  <div style={{ fontSize: 11.5, color: '#fcd34d', marginTop: 3 }}>
                    Last read failed: {feed.last_error}
                  </div>
                ) : feed.last_sync_at && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 3 }}>
                    {feed.last_event_count ?? 0} events · read {feed.last_sync_at.slice(0, 10)}
                  </div>
                )}
              </div>
              <button
                className="btn btn-ghost"
                disabled={busy === feed.id}
                title="Forget this address entirely"
                onClick={() => act(feed.id, async () => {
                  if (!window.confirm(`Remove "${feed.label}"? Raven forgets the address completely.`)) return;
                  const r = await apiFetch(`/settings/calendar-feeds/${feed.id}`, { method: 'DELETE' });
                  if (!r.ok) throw new Error('Could not remove that calendar.');
                  const body = await r.json() as { feeds: Feed[] };
                  setData(d => d && {
                    ...d,
                    feeds: { items: body.feeds, enabled_count: body.feeds.filter(f => f.enabled).length },
                  });
                })}
                style={{ padding: '5px 9px' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="password"
              placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
              value={feedUrl}
              onChange={e => { setFeedUrl(e.target.value); setFeedProbe(null); }}
              spellCheck={false}
              autoComplete="off"
              aria-label="Secret iCal address"
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: -3 }}>
              Masked as you type — this address is a password for that calendar. Stored encrypted,
              and never shown back to you in full.
            </div>
            <input
              type="text"
              placeholder="Label (optional) — e.g. Personal"
              value={feedLabel}
              onChange={e => setFeedLabel(e.target.value)}
            />

            {feedProbe && (
              <Note tone={feedProbe.ok ? 'good' : 'warn'}>{feedProbe.text}</Note>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-ghost"
                disabled={!feedUrl.trim() || busy === 'test-feed'}
                onClick={() => act('test-feed', async () => {
                  setFeedProbe(null);
                  const r = await apiFetch('/settings/calendar-feeds/test', {
                    method: 'POST', body: JSON.stringify({ url: feedUrl }),
                  });
                  const body = await r.json() as { ok: boolean; error?: string; eventCount?: number; calendarName?: string | null };
                  setFeedProbe(body.ok
                    ? { ok: true, text: `Reads fine — ${body.calendarName ?? 'calendar'}, ${body.eventCount ?? 0} events in the next 30 days.` }
                    : { ok: false, text: body.error ?? 'Could not read that address.' });
                })}
              >
                Test it
              </button>
              <button
                className="btn btn-primary"
                disabled={!feedUrl.trim() || busy === 'add-feed'}
                onClick={() => act('add-feed', async () => {
                  const r = await apiFetch('/settings/calendar-feeds', {
                    method: 'POST',
                    body: JSON.stringify({ url: feedUrl, label: feedLabel || undefined }),
                  });
                  const body = await r.json() as { error?: string; feeds?: Feed[]; feed?: Feed };
                  if (!r.ok || !body.feeds) throw new Error(body.error ?? 'Could not add that calendar.');
                  setData(d => d && {
                    ...d,
                    feeds: { items: body.feeds!, enabled_count: body.feeds!.filter(f => f.enabled).length },
                    calendar_readable: true,
                  });
                  setFeedUrl(''); setFeedLabel(''); setFeedProbe(null);
                  setFlash({ tone: 'good', text: `Connected "${body.feed?.label}". She can read that calendar now.` });
                })}
              >
                <Plus size={14} /> Add calendar
              </button>
              <a
                className="btn btn-ghost"
                href="https://calendar.google.com/calendar/r/settings"
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> Open Calendar settings
              </a>
            </div>
          </div>

          {!data.calendar_readable && (
            <Note tone="warn">
              She currently has <strong>no calendar access at all</strong> — by either route. She is
              told that explicitly, so she will not describe your day as clear.
            </Note>
          )}
        </div>
      </Section>

      {/* ── Calendar via full Google sign-in (the other route) ─────────── */}
      <Section
        icon={<Calendar size={16} />}
        title="Or: full Google sign-in"
        subtitle="The heavier route — needs a Google Cloud project of your own, and one calendar link above does the same job. Worth it only if you want her reading several calendars from one account. Her own OAuth client either way, never the one Leaps & Rebounds uses, read-only, and only the calendars you tick."
      >
        {!google.client.configured ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Note tone="warn">
              Not set up yet. Create an OAuth client in Google Cloud Console (a
              personal project, <strong>not</strong> the one Leaps &amp; Rebounds uses), then set
              these on raven-api:
              <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                {google.client.missing.map(v => (
                  <li key={v} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{v}</li>
                ))}
              </ul>
            </Note>
            {google.client.redirectUri && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Authorized redirect URI to register:
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11.5, marginTop: 5, padding: '8px 10px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-xs)', wordBreak: 'break-all',
                }}>
                  {google.client.redirectUri}
                </div>
              </div>
            )}
            <a
              className="btn btn-ghost"
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              style={{ alignSelf: 'flex-start', textDecoration: 'none' }}
            >
              <ExternalLink size={14} /> Google Cloud credentials
            </a>
          </div>
        ) : !google.account ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Note>
              Nothing connected. She has no visibility into your schedule at all — and she is
              told so explicitly, so she will not describe your day as clear.
            </Note>
            <button
              className="btn btn-primary"
              disabled={busy === 'connect'}
              onClick={connectGoogle}
              style={{ alignSelf: 'flex-start' }}
            >
              <Calendar size={14} /> Connect a Google account
            </button>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-subtle)' }}>
              Sign in with the account that holds your <em>personal</em> calendar. Read-only —
              she cannot create, move, or delete anything.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: google.readable ? 'var(--color-emerald)' : 'var(--color-gold)',
                boxShadow: `0 0 8px ${google.readable ? 'var(--color-emerald)' : 'var(--color-gold)'}`,
              }} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                {google.account.email ?? 'Connected account'}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-subtle)' }}>
                since {google.account.connected_at.slice(0, 10)}
              </span>
              <span className="chip" style={{ marginLeft: 'auto', fontSize: 11 }}>
                <Lock size={11} /> read-only
              </span>
            </div>

            {google.account.last_error && (
              <Note tone="warn">
                Last error from Google: {google.account.last_error} — reconnecting usually fixes it.
              </Note>
            )}

            {google.enabled_count === 0 ? (
              <Note tone="warn">
                <strong>She can read nothing yet.</strong> Connecting an account is not consent to
                read it — tick the calendars she may see. Anything left off is invisible to her,
                including work calendars shared into this account.
              </Note>
            ) : (
              <Note tone="good">
                She can read {google.enabled_count} of {google.calendars.length} calendar
                {google.calendars.length === 1 ? '' : 's'} in this account. The rest are invisible to her.
              </Note>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {google.calendars.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--color-text-subtle)' }}>
                  No calendars found in this account. Try refreshing the list.
                </div>
              )}
              {google.calendars.map(cal => {
                const shared = cal.access_role !== 'owner';
                return (
                  <div
                    key={cal.calendar_id}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'center',
                      padding: '11px 14px', borderRadius: 'var(--radius-sm)',
                      background: cal.enabled ? 'rgba(52,211,153,0.07)' : 'rgba(255,255,255,0.035)',
                      border: `1px solid ${cal.enabled ? 'rgba(52,211,153,0.28)' : 'var(--color-border)'}`,
                    }}
                  >
                    <Toggle
                      on={cal.enabled}
                      disabled={busy === cal.calendar_id}
                      label={`Let Raven read ${cal.summary ?? cal.calendar_id}`}
                      onChange={next => toggleCalendar(cal, next)}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                        {cal.summary ?? cal.calendar_id}
                        {cal.is_primary && (
                          <span className="chip" style={{ fontSize: 10 }}>primary</span>
                        )}
                        {shared && (
                          <span className="chip" style={{ fontSize: 10, color: '#fcd34d', borderColor: 'rgba(251,191,36,0.3)' }}>
                            shared · {cal.access_role ?? 'unknown'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cal.calendar_id}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {google.calendars.some(c => c.access_role !== 'owner') && (
              <Note tone="warn">
                Calendars marked <strong>shared</strong> are not yours — they were shared into this
                account. If one of these is the Leaps &amp; Rebounds calendar, leave it off.
              </Note>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-ghost"
                disabled={busy === 'refresh'}
                onClick={() => act('refresh', async () => {
                  const r = await apiFetch('/settings/google/calendars/refresh', { method: 'POST' });
                  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Refresh failed.');
                  await load();
                  setFlash({ tone: 'good', text: 'Calendar list refreshed. New calendars arrive switched off.' });
                })}
              >
                <RefreshCw size={14} /> Refresh list
              </button>
              <button
                className="btn btn-danger"
                disabled={busy === 'disconnect'}
                onClick={() => act('disconnect', async () => {
                  if (!window.confirm('Disconnect Google? This revokes Raven\'s access at Google and deletes her stored tokens.')) return;
                  const r = await apiFetch('/settings/google', { method: 'DELETE' });
                  if (!r.ok) throw new Error('Disconnect failed.');
                  const body = await r.json() as { revoked: boolean };
                  await load();
                  setFlash({
                    tone: 'good',
                    text: body.revoked
                      ? 'Disconnected and revoked at Google.'
                      : 'Disconnected locally. Revoke at Google failed — check myaccount.google.com/permissions.',
                  });
                })}
              >
                <Unlink size={14} /> Disconnect
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Model ──────────────────────────────────────────────────────── */}
      <Section
        icon={<Cpu size={16} />}
        title="Which model she runs on"
        subtitle="Applies to her chat replies, her autonomous work, and the daily plan. Background extraction stays on Haiku either way — it runs constantly and does not need to be smart."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {llm.options.map(m => {
            const active = m.id === llm.current_model;
            return (
              <button
                key={m.id}
                disabled={busy === m.id}
                onClick={() => act(m.id, async () => {
                  const r = await apiFetch('/settings/llm/model', {
                    method: 'PATCH', body: JSON.stringify({ model: m.id }),
                  });
                  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Could not change model.');
                  const body = await r.json() as { current_model: string };
                  setData(d => d && { ...d, llm: { ...d.llm, current_model: body.current_model } });
                  setFlash({ tone: 'good', text: `Raven is now running on ${m.label}.` });
                })}
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: '13px 15px',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--color-surface-active)' : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${active ? 'var(--color-border-glow)' : 'var(--color-border)'}`,
                  color: 'inherit', font: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: active ? 'var(--color-lavender)' : 'inherit' }}>
                    {m.label}
                  </span>
                  {active && <span className="chip" style={{ fontSize: 10 }}>current</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                    ${m.inputPrice}/${m.outputPrice} per M · {m.contextWindow}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  {m.note}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Usage ──────────────────────────────────────────────────────── */}
      <Section
        icon={<DollarSign size={16} />}
        title="What she costs"
        subtitle="Month to date, priced from token counts at current rates — not from figures stored at the time, which were written against a stale price table."
      >
        {!llm.usage.available ? (
          <Note tone="warn">Usage unavailable: {llm.usage.reason ?? 'unknown error'}</Note>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Stat label="Today" value={usd(llm.usage.today?.cost ?? 0)} sub={`${llm.usage.today?.calls ?? 0} calls`} />
              <Stat label="7 days" value={usd(llm.usage.week?.cost ?? 0)} sub={`${llm.usage.week?.calls ?? 0} calls`} />
              <Stat label="Month to date" value={usd(llm.usage.month?.cost ?? 0)} sub={`${compact(llm.usage.month?.output ?? 0)} out`} />
              <Stat label="Month, projected" value={usd(llm.usage.projected_month ?? 0)} sub="at this pace" />
            </div>

            {(llm.usage.by_source?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--color-text-subtle)', marginBottom: 7 }}>
                  Where it went
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {llm.usage.by_source!.slice(0, 8).map(row => (
                    <div key={row.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.key}
                      </span>
                      <span style={{ color: 'var(--color-text-subtle)', fontSize: 11 }}>{row.calls} calls</span>
                      <span style={{ fontFamily: 'var(--font-mono)', minWidth: 66, textAlign: 'right' }}>{usd(row.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(llm.usage.by_model?.length ?? 0) > 1 && (
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--color-text-subtle)', marginBottom: 7 }}>
                  By model
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {llm.usage.by_model!.map(row => (
                    <div key={row.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.key}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', minWidth: 66, textAlign: 'right' }}>{usd(row.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {llm.usage.truncated && (
              <Note tone="warn">
                Hit the 20,000-row read cap — the totals above are a floor, not the full month.
              </Note>
            )}
          </div>
        )}
      </Section>

      {/* ── Autonomy ───────────────────────────────────────────────────── */}
      <Section
        icon={autonomy.paused ? <Pause size={16} /> : <Play size={16} />}
        title="Autonomy"
        subtitle="The kill switch covers every scheduled job — research, the daily plan, the close-out, proactive messages. Chat keeps working either way."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Toggle
              on={!autonomy.paused}
              disabled={busy === 'autonomy'}
              label="Autonomous work enabled"
              onChange={next => act('autonomy', async () => {
                const r = await apiFetch('/settings/autonomy', {
                  method: 'PATCH', body: JSON.stringify({ paused: !next }),
                });
                if (!r.ok) throw new Error('Could not change autonomy.');
                const body = await r.json() as { autonomy: Settings['autonomy'] };
                setData(d => d && { ...d, autonomy: { ...d.autonomy, ...body.autonomy } });
              })}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {autonomy.paused ? 'Paused — she only responds when spoken to' : 'Running — she works unprompted'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-subtle)' }}>
                Scheduled jobs, the work runner, and proactive outreach.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              Messages to you per day, at most
            </label>
            <input
              type="number"
              min={2}
              max={8}
              defaultValue={autonomy.daily_outreach_cap}
              disabled={busy === 'cap'}
              onBlur={e => {
                const value = Number(e.target.value);
                if (value === autonomy.daily_outreach_cap) return;
                act('cap', async () => {
                  const r = await apiFetch('/settings/autonomy', {
                    method: 'PATCH', body: JSON.stringify({ daily_outreach_cap: value }),
                  });
                  if (!r.ok) throw new Error('Could not change the outreach cap.');
                  const body = await r.json() as { autonomy: Settings['autonomy'] };
                  setData(d => d && { ...d, autonomy: { ...d.autonomy, ...body.autonomy } });
                });
              }}
              style={{ width: 76 }}
            />
            <span style={{ fontSize: 11.5, color: 'var(--color-text-subtle)' }}>clamped 2–8</span>
          </div>
        </div>
      </Section>

      {/* ── Retractions ────────────────────────────────────────────────── */}
      <Section
        icon={<Ban size={16} />}
        title="Told to drop"
        subtitle="Things you told her were wrong, or to stop bringing up. These are in her prompt every turn as a do-not-raise list, and the background extractors cannot write them back."
      >
        {memory.retractions.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-subtle)' }}>
            Nothing retracted. When you tell her something is not true, or to drop it, it lands here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {memory.retractions.map(r => (
              <div key={r.id} style={{
                display: 'flex', gap: 11, alignItems: 'flex-start',
                padding: '10px 13px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.035)', border: '1px solid var(--color-border)',
              }}>
                <span className="chip" style={{
                  fontSize: 10, flexShrink: 0,
                  color: r.kind === 'closed' ? '#fcd34d' : 'var(--color-rose)',
                  borderColor: r.kind === 'closed' ? 'rgba(251,191,36,0.3)' : 'rgba(251,113,133,0.3)',
                }}>
                  {r.kind === 'closed' ? 'closed' : 'not true'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{r.subject}</div>
                  {r.reason && (
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-subtle)', marginTop: 2 }}>{r.reason}</div>
                  )}
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={busy === r.id}
                  title="Let her believe and raise this again"
                  onClick={() => act(r.id, async () => {
                    const res = await apiFetch(`/settings/retractions/${r.id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Could not lift that.');
                    setData(d => d && {
                      ...d,
                      memory: { ...d.memory, retractions: d.memory.retractions.filter(x => x.id !== r.id) },
                    });
                  })}
                  style={{ padding: '4px 9px', fontSize: 11 }}
                >
                  <X size={12} /> Lift
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Standing rules ─────────────────────────────────────────────── */}
      <Section
        icon={<ScrollText size={16} />}
        title="Standing rules"
        subtitle="Things you told her once that she should not need telling again. Retiring one keeps the record but stops her following it."
      >
        {memory.preferences.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-subtle)' }}>
            No standing rules yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {memory.preferences.map(p => (
              <div key={p.id} style={{
                display: 'flex', gap: 11, alignItems: 'flex-start',
                padding: '10px 13px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.035)', border: '1px solid var(--color-border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--color-lavender)' }}>
                      {p.key}
                    </span>
                    {p.domain && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}> · {p.domain}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{p.value}</div>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={busy === p.id}
                  title="Stop following this rule"
                  onClick={() => act(p.id, async () => {
                    const res = await apiFetch(`/settings/preferences/${p.id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Could not retire that rule.');
                    setData(d => d && {
                      ...d,
                      memory: { ...d.memory, preferences: d.memory.preferences.filter(x => x.id !== p.id) },
                    });
                  })}
                  style={{ padding: '4px 9px', fontSize: 11 }}
                >
                  <X size={12} /> Retire
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <McpServersSection />
    </div>
  );
}

// ── External tools (MCP) ─────────────────────────────────────────────────────
//
// Self-contained rather than threaded through the `Settings` type and GET /settings:
// this is an independent capability list and keeping its state local means adding it
// cannot break the calendar section, which is the reason this screen exists.
//
// Shaped like the calendar-feeds block above, including test-before-save, because it
// is the same problem — a wrong URL should fail while it is still on screen, not
// later inside a turn where it reads as Raven being broken.

interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: 'http' | 'sse';
  enabled: boolean;
  /** The API returns this instead of the token. It never sends the token back. */
  has_auth: boolean;
}

function McpServersSection() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);

  const [id, setId] = useState('');
  const [url, setUrl] = useState('');
  const [bearer, setBearer] = useState('');
  const [probe, setProbe] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/settings/mcp-servers');
      if (!r.ok) throw new Error('Could not load servers');
      const body = await r.json() as { servers: McpServer[] };
      setServers(body.servers ?? []);
    } catch {
      // An unreachable settings API is not "no servers configured" — leave the list
      // unknown rather than rendering an empty state that looks like a fact.
      setServers(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setFlash(null);
    try { await fn(); }
    catch (err) { setFlash({ tone: 'warn', text: (err as Error).message }); }
    finally { setBusy(null); }
  };

  return (
    <Section
      icon={<Link2 size={16} />}
      title="External tools"
      subtitle="Paste an MCP server URL to give her new capabilities without a deploy — Zapier, Notion, Slack, GitHub, Canva."
    >
      {flash && <Note tone={flash.tone}>{flash.text}</Note>}

      {servers === null && (
        <Note tone="warn">Could not read the server list. That is not the same as none being configured.</Note>
      )}

      {servers?.length === 0 && (
        <Note tone="info">
          Nothing connected yet, so her <code>mcp</code> tool is hidden rather than offered and useless.
        </Note>
      )}

      {servers?.map(s => (
        <div
          key={s.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>
              {s.name} <code style={{ fontSize: 11, opacity: 0.7 }}>{s.id}</code>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', wordBreak: 'break-all' }}>
              {s.url} · {s.transport}
              {s.has_auth
                ? <> · <Lock size={10} style={{ verticalAlign: 'middle' }} /> authenticated</>
                : ' · no auth'}
            </div>
          </div>

          <Toggle
            on={s.enabled}
            disabled={busy === s.id}
            label={`Enable ${s.name}`}
            onChange={v => act(s.id, async () => {
              const r = await apiFetch(`/settings/mcp-servers/${encodeURIComponent(s.id)}`, {
                method: 'PATCH', body: JSON.stringify({ enabled: v }),
              });
              const body = await r.json() as { servers?: McpServer[]; error?: string };
              if (!r.ok || !body.servers) throw new Error(body.error ?? 'Could not change that.');
              setServers(body.servers);
            })}
          />

          <button
            className="btn btn-ghost"
            disabled={busy === `del-${s.id}`}
            style={{ padding: '4px 9px', fontSize: 11 }}
            onClick={() => act(`del-${s.id}`, async () => {
              const r = await apiFetch(`/settings/mcp-servers/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
              const body = await r.json() as { servers?: McpServer[]; error?: string };
              if (!r.ok || !body.servers) throw new Error(body.error ?? 'Could not remove that.');
              setServers(body.servers);
            })}
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <input
          type="text"
          placeholder="Short id — e.g. zapier"
          value={id}
          onChange={e => { setId(e.target.value.toLowerCase()); setProbe(null); }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Server id"
        />
        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: -3 }}>
          Used to name her tools as <code>id:tool</code>, so lowercase letters, digits, hyphen or
          underscore only.
        </div>

        <input
          type="text"
          placeholder="https://mcp.example.com/mcp"
          value={url}
          onChange={e => { setUrl(e.target.value); setProbe(null); }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Server URL"
        />

        <input
          type="password"
          placeholder="Bearer token (if the server needs one)"
          value={bearer}
          onChange={e => { setBearer(e.target.value); setProbe(null); }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Bearer token"
        />
        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: -3 }}>
          Stored server-side and never sent back to this screen — the list above can only tell you
          whether a token exists, not what it is.
        </div>

        {probe && <Note tone={probe.ok ? 'good' : 'warn'}>{probe.text}</Note>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost"
            disabled={!url.trim() || busy === 'test'}
            onClick={() => act('test', async () => {
              setProbe(null);
              const r = await apiFetch('/settings/mcp-servers/test', {
                method: 'POST',
                body: JSON.stringify({ id: id || undefined, url, bearer: bearer || undefined }),
              });
              const body = await r.json() as { ok: boolean; count?: number; tools?: string[]; error?: string };
              setProbe(body.ok
                ? { ok: true, text: `Connected — ${body.count ?? 0} tool(s)${body.tools?.length ? `: ${body.tools.slice(0, 6).join(', ')}${(body.count ?? 0) > 6 ? '…' : ''}` : ''}` }
                : { ok: false, text: body.error ?? 'Could not reach that server.' });
            })}
          >
            Test it
          </button>

          <button
            className="btn btn-primary"
            disabled={!url.trim() || !id.trim() || busy === 'add'}
            onClick={() => act('add', async () => {
              const r = await apiFetch('/settings/mcp-servers', {
                method: 'POST',
                body: JSON.stringify({ id, url, bearer: bearer || undefined }),
              });
              const body = await r.json() as { servers?: McpServer[]; error?: string };
              if (!r.ok || !body.servers) throw new Error(body.error ?? 'Could not add that server.');
              setServers(body.servers);
              setId(''); setUrl(''); setBearer(''); setProbe(null);
              setFlash({ tone: 'good', text: 'Connected. Her tools from that server are live on the next turn.' });
            })}
          >
            <Plus size={14} /> Add server
          </button>
        </div>
      </div>

      <Note tone="info">
        Reads run immediately. Anything that acts on the outside world queues for your approval,
        the same as a purchase does, and anything that looks destructive is refused in code.
      </Note>
    </Section>
  );
}
