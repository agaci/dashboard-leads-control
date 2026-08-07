import type { Db } from 'mongodb';
import type { ClickIdKind } from '@/lib/conversions/csv';
import { CONVERSION_VALUE, type ConversionKind } from '@/lib/conversions/values';
import type { ConversionSyncStatus } from '@/lib/attribution';

// ============================================================================
// Leads efectivas — quiz abandonado a meio, mas com contacto deixado.
//
// Estas conversas nunca chegam a `messages`, porque o visitante não concluiu o
// quiz. Mas deixou nome e telefone (ou email), é contactado pela equipa como
// qualquer outra lead, e fecha na mesma proporção. Do ponto de vista do negócio
// são conversões; o Google Ads é que nunca soube delas.
//
// São mais 80 conversões por mês sobre as ~376 completas — mais 21% de sinal para
// um algoritmo de lances que precisa de volume para funcionar.
//
// O conceito de "lead efectiva" não é novo no projecto: o balanceador de variantes
// já pondera telefone e email em lib/autobalance/advisor.ts. Aqui aplica-se a
// mesma ideia à medição publicitária.
// ============================================================================

export type EffectiveConversion = {
  convId: string;
  clickId: string;
  clickIdKind: ClickIdKind;
  clickedAt: Date | null;
  /** Momento em que a conversa parou — é quando o contacto ficou disponível. */
  conversionTime: Date;
  value: number;
  kind: ConversionKind;
  variante: string | null;
  syncStatus: ConversionSyncStatus;
};

export type SelectEffectiveOptions = {
  from?: Date;
  to?: Date;
  status?: ConversionSyncStatus;
  kind?: ClickIdKind;
  /** Deixar de fora as que só têm email. Por omissão entram todas. */
  apenasTelefone?: boolean;
  limit?: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function temTelefone(v: unknown): boolean {
  return String(v ?? '').replace(/\D/g, '').length >= 9;
}

function temEmail(v: unknown): boolean {
  return EMAIL_RE.test(String(v ?? '').trim());
}

function pickClickId(attr: any, kind: ClickIdKind): string | null {
  const v = attr?.[kind];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Havendo gclid, é o gclid que manda — senão a mesma conversa sairia em dois ficheiros. */
function belongsToFile(attr: any, kind: ClickIdKind): boolean {
  if (!pickClickId(attr, kind)) return false;
  if (kind === 'gclid') return true;
  return !pickClickId(attr, 'gclid');
}

export async function selectEffectiveConversions(
  db: Db,
  opts: SelectEffectiveOptions = {},
): Promise<EffectiveConversion[]> {
  const kind = opts.kind ?? 'gclid';
  const limit = Math.min(opts.limit ?? 5000, 20000);
  const from = opts.from ?? new Date(Date.now() - 89 * 24 * 3600 * 1000);
  const to = opts.to ?? new Date();

  const filter: Record<string, unknown> = {
    canal: 'web-quiz',
    updatedAt: { $gte: from, $lte: to },
    attribution: { $exists: true },
    // Quem concluiu já vai pela via das leads completas — não contar duas vezes.
    leadId: { $exists: false },
    step: { $ne: 'LEAD_REGISTERED' },
  };

  filter['conversionSync.status'] = opts.status ?? { $ne: 'uploaded' };

  const convs = await db.collection('conversations')
    .find(filter, {
      projection: {
        _id: 1, updatedAt: 1, createdAt: 1, quizVariante: 1, attribution: 1,
        conversionSync: 1, 'data.telefone': 1, 'data.email': 1,
      },
    })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  const out: EffectiveConversion[] = [];

  for (const c of convs as any[]) {
    if (!belongsToFile(c.attribution, kind)) continue;
    const clickId = pickClickId(c.attribution, kind);
    if (!clickId) continue;

    const telefone = temTelefone(c.data?.telefone);
    const email = temEmail(c.data?.email);
    if (!telefone && !email) continue;
    if (opts.apenasTelefone && !telefone) continue;

    // Telefone tem precedência: quem deixou os dois é contactável pelo canal forte.
    const kindConv: ConversionKind = telefone ? 'parcial_telefone' : 'parcial_email';

    const conversionTime = new Date(c.updatedAt ?? c.createdAt);
    if (isNaN(conversionTime.getTime())) continue;

    const clickedAtRaw = c.attribution?.clickedAt;
    const clickedAt = clickedAtRaw ? new Date(clickedAtRaw) : null;

    out.push({
      convId: String(c._id),
      clickId,
      clickIdKind: kind,
      clickedAt: clickedAt && !isNaN(clickedAt.getTime()) ? clickedAt : null,
      conversionTime,
      value: CONVERSION_VALUE[kindConv],
      kind: kindConv,
      variante: c.quizVariante ?? null,
      syncStatus: (c.conversionSync?.status as ConversionSyncStatus) ?? 'pending',
    });
  }

  return out;
}
