import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { computeRecommendation } from '@/lib/autobalance/advisor';

// Conselheiro de balanceamento (Fase B). Calcula os pesos RECOMENDADOS pelo bandit
// (Thompson sobre leads_efetivas/visita, só visitas PT) e GUARDA-OS — não aplica.
// Pensado para cron ~1x/dia:  curl "https://leads.comgo.pt/api/cron/variant-advisor?key=SEGREDO"

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get('key');
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '');
    if (key !== secret && bearer !== secret) return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const db = await getDb();
    return Response.json({ success: true, ...(await computeRecommendation(db)) });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
