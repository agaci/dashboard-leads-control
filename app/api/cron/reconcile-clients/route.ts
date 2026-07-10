import { NextRequest } from 'next/server';
import { reconcileClients } from '@/lib/reconcile/matchClients';

// Reconciliação inbox/lead <-> cliente YourBox (Fase 1, read-only).
// Pensado para cron a cada ~10 min:
//   curl "https://leads.comgo.pt/api/cron/reconcile-clients?key=SEGREDO&days=3"
// Escreve sugestões `clientMatch` nas conversas; não converte nada.

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get('key');
    const auth = req.headers.get('authorization') ?? '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (key !== secret && bearer !== secret) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  try {
    const sinceDays = Number(new URL(req.url).searchParams.get('days') ?? '3') || 3;
    const result = await reconcileClients({ sinceDays });
    return Response.json({ success: true, ...result });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
