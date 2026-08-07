import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { selectExportableLeads } from '@/lib/conversions/selectLeads';
import { selectEffectiveConversions } from '@/lib/conversions/selectEffective';
import { buildConversionsCsv, ensureAfterClick, CONVERSION_TIMEZONE, type ClickIdKind } from '@/lib/conversions/csv';
import { CONVERSION_CURRENCY } from '@/lib/conversions/values';
import type { ConversionSyncStatus } from '@/lib/attribution';

// Exporta as conversões no formato que o Google Ads aceita em
// Ferramentas > Conversões > Importações.
//
// USO MANUAL (dashboard, sessão iniciada):
//   GET /api/conversions/export?from=2026-07-01&to=2026-08-07
//
// USO AUTOMÁTICO — Programação do Google Ads:
//   https://leads.comgo.pt/api/conversions/export?token=SEGREDO&mark=uploaded
//
// O Google vai buscar o ficheiro sozinho, todos os dias, e nunca mais é preciso
// exportar nada à mão. Como não consegue enviar cabeçalhos HTTP, o token tem de
// viajar na query string — daí as duas formas de autorização.
//
// `mark=uploaded` é OBRIGATÓRIO no URL da Programação. Sem ele as conversões
// ficam em 'exported' e voltam a sair no dia seguinte, e o Google contaria as
// mesmas conversões todos os dias.
//
// FONTES
//   1. Leads completas   — colecção `messages`, quiz concluído
//   2. Leads efectivas   — colecção `conversations`, quiz abandonado com contacto
//
// As efectivas são contactadas pela equipa como qualquer outra lead e fecham na
// mesma proporção; o Google é que nunca soube delas. Valem menos na escala de
// valor (ver lib/conversions/values.ts) mas contam como conversão.
//
// TODO (Fase 6): a Google Ads API com UploadClickConversionsRequest só passa a
// valer a pena se um dia for preciso corrigir ou remover conversões já enviadas.
// Para enviar, a Programação faz o mesmo sem developer token nem OAuth.

const CONVERSION_NAME = process.env.GOOGLE_ADS_CONVERSION_NAME ?? 'Lead Yourbox';

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Comparação em tempo constante, para o token não ser adivinhável por timing. */
function tokenIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function autorizar(req: NextRequest, sp: URLSearchParams): Promise<boolean> {
  const token = process.env.CONVERSIONS_TOKEN;
  if (token) {
    const header = req.headers.get('authorization') ?? '';
    if (header.startsWith('Bearer ') && tokenIgual(header.slice(7), token)) return true;
    // O Google Ads não envia cabeçalhos: aceitar também na query string.
    const qs = sp.get('token');
    if (qs && tokenIgual(qs, token)) return true;
  }
  const session = await getServerSession(authOptions);
  return !!session?.user;
}

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;

    if (!await autorizar(req, sp)) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const kindRaw = sp.get('id') ?? 'gclid';
    const kind: ClickIdKind = (['gclid', 'wbraid', 'gbraid'].includes(kindRaw) ? kindRaw : 'gclid') as ClickIdKind;

    const statusRaw = sp.get('status');
    const status = (['pending', 'exported', 'uploaded', 'skipped'].includes(statusRaw ?? '')
      ? statusRaw : undefined) as ConversionSyncStatus | undefined;

    const dry = sp.get('dry') === '1';
    // Estado a gravar depois de exportar. 'uploaded' para a Programação diária,
    // 'exported' (o default) para downloads manuais que ainda vão ser conferidos.
    const mark: ConversionSyncStatus = sp.get('mark') === 'uploaded' ? 'uploaded' : 'exported';
    // ?efetivas=0 exclui os quizzes abandonados, para comparar o efeito.
    const incluirEfetivas = sp.get('efetivas') !== '0';

    const from = parseDate(sp.get('from'));
    const to = parseDate(sp.get('to'));

    const db = await getDb();

    const [leads, efetivas] = await Promise.all([
      selectExportableLeads(db, { from, to, status, kind }),
      incluirEfetivas
        ? selectEffectiveConversions(db, { from, to, status, kind })
        : Promise.resolve([]),
    ]);

    // O Google rejeita a linha se a conversão não for posterior ao clique.
    let ajustadas = 0;
    const linhas = [
      ...leads.map((r) => ({ ...r, id: r.leadId, fonte: 'lead' as const })),
      ...efetivas.map((r) => ({ ...r, id: r.convId, fonte: 'efetiva' as const })),
    ].map((r) => {
      const t = ensureAfterClick(r.conversionTime, r.clickedAt);
      if (t.getTime() !== r.conversionTime.getTime()) ajustadas++;
      return { ...r, conversionTime: t };
    });

    // Um clique nunca gera duas conversões, mesmo vindo de fontes diferentes:
    // a mesma pessoa pode ter uma conversa abandonada e uma lead completa.
    linhas.sort((a, b) => a.conversionTime.getTime() - b.conversionTime.getTime());
    const vistos = new Set<string>();
    const finais = linhas.filter((r) => !vistos.has(r.clickId) && vistos.add(r.clickId));

    const csv = buildConversionsCsv(
      finais.map((r) => ({
        clickId: r.clickId,
        conversionName: CONVERSION_NAME,
        conversionTime: r.conversionTime,
        value: r.value,
        currency: CONVERSION_CURRENCY,
      })),
      { kind, timeZone: CONVERSION_TIMEZONE },
    );

    // Marcar só depois de o ficheiro estar construído: se algo rebentar acima, o
    // estado não se mexe e a exportação pode repetir-se sem perder nada.
    if (!dry && finais.length) {
      const now = new Date();
      const set = { $set: { 'conversionSync.status': mark, 'conversionSync.exportedAt': now } };
      const naoEnviadas = { 'conversionSync.status': { $ne: 'uploaded' } };

      const idsLeads = finais.filter((r) => r.fonte === 'lead').map((r) => new ObjectId(r.id));
      const idsConvs = finais.filter((r) => r.fonte === 'efetiva').map((r) => new ObjectId(r.id));

      await Promise.all([
        idsLeads.length
          ? db.collection('messages').updateMany({ _id: { $in: idsLeads }, ...naoEnviadas }, set)
          : Promise.resolve(null),
        idsConvs.length
          ? db.collection('conversations').updateMany({ _id: { $in: idsConvs }, ...naoEnviadas }, set)
          : Promise.resolve(null),
      ]);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="yourbox-conversoes-${kind}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
        // Diagnóstico sem abrir o ficheiro — visível no histórico de Programações.
        'X-Conversions-Rows': String(finais.length),
        'X-Conversions-Leads': String(finais.filter((r) => r.fonte === 'lead').length),
        'X-Conversions-Efetivas': String(finais.filter((r) => r.fonte === 'efetiva').length),
        'X-Conversions-Adjusted': String(ajustadas),
        'X-Conversions-Marked': dry ? 'none' : mark,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
