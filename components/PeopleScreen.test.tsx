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
