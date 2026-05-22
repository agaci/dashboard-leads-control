import { NextRequest, NextResponse } from 'next/server';

/**
 * Rate limiting por IP — store em memória (adequado para single-container Docker).
 * Resets no restart do container.
 */
const store = new Map<string, { count: number; windowStart: number }>();

const RULES = {
  start:   { max: 5,  windowMs: 3_600_000 }, // 5 conversas novas / IP / hora
  message: { max: 30, windowMs: 3_600_000 }, // 30 mensagens      / IP / hora
  price:   { max: 15, windowMs: 3_600_000 }, // 15 simulações     / IP / hora
};

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function checkLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

const TOO_MANY = NextResponse.json(
  { error: 'Demasiados pedidos. Tente novamente em 1 hora.' },
  { status: 429, headers: { 'Retry-After': '3600' } },
);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getIp(request);

  if (pathname === '/api/conversations/start') {
    if (!checkLimit(`start:${ip}`, RULES.start.max, RULES.start.windowMs))
      return TOO_MANY;

  } else if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/message')) {
    if (!checkLimit(`message:${ip}`, RULES.message.max, RULES.message.windowMs))
      return TOO_MANY;

  } else if (pathname === '/api/price') {
    if (!checkLimit(`price:${ip}`, RULES.price.max, RULES.price.windowMs))
      return TOO_MANY;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/conversations/start',
    '/api/conversations/:id/message',
    '/api/price',
  ],
};
