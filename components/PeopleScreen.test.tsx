import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PeopleScreen from './PeopleScreen';

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
