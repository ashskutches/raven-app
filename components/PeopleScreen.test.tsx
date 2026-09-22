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
type Route = () => Response | Promise<Response>;
function stubApi(overrides: Record<string, Route>) {
  const base: Record<string, Route> = {
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

describe('GuildPickerModal — switching servers while a load is still running', () => {
  beforeEach(() => { vi.stubGlobal('confirm', () => true); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('ignores an abandoned every-server walk that lands after a single server', async () => {
    // raven-api walks every guild sequentially for the all-servers list, so it
    // can take seconds while one guild answers immediately. '← Back' only flips
    // `step` — the abandoned walk is still in flight, and whichever request
    // resolves last used to win regardless of which server is on screen.
    let releaseWalk: () => void = () => {};
    const walkLanded = new Promise<void>(resolve => { releaseWalk = resolve; });

    stubApi({
      // Raven HQ: one member, answers at once.
      '/api/proxy/people/discord/guilds/1/members': () => json([
        { discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null },
      ]),
      // Every server: two members, but only once the test lets it through.
      '/api/proxy/people/discord/members': async () => {
        await walkLanded;
        return json({
          members: [
            { discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null },
            { discord_user_id: '7', username: 'magpie', display_name: 'Magpie', avatar_url: null },
          ],
        });
      },
    });

    render(<PeopleScreen />);
    await settle();
    fireEvent.click(screen.getByText('Browse Members'));
    await settle();

    fireEvent.click(screen.getByText('All servers'));
    await settle();
    fireEvent.click(screen.getByText('← Back'));
    fireEvent.click(screen.getByText('Raven HQ'));
    await settle();

    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Raven HQ · 1');

    // The abandoned walk finally comes back.
    releaseWalk();
    await settle();

    // It must not repaint the list under the Raven HQ label.
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Raven HQ · 1');
    expect(screen.queryByText('Magpie')).toBeNull();
  });

  it('does not let an abandoned walk’s failure blame the server now on screen', async () => {
    let releaseWalk: () => void = () => {};
    const walkLanded = new Promise<void>(resolve => { releaseWalk = resolve; });

    stubApi({
      '/api/proxy/people/discord/guilds/1/members': () => json([
        { discord_user_id: '9', username: 'kestrel', display_name: 'Kestrel', avatar_url: null },
      ]),
      '/api/proxy/people/discord/members': async () => {
        await walkLanded;
        return json({ error: 'Discord API error: 429' }, 500);
      },
    });

    render(<PeopleScreen />);
    await settle();
    fireEvent.click(screen.getByText('Browse Members'));
    await settle();

    fireEvent.click(screen.getByText('All servers'));
    await settle();
    fireEvent.click(screen.getByText('← Back'));
    fireEvent.click(screen.getByText('Raven HQ'));
    await settle();

    releaseWalk();
    await settle();

    // Raven HQ loaded fine. The all-servers failure belongs to a list nobody
    // is looking at, so it must not appear over a list that is right there.
    expect(screen.queryByText('Could not load members.')).toBeNull();
    expect(screen.getByText('Kestrel')).toBeTruthy();
  });
});
