import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { normalizeAttribution, normalizePhone, hasClickId } from '@/lib/attribution';

// Liga uma atribuição de campanha (gclid/wbraid/gbraid) a um telemóvel, no momento
// em que o visitante submete o formulário no site.
//
// Existe porque as landings submetem a lead para a plataforma antiga
// (weby-5204.nodechef.com/api/submitDirectLead), que não conhece o gclid e não está
// sob o nosso controlo. Esta rota guarda a atribuição do nosso lado, indexada pelo
// telemóvel, para que a exportação de conversões offline consiga casar cada lead
// com o clique que a originou (ver app/api/conversions/export).
//
// Chamado cross-origin (yourbox.com.pt -> leads.comgo.pt) por navigator.sendBeacon
// com Content-Type text/plain — pedido simples, sem preflight. Fire-and-forget.
//
// Público por necessidade (o beacon não tem sessão). Mitigações: whitelist de
// campos em normalizeAttribution, upsert por telemóvel (não acumula lixo), e
// nenhuma consequência prática de um registo forjado — a exportação parte sempre
// das leads reais, nunca desta colecção.

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj: unknown, status = 200) {
  return Response.json(obj, { status, headers: CORS });
}

// Índices garantidos uma vez por processo. TTL de 120 dias: mais folgado do que a
// janela de 90 do Google Ads, para nunca perder o par antes da conversão expirar.
let _idxEnsured = false;
async function ensureIndexes(db: Awaited<ReturnType<typeof getDb>>) {
  if (_idxEnsured) return;
  _idxEnsured = true;
  try {
    await db.collection('attributions').createIndex({ phone: 1, createdAt: -1 });
    await db.collection('attributions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 120 * 24 * 3600 });
  } catch { /* indices ja existem */ }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const { phone, variante, visitSid, attr } = body as {
      phone?: string;
      variante?: string | null;
      visitSid?: string | null;
      attr?: unknown;
    };

    const normPhone = normalizePhone(phone);
    const attribution = normalizeAttribution(attr);

    // Sem telemóvel não há como reconciliar; sem click id não há nada a reportar
    // ao Google. Devolvemos 200 na mesma — é um beacon, não vale a pena ruído.
    if (!normPhone || !hasClickId(attribution)) return json({ ok: true, stored: false });

    const db = await getDb();
    await ensureIndexes(db);
    const now = new Date();

    // Um registo por (telemóvel, clique): se a mesma pessoa submeter duas vezes com
    // o mesmo gclid, actualiza em vez de duplicar.
    await db.collection('attributions').updateOne(
      { phone: normPhone, 'attribution.gclid': attribution!.gclid ?? null },
      {
        $setOnInsert: { phone: normPhone, createdAt: now },
        $set: {
          attribution,
          variante: variante ?? null,
          visitSid: visitSid ?? null,
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    return json({ ok: true, stored: true });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}
