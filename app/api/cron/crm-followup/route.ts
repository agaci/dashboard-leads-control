import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { lerConfig } from '@/lib/crm/config';
import { correrFollowUp } from '@/lib/crm/followup';

/**
 * Follow-up ao cliente 48h depois da entrega (spec §6.2 e §9.4).
 *
 * Pensado para cron de hora a hora — a janela é de 48h, não é preciso mais:
 *   curl "https://leads.comgo.pt/api/cron/crm-followup?key=SEGREDO"
 *
 * Mesma autenticação dos outros crons desta app (CRON_SECRET por `key` ou Bearer).
 * Também expira as janelas de recusa que passaram das 24h, porque é o mesmo varrimento
 * temporal e não vale a pena um segundo cron para isso.
 */

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get('key');
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '');
    if (key !== secret && bearer !== secret) return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const cfg = await lerConfig(db);
    if (!cfg.active) return Response.json({ success: true, skipped: 'CRM inactivo' });

    const [followUp, expirados] = await Promise.all([
      correrFollowUp(db),
      expirarEnvios(db),
    ]);

    return Response.json({ success: true, followUp, enviosExpirados: expirados });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Fecha os envios cuja janela passou.
 *
 * Sem isto, um envio fica 'enviado' para sempre e a métrica de responsividade nunca
 * distingue quem não respondeu de quem ainda vai responder.
 */
async function expirarEnvios(db: any): Promise<number> {
  const r: any = await db.collection('crm_dispatches').updateMany(
    {
      expiresAt: { $ne: null, $lte: new Date() },
      estado: { $in: ['enviado', 'entregue', 'visto'] },
    },
    { $set: { estado: 'expirado', updatedAt: new Date() } },
  );
  return Number(r?.modifiedCount ?? r?.result?.nModified ?? 0);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
