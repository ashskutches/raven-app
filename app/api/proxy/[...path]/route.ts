/**
 * Next.js API Route — Universal proxy to raven-api.
 *
 * All frontend fetches go to /api/proxy/[...path] which:
 *   1. Injects the Bearer token server-side (never exposed to browser)
 *   2. Forwards the request body and method
 *   3. Streams SSE responses transparently (for /chat)
 *
 * Route: /api/proxy/[...path]
 * Example: fetch('/api/proxy/library') → raven-api.railway.app/library
 */

import { NextRequest } from 'next/server';



async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  const search = req.nextUrl.search;

  // Read at request-time so Railway env vars are always picked up
  const RAVEN_API = process.env.RAVEN_API_URL
    || process.env.NEXT_PUBLIC_RAVEN_API_URL
    || 'https://raven-api-production.up.railway.app';
  const SECRET = process.env.RAVEN_API_SECRET ?? '';

  const url = `${RAVEN_API}/${path}${search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (SECRET) {
    headers['Authorization'] = `Bearer ${SECRET}`;
  }

  // Forward content-type from client if present
  const clientCT = req.headers.get('content-type');
  if (clientCT) headers['Content-Type'] = clientCT;

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.text();
    if (body) init.body = body;
  }

  const upstream = await fetch(url, init);

  // Stream SSE responses through as-is
  if (upstream.headers.get('content-type')?.includes('text/event-stream')) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Conversation-Id': upstream.headers.get('X-Conversation-Id') ?? '',
      },
    });
  }

  // Regular JSON/text response
  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

// Allow streaming responses
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
