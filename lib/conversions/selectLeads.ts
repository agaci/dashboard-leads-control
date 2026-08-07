import type { Db } from 'mongodb';
import { normalizePhone, type ConversionSyncStatus } from '@/lib/attribution';
import type { ClickIdKind } from '@/lib/conversions/csv';
import { CONVERSION_VALUE } from '@/lib/conversions/values';

// ============================================================================
// Selecção das leads exportáveis para o Google Ads.
//
// Uma lead chega aqui por dois caminhos:
//
//  1. DIRECTO — a lead já tem `attribution` porque foi este projecto a criá-la
//     (quiz e bot). É o caminho fiável.
//
//  2. RECONCILIADO — a lead foi criada pela plataforma antiga, que não conhece o
//     gclid. O site enviou-nos a atribuição em paralelo, indexada pelo telemóvel
//     (colecção `attributions`), e casamo-la aqui por telemóvel + janela temporal.
//
// Ver a auditoria em prompt-gclid-conversoes-offline.md para o porquê dos dois.
// ============================================================================

/** A conversão do Google não pode ter mais de 90 dias. Margem de 1 dia para o upload. */
export const CONVERSION_WINDOW_DAYS = 89;

/** Quanto antes da lead aceitamos um beacon de atribuição como sendo da mesma pessoa. */
const MATCH_BEFORE_MS = 6 * 3600 * 1000;
/** E quanto depois (o beacon dispara antes da lead, mas as máquinas derivam). */
const MATCH_AFTER_MS = 1 * 3600 * 1000;

export type SelectedLead = {
  leadId: string;
  clickId: string;
  clickIdKind: ClickIdKind;
  clickedAt: Date | null;
  conversionTime: Date;
  /** Valor reportado ao Google — escala de qualidade, não receita. */
  value: number;
  /** Preço cotado à lead, só para diagnóstico no painel. */
  quotedPrice: number;
  variante: string | null;
  utmSource: string | null;
  phone: string | null;
  /** Como é que esta lead ganhou atribuição. */
  matchedBy: 'direct' | 'reconciled';
  syncStatus: ConversionSyncStatus;
};

export type SelectOptions = {
  from?: Date;
  to?: Date;
  /** Filtra por estado de sincronização. Omitido = tudo menos 'uploaded'. */
  status?: ConversionSyncStatus;
  kind?: ClickIdKind;
  limit?: number;
};

/**
 * Preço cotado à lead. Já não vai para o Google como valor de conversão — ver
 * lib/conversions/values.ts — mas continua a ser lido para diagnóstico no painel.
 *
 * Discriminação explícita por serviceType: `partnerFinalPrice` e `priceWithDiscount`
 * podem estar ambos preenchidos quando a lead mudou de serviço a meio da conversa,
 * e o `??` entre os dois daria o preço errado.
 */
function leadPrice(leadData: any): number {
  const raw = leadData?.serviceType === 'arrasto'
    ? leadData?.partnerFinalPrice
    : leadData?.priceWithDiscount;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pickClickId(attr: any, kind: ClickIdKind): string | null {
  const v = attr?.[kind];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * O Google envia com frequência gclid E gbraid no mesmo URL (visto nos dados reais:
 * `?gad_source=1&gad_campaignid=...&gbraid=...&gclid=...`). Como exportamos um
 * ficheiro por tipo de identificador, uma lead com ambos sairia em dois ficheiros e
 * o Google contaria a conversão duas vezes.
 *
 * Regra: havendo gclid, é o gclid que manda. Os identificadores de iOS só entram
 * quando não há gclid nenhum — que é precisamente o caso para que existem.
 */
function belongsToFile(attr: any, kind: ClickIdKind): boolean {
  if (!pickClickId(attr, kind)) return false;
  if (kind === 'gclid') return true;
  return !pickClickId(attr, 'gclid');
}

export async function selectExportableLeads(db: Db, opts: SelectOptions = {}): Promise<SelectedLead[]> {
  const kind = opts.kind ?? 'gclid';
  const limit = Math.min(opts.limit ?? 5000, 20000);

  const windowStart = new Date(Date.now() - CONVERSION_WINDOW_DAYS * 24 * 3600 * 1000);
  const from = opts.from && opts.from > windowStart ? opts.from : windowStart;
  const to = opts.to ?? new Date();

  const filter: Record<string, unknown> = {
    companyProvider: 'Yourbox',
    messageType: 'newLead',
    timeStamp: { $gte: from, $lte: to },
  };

  if (opts.status) {
    filter['conversionSync.status'] = opts.status;
  } else {
    // Por omissão, nunca reenviar o que o Google já confirmou.
    filter['conversionSync.status'] = { $ne: 'uploaded' };
  }

  const leads = await db.collection('messages')
    .find(filter, {
      projection: {
        _id: 1, timeStamp: 1, variante: 1, attribution: 1, conversionSync: 1,
        'leadData.telefone': 1, 'leadData.serviceType': 1,
        'leadData.partnerFinalPrice': 1, 'leadData.priceWithDiscount': 1,
      },
    })
    .sort({ timeStamp: -1 })
    .limit(limit)
    .toArray();

  // ── Reconciliação: quem não tem atribuição própria pode ter um beacon nosso ──
  const needMatch = leads.filter((l: any) => !belongsToFile(l.attribution, kind));
  const phones = Array.from(
    new Set(needMatch.map((l: any) => normalizePhone(l.leadData?.telefone)).filter(Boolean)),
  ) as string[];

  const byPhone = new Map<string, any[]>();
  if (phones.length) {
    const cands = await db.collection('attributions')
      .find({ phone: { $in: phones }, createdAt: { $gte: new Date(from.getTime() - MATCH_BEFORE_MS) } })
      .sort({ createdAt: -1 })
      .toArray();
    for (const c of cands as any[]) {
      const arr = byPhone.get(c.phone) ?? [];
      arr.push(c);
      byPhone.set(c.phone, arr);
    }
  }

  const out: SelectedLead[] = [];

  for (const l of leads as any[]) {
    const conversionTime: Date = l.timeStamp instanceof Date ? l.timeStamp : new Date(l.timeStamp);
    if (isNaN(conversionTime.getTime())) continue;

    const phone = normalizePhone(l.leadData?.telefone);
    let attr = l.attribution ?? null;
    let matchedBy: 'direct' | 'reconciled' = 'direct';

    if (!belongsToFile(attr, kind)) {
      // Tem o identificador deste ficheiro mas também tem gclid: sai no ficheiro
      // do gclid, não neste. Não é candidata a reconciliação — já está atribuída.
      if (pickClickId(attr, kind)) continue;

      if (!phone) continue;
      const cand = (byPhone.get(phone) ?? []).find((c) => {
        if (!belongsToFile(c.attribution, kind)) return false;
        const t = (c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)).getTime();
        return t >= conversionTime.getTime() - MATCH_BEFORE_MS
            && t <= conversionTime.getTime() + MATCH_AFTER_MS;
      });
      if (!cand) continue;
      attr = cand.attribution;
      matchedBy = 'reconciled';
    }

    const clickId = pickClickId(attr, kind);
    if (!clickId) continue;

    const clickedAtRaw = attr?.clickedAt;
    const clickedAt = clickedAtRaw ? new Date(clickedAtRaw) : null;

    out.push({
      leadId: String(l._id),
      clickId,
      clickIdKind: kind,
      clickedAt: clickedAt && !isNaN(clickedAt.getTime()) ? clickedAt : null,
      conversionTime,
      value: CONVERSION_VALUE.lead,
      quotedPrice: leadPrice(l.leadData),
      variante: l.variante ?? null,
      utmSource: attr?.utm?.source ?? null,
      phone,
      matchedBy,
      syncStatus: (l.conversionSync?.status as ConversionSyncStatus) ?? 'pending',
    });
  }

  // Um mesmo clique não deve gerar duas conversões: se a pessoa submeteu duas
  // vezes, fica a primeira lead. Evita inflacionar a contagem no Google Ads.
  const seen = new Set<string>();
  const deduped: SelectedLead[] = [];
  for (const r of [...out].sort((a, b) => a.conversionTime.getTime() - b.conversionTime.getTime())) {
    if (seen.has(r.clickId)) continue;
    seen.add(r.clickId);
    deduped.push(r);
  }

  return deduped;
}
