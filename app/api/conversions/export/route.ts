import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { selectExportableLeads } from '@/lib/conversions/selectLeads';
import { buildConversionsCsv, ensureAfterClick, CONVERSION_TIMEZONE, type ClickIdKind } from '@/lib/conversions/csv';
import type { ConversionSyncStatus } from '@/lib/attribution';

// Exporta as leads com identificador de clique no formato que o Google Ads aceita
// em Ferramentas > Conversões > Importações > Conversões de cliques.
//
//   GET /api/conversions/export?from=2026-07-01&to=2026-08-06
//   GET /api/conversions/export?id=wbraid          (ficheiro separado para iOS)
//   GET /api/conversions/export?status=pending
//   GET /api/conversions/export?dry=1              (pré-visualizar sem marcar nada)
//
// Acesso: sessão do dashboard, ou header `Authorization: Bearer <CONVERSIONS_TOKEN>`
// para automatização. Nunca público — os gclid são dados de negócio.
//
// TODO (Fase 6): substituir o download manual pelo envio directo via Google Ads API
// (UploadClickConversionsRequest com ClickConversion). Só depois de 2-3 semanas a
// validar o fluxo manual, para termos a certeza de que a captura está correcta.

/** Nome EXACTO da acção de conversão no Google Ads. Tem de coincidir, letra a letra. */
const CONVERSION_NAME = process.env.GOOGLE_ADS_CONVERSION_NAME ?? 'Lead Yourbox';
const CURRENCY = 'EUR';

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

async function authorize(req: NextRequest): Promise<boolean> {
  const token = process.env.CONVERSIONS_TOKEN;
  if (token) {
    const header = req.headers.get('authorization') ?? '';
    if (header === `Bearer ${token}`) return true;
  }
  const session = await getServerSession(authOptions);
  return !!session?.user;
}

export async function GET(req: NextRequest) {
  try {
    if (!await authorize(req)) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const sp = new URL(req.url).searchParams;
    const kindRaw = sp.get('id') ?? 'gclid';
    const kind: ClickIdKind = (['gclid', 'wbraid', 'gbraid'].includes(kindRaw) ? kindRaw : 'gclid') as ClickIdKind;
    const statusRaw = sp.get('status');
    const status = (['pending', 'exported', 'uploaded', 'skipped'].includes(statusRaw ?? '')
      ? statusRaw : undefined) as ConversionSyncStatus | undefined;
    const dry = sp.get('dry') === '1';

    const db = await getDb();
    const rows = await selectExportableLeads(db, {
      from: parseDate(sp.get('from')),
      to: parseDate(sp.get('to')),
      status,
      kind,
    });

    // O Google rejeita a linha se a conversão não for posterior ao clique.
    let adjusted = 0;
    const csvRows = rows.map((r) => {
      const t = ensureAfterClick(r.conversionTime, r.clickedAt);
      if (t.getTime() !== r.conversionTime.getTime()) adjusted++;
      return {
        clickId: r.clickId,
        conversionName: CONVERSION_NAME,
        conversionTime: t,
        value: r.value,
        currency: CURRENCY,
      };
    });

    const csv = buildConversionsCsv(csvRows, { kind, timeZone: CONVERSION_TIMEZONE });

    // Marcar como exportado só depois de o ficheiro estar construído — se algo
    // rebentar acima, o estado não se mexe e a exportação pode repetir-se.
    if (!dry && rows.length) {
      const now = new Date();
      const ids = rows.map((r) => new ObjectId(r.leadId));
      await db.collection('messages').updateMany(
        { _id: { $in: ids }, 'conversionSync.status': { $ne: 'uploaded' } },
        { $set: { 'conversionSync.status': 'exported', 'conversionSync.exportedAt': now } },
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="yourbox-conversoes-${kind}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
        // Diagnóstico sem abrir o ficheiro.
        'X-Conversions-Rows': String(rows.length),
        'X-Conversions-Adjusted': String(adjusted),
        'X-Conversions-Reconciled': String(rows.filter((r) => r.matchedBy === 'reconciled').length),
        'X-Conversions-Dry': dry ? '1' : '0',
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
