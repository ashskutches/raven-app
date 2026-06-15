import { NextRequest } from 'next/server';

const RAVEN_API = process.env.NEXT_PUBLIC_RAVEN_API_URL
  ?? process.env.RAVEN_API_URL
  ?? 'http://localhost:4000';

/**
 * Proxies /api/chat → raven-api /chat
 * Streams SSE through so the browser sees identical events.
 * Using a server-side proxy means:
 *  - No CORS issues (same-origin request from browser)
 *  - API URL never needs to be baked into the client bundle
 *  - Can add auth headers server-side in future
 */
export async function POST(req: NextRequest) {
  const body = await req.text();

  const upstream = await fetch(`${RAVEN_API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(JSON.stringify({ error: text }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream the SSE response straight through
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Conversation-Id': upstream.headers.get('X-Conversation-Id') ?? '',
    },
  });
}
