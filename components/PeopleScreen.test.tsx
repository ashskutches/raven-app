import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PeopleScreen from './PeopleScreen';

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* The two browse endpoints do NOT return the same shape, and the picker has a
   separate branch for each. `/people/discord/members` answers with an envelope
   — `{members, failed_guilds}` — because it has partial failure to report;
   `/people/discord/guilds/:id/members` answers with a bare array. Routing by
   path here means a test only has to name the response it cares about, and
   means a future shape change on either endpoint shows up as a failure rather
   than as an empty list. */
function stubApi(overrides: Record<string, () => Response> = {}) {
  const routes: Record<string, () => Response> = {
    '/api/proxy/people': () => json([]),
    '/api/proxy/people/discord/guilds': () => json([
      { id: '1', name: 'Leaps & Rebounds', icon_url: null },
      { id: '2', name: 'Sex Basement', icon_url: null },
    ]),
    '/api/proxy/people/discord/members': () => json({ members: [] }),
    '/api/proxy/people/discord/guilds/1/members': () => json([]),
    ...overrides,
  };

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0];
    const route = routes[path];
    if (!route) throw new Error(`unstubbed request: ${path}`);
    return route();
  }));
}

/** Let queued microtasks (fetch → json → setState) settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

/** A CRM row, reduced to the one field the picker reads off it. */
function person(discordUserId: string | null) {
  return {
    id: `p-${discordUserId ?? 'none'}`,
    name: 'Someone In The CRM',
    relationship_type: null, birthday: null, email: null, phone: null,
    notes: null, raven_notes: null,
    discord_user_id: discordUserId,
    discord_username: null, discord_avatar_url: null, telegram_user_id: null,
    can_raven_contact: false, trusted_contact: false,
    permission: 'chat_only', access_role: 'contact',
    active: true, last_active_at: null, last_contacted_at: null,
    created_at: '2026-09-01T00:00:00Z',
  };
}

function member(id: string, name: string, guilds?: Array<{ id: string; name: string }>) {
  return {
    discord_user_id: id,
    username: name.toLowerCase().replace(/\s/g, ''),
    display_name: name,
    avatar_url: null,
    ...(guilds ? { guilds } : {}),
  };
}

/** Open the picker and drill into one server. */
async function openPicker(serverName: string) {
  render(<PeopleScreen />);
  await settle();
  fireEvent.click(screen.getByText('Browse Members'));
  await settle();
  fireEvent.click(screen.getByText(serverName));
  await settle();
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('GuildPickerModal — reading the browse endpoints', () => {
  it('unwraps the all-servers envelope instead of treating it as the list', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({
        members: [
          member('10', 'Ada', [{ id: '1', name: 'Leaps & Rebounds' }]),
          member('11', 'Grace', [{ id: '2', name: 'Sex Basement' }]),
        ],
      }),
    });

    await openPicker('All servers');

    // An envelope read as a bare array yields zero rows and no error — the
    // picker would just look like Raven is in no servers with anyone in them.
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Grace')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('2');
  });

  it('prints which server each member came from, in the all-servers view', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({
        members: [member('10', 'Ada', [
          { id: '1', name: 'Leaps & Rebounds' },
          { id: '2', name: 'Sex Basement' },
        ])],
      }),
    });

    await openPicker('All servers');

    expect(screen.getByText('@ada · Leaps & Rebounds · Sex Basement')).toBeTruthy();
  });

  it('reads a single guild as a bare array, which is not the envelope shape', async () => {
    stubApi({ '/api/proxy/people/discord/guilds/1/members': () => json([member('10', 'Ada')]) });

    await openPicker('Leaps & Rebounds');

    expect(screen.getByText('Ada')).toBeTruthy();
  });
});

/* A guild Discord would not hand over is reported inside the envelope rather
   than thrown — the list simply comes back thinner, with no other sign that it
   is incomplete. */
describe('GuildPickerModal — a server that could not be read', () => {
  it('names the servers it is missing, rather than quietly thinning the list', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({
        members: [member('10', 'Ada', [{ id: '1', name: 'Leaps & Rebounds' }])],
        failed_guilds: [{ name: 'Sex Basement' }],
      }),
    });

    await openPicker('All servers');

    expect(screen.getByText(/Could not read Sex Basement/)).toBeTruthy();
    // The members it did get are still shown — a partial failure is not an error.
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.queryByText('Could not load members.')).toBeNull();
  });

  it('says nothing when every server was readable', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({ members: [member('10', 'Ada')] }),
    });

    await openPicker('All servers');

    expect(screen.queryByText(/Could not read/)).toBeNull();
  });

  it('clears a stale warning when the next server reads cleanly', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({
        members: [], failed_guilds: [{ name: 'Sex Basement' }],
      }),
      '/api/proxy/people/discord/guilds/1/members': () => json([member('10', 'Ada')]),
    });

    await openPicker('All servers');
    expect(screen.getByText(/Could not read Sex Basement/)).toBeTruthy();

    fireEvent.click(screen.getByText('← Back'));
    await settle();
    fireEvent.click(screen.getByText('Leaps & Rebounds'));
    await settle();

    expect(screen.queryByText(/Could not read/)).toBeNull();
  });
});

/* onImport skips anyone already in the CRM, so an Add button on those rows did
   nothing at all when pressed. With most of the list already synced, that was
   most of the buttons. */
describe('GuildPickerModal — someone already in the CRM', () => {
  it('reads "Added" and offers no button to press', async () => {
    stubApi({
      '/api/proxy/people': () => json([person('10')]),
      '/api/proxy/people/discord/members': () => json({
        members: [member('10', 'Ada'), member('11', 'Grace')],
      }),
    });

    await openPicker('All servers');

    expect(screen.getByText('Added')).toBeTruthy();
    // Only Grace is addable, so exactly one button — not one per member.
    const buttons = screen.getAllByRole('button', { name: 'Add' });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].parentElement?.textContent).toContain('Grace');
  });

  it('matches on Discord id, not on name', async () => {
    stubApi({
      // Same display name, different Discord account: still not in the CRM.
      '/api/proxy/people': () => json([person('10')]),
      '/api/proxy/people/discord/members': () => json({ members: [member('99', 'Ada')] }),
    });

    await openPicker('All servers');

    expect(screen.queryByText('Added')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1);
  });

  it('ignores CRM rows that have no Discord account at all', async () => {
    stubApi({
      // A null discord_user_id must not reach the set — a member whose own id
      // were ever missing would otherwise read as already added.
      '/api/proxy/people': () => json([person(null)]),
      '/api/proxy/people/discord/members': () => json({ members: [member('10', 'Ada')] }),
    });

    await openPicker('All servers');

    expect(screen.queryByText('Added')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1);
  });
});
