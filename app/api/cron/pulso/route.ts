import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { lerEstado, registarPulso } from '@/lib/email/redundancia';

/**
 * O pulso que diz à plataforma antiga que esta está viva.
 *
 * De minuto a minuto:
 *   * * * * * curl -s "https://leads.comgo.pt/api/cron/pulso?key=SEGREDO" > /dev/null
 *
 * O nodechef lê a idade deste pulso antes de decidir se envia o email de confirmação ao
 * cliente (ver lib/email/redundancia.ts). Enquanto ele for fresco, o nodechef cala-se
 * porque sabe que fomos nós a enviar; quando envelhecer, assume que estamos em baixo e
 * envia ele — e o cliente nunca fica sem confirmação.
 *
 * De propósito não passa pela `lerConfig` do CRM nem por nenhuma outra condição: um
 * pulso que deixasse de bater por causa de uma configuração seria lido como uma avaria.
 *
 * Mesma autenticação dos outros crons desta app (CRON_SECRET por `key` ou Bearer).
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
    await registarPulso(db);
    const estado = await lerEstado(db);
    return Response.json({ success: true, modo: estado.modo, nodechefEnvia: estado.nodechefEnvia });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
