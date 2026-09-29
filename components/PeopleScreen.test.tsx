import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PeopleScreen from './PeopleScreen';

/* raven-api answers every failure with a JSON body and a non-2xx status, and
   the proxy forwards that status through unchanged. So a test that only stubs
   a rejected fetch would prove nothing about how this screen actually breaks —
   these stubs return a parseable body with the real status on it. */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Route by proxied path, so each test only has to name what it changes. */
function stubApi(overrides: Record<string, () => Response>) {
  const base: Record<string, () => Response> = {
    '/api/proxy/people': () => json([]),
    '/api/proxy/people/discord/guilds': () => json([{ id: '1', name: 'Raven HQ', icon_url: null }]),
    '/api/proxy/people/discord/members': () => json({ members: [] }),
  };
  const routes = { ...base, ...overrides };

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

/** Open the picker and ask for the every-server list. */
async function openAllServers() {
  render(<PeopleScreen />);
  await settle();
  fireEvent.click(screen.getByText('Browse Members'));
  await settle();
  fireEvent.click(screen.getByText('All servers'));
  await settle();
}

describe('GuildPickerModal — all servers', () => {
  beforeEach(() => { vi.stubGlobal('confirm', () => true); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows the whole list when the request succeeds', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({
        members: [{ discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null }],
      }),
    });

    await openAllServers();

    expect(screen.getByText('Kestrel')).toBeTruthy();
    expect(screen.queryByText('Could not load members.')).toBeNull();
  });

  it('says so when the server refuses, instead of showing an empty list', async () => {
    // What Railway returns with RAVEN_DISCORD_BOT_TOKEN unset: a 503 whose
    // body parses fine, so `data.members` is undefined and `?? []` used to
    // install an empty list that read exactly like "nobody to import".
    stubApi({
      '/api/proxy/people/discord/members': () =>
        json({ error: 'Discord bot token not configured' }, 503),
    });

    await openAllServers();

    expect(screen.getByText('Could not load members.')).toBeTruthy();
  });

  it('says so when Discord rate-limits the guild walk', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () =>
        json({ error: 'Discord API error: 429' }, 500),
    });

    await openAllServers();

    expect(screen.getByText('Could not load members.')).toBeTruthy();
  });

  it('names the servers it could not read when the walk half-fails', async () => {
    // raven-api answers 200 with whatever it did manage to collect and lists
    // the guilds it could not reach alongside it, so the list is real but
    // short — the only thing that says so is this warning.
    stubApi({
      '/api/proxy/people/discord/members': () => json({
        members: [{ discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null }],
        failed_guilds: [{ name: 'Kestrel Keep' }],
      }),
    });

    await openAllServers();

    expect(screen.getByText('Kestrel')).toBeTruthy();
    expect(screen.getByText(/Could not read Kestrel Keep/)).toBeTruthy();
  });
});

describe('GuildPickerModal — one server', () => {
  beforeEach(() => { vi.stubGlobal('confirm', () => true); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  /** Open the picker and click through to a single named server. */
  async function openGuild(name: string) {
    render(<PeopleScreen />);
    await settle();
    fireEvent.click(screen.getByText('Browse Members'));
    await settle();
    fireEvent.click(screen.getByText(name));
    await settle();
  }

  it('shows the members when the request succeeds', async () => {
    stubApi({
      '/api/proxy/people/discord/guilds/1/members': () => json([
        { discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null },
      ]),
    });

    await openGuild('Raven HQ');

    expect(screen.getByText('Kestrel')).toBeTruthy();
    expect(screen.queryByText('Could not load members.')).toBeNull();
  });

  it('says so when the single-server request refuses', async () => {
    // The per-guild route expects an array. A refusal is a JSON {error} object
    // with a non-2xx status, which parses fine — so an unchecked r.json() put
    // a non-array into `members` and the next render threw on .filter().
    stubApi({
      '/api/proxy/people/discord/guilds/1/members': () =>
        json({ error: 'Discord API error: 500' }, 500),
    });

    await openGuild('Raven HQ');

    expect(screen.getByText('Could not load members.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('· 0');
  });
});

describe('GuildPickerModal — switching servers after a success', () => {
  beforeEach(() => { vi.stubGlobal('confirm', () => true); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('drops the previous server\'s members when the next request fails', async () => {
    stubApi({
      // Raven HQ answers fine...
      '/api/proxy/people/discord/guilds/1/members': () => json([
        { discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null },
      ]),
      // ...then the every-server walk falls over.
      '/api/proxy/people/discord/members': () =>
        json({ error: 'Discord API error: 429' }, 500),
    });

    render(<PeopleScreen />);
    await settle();
    fireEvent.click(screen.getByText('Browse Members'));
    await settle();

    fireEvent.click(screen.getByText('Raven HQ'));
    await settle();
    expect(screen.getByText('Kestrel')).toBeTruthy();

    fireEvent.click(screen.getByText('← Back'));
    fireEvent.click(screen.getByText('All servers'));
    await settle();

    expect(screen.getByText('Could not load members.')).toBeTruthy();
    // The failed list must not be Raven HQ's list wearing an "All servers"
    // label — nor its headcount presented as an every-server total.
    expect(screen.queryByText('Kestrel')).toBeNull();
    expect(screen.getByRole('heading', { level: 3 }).textContent).not.toContain('· 1');
  });

  it('still offers the server list after backing out of a failed load', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () =>
        json({ error: 'Discord API error: 429' }, 500),
    });

    render(<PeopleScreen />);
    await settle();
    fireEvent.click(screen.getByText('Browse Members'));
    await settle();

    fireEvent.click(screen.getByText('All servers'));
    await settle();
    expect(screen.getByText('Could not load members.')).toBeTruthy();

    // '← Back' is the only way out of a failed member load that keeps the
    // picker open, so the server step behind it has to be usable — the guilds
    // loaded fine and picking a different one is the obvious retry.
    fireEvent.click(screen.getByText('← Back'));
    await settle();

    expect(screen.getByText('Raven HQ')).toBeTruthy();
  });

  it('drops the half-failed walk\'s warning when backing out to the server list', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({
        members: [{ discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null }],
        failed_guilds: [{ name: 'Kestrel Keep' }],
      }),
    });

    await openAllServers();
    expect(screen.getByText(/Could not read Kestrel Keep/)).toBeTruthy();

    // The warning renders above the step switch, so it outlives the step it
    // describes unless Back clears it — and over the server list it claims
    // members are missing from a list that is not a list of members.
    fireEvent.click(screen.getByText('← Back'));
    await settle();

    expect(screen.getByText('Raven HQ')).toBeTruthy();
    expect(screen.queryByText(/Could not read Kestrel Keep/)).toBeNull();
  });
});

describe('GuildPickerModal — the server list itself', () => {
  beforeEach(() => { vi.stubGlobal('confirm', () => true); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('says so when the server list refuses, instead of killing the picker', async () => {
    // Railway with RAVEN_DISCORD_BOT_TOKEN unset answers this route 503 with
    // a JSON {error} body. That parses, so .catch() never fired — the object
    // went into `guilds`, `guilds.length === 0` was false because undefined
    // is not 0, and the next render died on guilds.map.
    stubApi({
      '/api/proxy/people/discord/guilds': () =>
        json({ error: 'Discord bot token not configured' }, 503),
    });

    render(<PeopleScreen />);
    await settle();
    fireEvent.click(screen.getByText('Browse Members'));
    await settle();

    expect(screen.getByText('Could not load Discord servers.')).toBeTruthy();
    // ...and only that. 'No servers found.' is the empty state for a list that
    // loaded and came back empty — printing it under the failure claims the
    // opposite of the failure: that Raven asked and is in no servers.
    expect(screen.queryByText('No servers found.')).toBeNull();
  });

  it('says so when a 200 carries something that is not a list', async () => {
    stubApi({ '/api/proxy/people/discord/guilds': () => json({ guilds: [] }) });

    render(<PeopleScreen />);
    await settle();
    fireEvent.click(screen.getByText('Browse Members'));
    await settle();

    expect(screen.getByText('Could not load Discord servers.')).toBeTruthy();
  });
});

function crowd(n: number, prefix = 'member') {
  return Array.from({ length: n }, (_, i) => ({
    discord_user_id: String(i),
    username: `${prefix}${i}`,
    display_name: `${prefix} ${i}`,
    // A real avatar url, because the count of these is the whole point: one
    // <img> per rendered row is one request at cdn.discordapp.com.
    avatar_url: `https://cdn.discordapp.com/avatars/${i}/abc.png?size=128`,
  }));
}

/** Open the picker on one server. */
async function openGuild(name = 'Raven HQ') {
  render(<PeopleScreen />);
  await settle();
  fireEvent.click(screen.getByText('Browse Members'));
  await settle();
  fireEvent.click(screen.getByText(name));
  await settle();
}

/* raven-api `7851156` removed the implicit 100-member cap: the browse
   endpoints now return whole guilds, and only truncate when the caller passes
   `?limit=`. This picker passes none, and mounts one row and one <img> per
   member into a plain column — so the size of that render became Discord's
   decision rather than ours. */
describe('GuildPickerModal — a guild bigger than the modal', () => {
  beforeEach(() => { vi.stubGlobal('confirm', () => true); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('mounts a bounded number of rows however many members come back', async () => {
    stubApi({ '/api/proxy/people/discord/guilds/1/members': () => json(crowd(5000)) });

    await openGuild();

    // Before the cap this was 5,000 rows and 5,000 avatar requests in one commit.
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(100);
    expect(document.querySelectorAll('img[src^="https://cdn.discordapp.com/avatars"]'))
      .toHaveLength(100);
  });

  it('says how many it is holding back, rather than silently truncating', async () => {
    stubApi({ '/api/proxy/people/discord/guilds/1/members': () => json(crowd(5000)) });

    await openGuild();

    expect(screen.getByText(/first 100 of 5000 matches/)).toBeTruthy();
    // The header still counts the whole guild — the cap is a render budget,
    // not a claim about how many people are there.
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('5000');
  });

  it('searches the whole guild, not just the rows it drew', async () => {
    // member 4999 is far past the cap, so a fetch-side limit would lose it.
    stubApi({ '/api/proxy/people/discord/guilds/1/members': () => json(crowd(5000)) });

    await openGuild();
    expect(screen.queryByText('member 4999')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Search members...'), {
      target: { value: 'member 4999' },
    });
    await settle();

    expect(screen.getByText('member 4999')).toBeTruthy();
    // Nothing held back once the search fits — no stale "showing the first…".
    expect(screen.queryByText(/first 100 of/)).toBeNull();
  });

  it('leaves a guild that fits alone', async () => {
    stubApi({ '/api/proxy/people/discord/guilds/1/members': () => json(crowd(100)) });

    await openGuild();

    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(100);
    expect(screen.queryByText(/first 100 of/)).toBeNull();
  });

  it('caps the every-server list too, which has no `?limit=` to pass', async () => {
    stubApi({
      '/api/proxy/people/discord/members': () => json({ members: crowd(5000) }),
    });

    await openGuild('All servers');

    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(100);
    expect(screen.getByText(/first 100 of 5000 matches/)).toBeTruthy();
  });
});

/* The two browse endpoints do NOT return the same shape, and the picker has a
   separate branch for each. `/people/discord/members` answers with an envelope
   — `{members, failed_guilds}` — because it has partial failure to report;
   `/people/discord/guilds/:id/members` answers with a bare array. Routing by
   path here means a test only has to name the response it cares about, and
   means a future shape change on either endpoint shows up as a failure rather
   than as an empty list. */
function stubBrowseApi(overrides: Record<string, () => Response> = {}) {
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
    stubBrowseApi({
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
    stubBrowseApi({
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
    stubBrowseApi({ '/api/proxy/people/discord/guilds/1/members': () => json([member('10', 'Ada')]) });

    await openPicker('Leaps & Rebounds');

    expect(screen.getByText('Ada')).toBeTruthy();
  });
});

/* A guild Discord would not hand over is reported inside the envelope rather
   than thrown — the list simply comes back thinner, with no other sign that it
   is incomplete. */
describe('GuildPickerModal — a server that could not be read', () => {
  it('names the servers it is missing, rather than quietly thinning the list', async () => {
    stubBrowseApi({
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
    stubBrowseApi({
      '/api/proxy/people/discord/members': () => json({ members: [member('10', 'Ada')] }),
    });

    await openPicker('All servers');

    expect(screen.queryByText(/Could not read/)).toBeNull();
  });

  it('clears a stale warning when the next server reads cleanly', async () => {
    stubBrowseApi({
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
    stubBrowseApi({
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
    stubBrowseApi({
      // Same display name, different Discord account: still not in the CRM.
      '/api/proxy/people': () => json([person('10')]),
      '/api/proxy/people/discord/members': () => json({ members: [member('99', 'Ada')] }),
    });

    await openPicker('All servers');

    expect(screen.queryByText('Added')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1);
  });

  it('ignores CRM rows that have no Discord account at all', async () => {
    stubBrowseApi({
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
