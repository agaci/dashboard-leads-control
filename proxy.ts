import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ── Rate limiting em memória ─────────────────────────────────────────────────
// Protege /api/conversations/start contra abuso (bots que ignoram o form HTML).
// Em deployment de instância única (next start) o Map persiste entre requests.

const RATE_LIMIT_MAX    = 5;              // pedidos permitidos por janela
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos em ms

type RateEntry = { count: number; resetAt: number };
const ipStore = new Map<string, RateEntry>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipStore.get(ip);

  if (!entry || now > entry.resetAt) {
    ipStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    if (ipStore.size > 2000) purgeExpired(now);
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function purgeExpired(now: number) {
  for (const [ip, entry] of ipStore) {
    if (now > entry.resetAt) ipStore.delete(ip);
  }
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return (request as any).ip ?? 'unknown';
}

export async function middleware(request: NextRequest) {
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

  // Rate limit — só no endpoint de criação de conversa
  if (request.method === 'POST' && pathname === '/api/conversations/start') {
    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return new NextResponse(
        JSON.stringify({ error: 'Demasiados pedidos. Aguarde alguns minutos e tente novamente.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
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
  const isProtectedApi = PROTECTED_API.some(p => pathname === p || pathname.startsWith(p + '/'));

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
