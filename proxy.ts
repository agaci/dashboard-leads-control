import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ── Rate limiting em memória ─────────────────────────────────────────────────
// Em deployment de instância única (next start) o Map persiste entre requests.

const RATE_RULES: Record<string, { max: number; windowMs: number }> = {
  start:   { max: 5,  windowMs: 15 * 60 * 1000 }, // 5 conversas novas  / IP / 15 min
  message: { max: 30, windowMs: 60 * 60 * 1000  }, // 30 mensagens       / IP / hora
  price:   { max: 15, windowMs: 60 * 60 * 1000  }, // 15 simulações      / IP / hora
};

type RateEntry = { count: number; resetAt: number };
const ipStore = new Map<string, RateEntry>();

function checkRateLimit(key: string, rule: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const entry = ipStore.get(key);

  if (!entry || now > entry.resetAt) {
    ipStore.set(key, { count: 1, resetAt: now + rule.windowMs });
    if (ipStore.size > 5000) purgeExpired(now);
    return true;
  }

  if (entry.count >= rule.max) return false;
  entry.count++;
  return true;
}

function purgeExpired(now: number) {
  for (const [k, entry] of ipStore) {
    if (now > entry.resetAt) ipStore.delete(k);
  }
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return (request as any).ip ?? 'unknown';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORS preflight para API
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Rate limiting por IP
  if (request.method === 'POST') {
    const ip = getClientIp(request);
    const tooMany = new NextResponse(
      JSON.stringify({ error: 'Demasiados pedidos. Tente novamente mais tarde.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' } },
    );

    if (pathname === '/api/conversations/start') {
      if (!checkRateLimit(`start:${ip}`, RATE_RULES.start)) return tooMany;
    } else if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/message')) {
      if (!checkRateLimit(`msg:${ip}`, RATE_RULES.message)) return tooMany;
    } else if (pathname === '/api/price') {
      if (!checkRateLimit(`price:${ip}`, RATE_RULES.price)) return tooMany;
    }
  }

  // Rotas de API sensíveis — requerem sessão autenticada
  const PROTECTED_API = [
    '/api/leads',
    '/api/clients',
    '/api/conversations',
    '/api/reports',
    '/api/users',
    '/api/settings',
    '/api/notifications',
    '/api/agg-history',
    '/api/knowledge',
    '/api/parceiros',
    '/api/routing-config',
  ];
  // Rotas públicas do chat widget — nunca proteger mesmo que o prefixo coincida
  const PUBLIC_PATHS = [
    '/api/conversations/start',
    '/api/agent/',
    '/api/price',
    '/api/ifthenpay/',
    '/api/stripe/',
    '/api/health',
    '/api/leads/international',
    '/api/whatsapp/',
  ];
  // Chat widget: POST .../message and GET .../conversations/{id} for polling
  const isChatMessage = /^\/api\/conversations\/[^/]+\/message$/.test(pathname) && request.method === 'POST';
  const isChatPoll    = /^\/api\/conversations\/[^/]+$/.test(pathname)           && request.method === 'GET';

  const isPublicPath = isChatMessage || isChatPoll || PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));

  const isProtectedApi = !isPublicPath && PROTECTED_API.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (isProtectedApi || pathname.startsWith('/dashboard')) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      if (isProtectedApi) {
        return new NextResponse(
          JSON.stringify({ error: 'Não autorizado' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
