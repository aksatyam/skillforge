/**
 * Catch-all proxy: `/api/assessment/<path>` → `<ASSESSMENT_API>/<path>`
 *
 * Reads the `sf_access` cookie and forwards it as `Authorization: Bearer`.
 * The browser never sees the token. On 401 we attempt ONE silent refresh
 * using the `sf_refresh` cookie, rotate cookies via Set-Cookie headers on
 * the outgoing response, and retry once. If the retry is still 401 we
 * clear both cookies and return 401 — the client redirects to /login.
 *
 * Streams the upstream body through (including binary CSV/PDF) and
 * propagates status, content-type, content-disposition, and
 * x-content-type-options.
 */
import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieAttrs,
  refreshCookieAttrs,
  clearAccessCookieAttrs,
  clearRefreshCookieAttrs,
  assessmentApiBase,
} from '@/lib/session-cookies';
import { refreshWithUpstream } from '@/app/api/session/refresh/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: { path: string[] } };

/** Headers we copy back from upstream. Anything else is dropped. */
const PASSTHROUGH_HEADERS = [
  'content-type',
  'content-disposition',
  'content-length',
  'x-content-type-options',
  'cache-control',
] as const;

function buildUpstreamUrl(pathSegments: string[], search: string): string {
  const path = pathSegments.map(encodeURIComponent).join('/');
  return `${assessmentApiBase()}/${path}${search}`;
}

function copyResponseHeaders(src: Headers, dst: Headers): void {
  for (const name of PASSTHROUGH_HEADERS) {
    const v = src.get(name);
    if (v) dst.set(name, v);
  }
}

/**
 * Build a Headers object to send upstream. We strip hop-by-hop headers and
 * do NOT forward the browser's Cookie header — the assessment service must
 * not see our BFF cookies.
 */
function buildUpstreamHeaders(req: Request, accessToken: string): Headers {
  const out = new Headers();
  const inH = req.headers;
  const accept = inH.get('accept');
  if (accept) out.set('accept', accept);
  const ct = inH.get('content-type');
  if (ct) out.set('content-type', ct);
  out.set('authorization', `Bearer ${accessToken}`);
  return out;
}

async function readBodyBuffer(req: Request): Promise<ArrayBuffer | null> {
  // GET/HEAD have no body; everything else we buffer so we can retry after refresh.
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const buf = await req.arrayBuffer();
  return buf.byteLength > 0 ? buf : null;
}

async function forward(
  method: string,
  url: string,
  headers: Headers,
  body: ArrayBuffer | null,
): Promise<Response> {
  return fetch(url, {
    method,
    headers,
    body: body ?? undefined,
    cache: 'no-store',
    redirect: 'manual',
  });
}

async function proxy(req: Request, ctx: RouteCtx): Promise<Response> {
  const jar = cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;

  if (!access) {
    // Not signed in. Mirror upstream's 401 shape.
    return Response.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const upstreamUrl = buildUpstreamUrl(ctx.params.path, url.search);
  const body = await readBodyBuffer(req);

  let upstream = await forward(
    req.method,
    upstreamUrl,
    buildUpstreamHeaders(req, access),
    body,
  );

  // One-shot silent refresh on 401.
  let rotated: { access: string; refresh: string; expiresInSec: number } | null = null;
  if (upstream.status === 401) {
    const refresh = jar.get(REFRESH_COOKIE)?.value;
    if (refresh) {
      const tokens = await refreshWithUpstream(refresh);
      if (tokens) {
        rotated = {
          access: tokens.accessToken,
          refresh: tokens.refreshToken,
          expiresInSec: tokens.expiresInSec,
        };
        upstream = await forward(
          req.method,
          upstreamUrl,
          buildUpstreamHeaders(req, tokens.accessToken),
          body,
        );
      }
    }
  }

  // Build outbound headers (passthrough + any Set-Cookie rotations).
  const outHeaders = new Headers();
  copyResponseHeaders(upstream.headers, outHeaders);

  if (upstream.status === 401) {
    // Still unauthorized after optional refresh — blow away cookies.
    // We append two Set-Cookie headers manually so both are sent.
    appendClearCookies(outHeaders);
    // Drop any content-length since we may be returning our own body
    outHeaders.delete('content-length');
    const body401 = await upstream.text();
    return new Response(body401 || JSON.stringify({ message: 'Not authenticated' }), {
      status: 401,
      headers: outHeaders,
    });
  }

  if (rotated) {
    appendRotatedCookies(outHeaders, rotated);
  }

  // Stream response body through.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

/** Build a Set-Cookie string from attrs. Keeps us from pulling in extra deps. */
function serializeCookie(
  name: string,
  value: string,
  opts: {
    path: string;
    maxAge: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    domain?: string;
  },
): string {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${opts.path}`);
  parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1)}`);
  return parts.join('; ');
}

function attrsToSerializeOpts(a: ReturnType<typeof accessCookieAttrs>): {
  path: string;
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  domain?: string;
} {
  return {
    path: a.path ?? '/',
    maxAge: a.maxAge ?? 0,
    httpOnly: a.httpOnly ?? true,
    secure: a.secure ?? false,
    sameSite: (a.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
    ...(a.domain ? { domain: a.domain } : {}),
  };
}

function appendRotatedCookies(
  headers: Headers,
  tokens: { access: string; refresh: string; expiresInSec: number },
): void {
  headers.append(
    'set-cookie',
    serializeCookie(
      ACCESS_COOKIE,
      tokens.access,
      attrsToSerializeOpts(accessCookieAttrs(tokens.expiresInSec)),
    ),
  );
  headers.append(
    'set-cookie',
    serializeCookie(
      REFRESH_COOKIE,
      tokens.refresh,
      attrsToSerializeOpts(refreshCookieAttrs()),
    ),
  );
}

function appendClearCookies(headers: Headers): void {
  headers.append(
    'set-cookie',
    serializeCookie(ACCESS_COOKIE, '', attrsToSerializeOpts(clearAccessCookieAttrs())),
  );
  headers.append(
    'set-cookie',
    serializeCookie(REFRESH_COOKIE, '', attrsToSerializeOpts(clearRefreshCookieAttrs())),
  );
}

export const GET = (req: Request, ctx: RouteCtx) => proxy(req, ctx);
export const POST = (req: Request, ctx: RouteCtx) => proxy(req, ctx);
export const PUT = (req: Request, ctx: RouteCtx) => proxy(req, ctx);
export const PATCH = (req: Request, ctx: RouteCtx) => proxy(req, ctx);
export const DELETE = (req: Request, ctx: RouteCtx) => proxy(req, ctx);
