import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

// Tipo de aparelho a partir do userAgent (fallback para visitas antigas sem `device`).
function deviceFromUA(ua?: string | null): 'mobile' | 'tablet' | 'desktop' | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobi))/.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/.test(s)) return 'mobile';
  return 'desktop';
}

// Inicio do dia (em Lisboa) do instante dado, como Date UTC.
function lisbonStartOfDay(ref: Date): Date {
  const lisbon = new Date(ref.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const diff = ref.getTime() - lisbon.getTime();
  const midnight = new Date(lisbon.getFullYear(), lisbon.getMonth(), lisbon.getDate(), 0, 0, 0, 0);
  return new Date(midnight.getTime() + diff);
}

const DAY = 24 * 60 * 60 * 1000;

function getPeriodDates(period: string, fromStr?: string | null, toStr?: string | null): { dateFrom: Date; dateTo: Date; prevFrom: Date; prevTo: Date; days: number } {
  const now = new Date();
  let dateFrom: Date;
  let dateTo: Date = now;
  let days: number;

  if (period === 'custom' && fromStr) {
    dateFrom = lisbonStartOfDay(new Date(fromStr + 'T12:00:00'));
    const toBase = toStr ? new Date(toStr + 'T12:00:00') : now;
    dateTo = new Date(lisbonStartOfDay(toBase).getTime() + DAY - 1); // fim do dia `to`
    if (dateTo > now) dateTo = now;
    days = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / DAY));
  } else if (period === 'hoje') {
    dateFrom = lisbonStartOfDay(now);
    dateTo = now;
    days = 1;
  } else if (period === 'ontem') {
    const startToday = lisbonStartOfDay(now);
    dateFrom = new Date(startToday.getTime() - DAY);
    dateTo = new Date(startToday.getTime() - 1);
    days = 1;
  } else if (period === 'mes') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    days = now.getDate();
  } else {
    days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    dateFrom = new Date(now.getTime() - days * DAY);
  }

  const duration = dateTo.getTime() - dateFrom.getTime();
  const prevTo   = new Date(dateFrom);
  const prevFrom = new Date(dateFrom.getTime() - duration);

  return { dateFrom, dateTo, prevFrom, prevTo, days };
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const period = sp.get('period') ?? '30d';
    const { dateFrom, dateTo, prevFrom, prevTo, days } = getPeriodDates(period, sp.get('from'), sp.get('to'));

    // Hoje / Ontem: gráfico por hora (24 baldes) em vez de por dia.
    const hourly = period === 'hoje' || period === 'ontem';

    const db = await getDb();

    // ── Higiene de dados (config; ver VARIANTES_AUTOBALANCE.md §7.5) ──────────
    // Por defeito, a métrica do funil por variante conta só visitas de Portugal
    // (o tráfego estrangeiro/noturno é curioso/bot e não converte -> falseia as taxas).
    const cfgDoc = await db.collection('routingConfig').findOne(
      { _id: 'yourbox_main' as any }, { projection: { autobalance: 1 } },
    );
    const ab = (cfgDoc as any)?.autobalance ?? {};
    const filterPT: boolean = ab.filterPortugalOnly ?? true;
    const visitPT = filterPT ? { 'geo.country': 'Portugal' } : {};
    // Leads efetivas: valor de um contacto capturado sem lead (ver §7.6). Calibrável.
    const alpha: number = typeof ab.alpha === 'number' ? ab.alpha : 0.35; // telemóvel
    const beta: number  = typeof ab.beta  === 'number' ? ab.beta  : 0.20; // só email

    const [
      leadsMonth, leadsAllTime, simsMonth,
      leadsPerDayRaw, leadsPerSourceRaw, leadsPerUrgencyRaw,
      topRoutesRaw, revenueRaw, prevPeriodLeads,
      convStats, botStepStats, closeReasonsRaw,
      visitsByVarRaw, quizConvByVarRaw, quizLeadByVarRaw, quizContactRaw, visitsSinceRaw, deviceRaw,
    ] = await Promise.all([
      // Leads confirmadas no período
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox', messageType: 'newLead',
        timeStamp: { $gte: dateFrom, $lte: dateTo },
      }),
      // Total leads confirmadas (sempre all-time)
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox', messageType: 'newLead',
      }),
      // Simulações no período
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox',
        messageType: { $in: ['preLeadSimulation', 'clientSimulation'] },
        timeStamp: { $gte: dateFrom, $lte: dateTo },
      }),
      // Leads no período. Hoje/Ontem -> buscamos os instantes e agrupamos por hora em
      // JS (o Mongo 3.0 não suporta `timezone` no $dateToString). Restantes -> por dia.
      hourly
        ? db.collection('messages').find(
            { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: dateFrom, $lte: dateTo } },
            { projection: { _id: 0, timeStamp: 1 } },
          ).toArray()
        : db.collection('messages').aggregate([
            { $match: { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timeStamp' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ]).toArray(),
      // Leads por fonte no período
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: dateFrom, $lte: dateTo } } },
        { $group: { _id: '$leadData.source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      // Leads por urgência no período
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: dateFrom, $lte: dateTo }, 'leadData.urgencia': { $exists: true, $ne: null } } },
        { $group: { _id: '$leadData.urgencia', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      // Top rotas no período
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: dateFrom, $lte: dateTo }, 'leadData.origem': { $exists: true } } },
        { $group: {
          _id: { origem: '$leadData.origem', destino: '$leadData.destino' },
          count: { $sum: 1 },
          avgPrice: { $avg: '$leadData.priceWithDiscount' },
        }},
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]).toArray(),
      // Receita estimada no período
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: dateFrom, $lte: dateTo }, 'leadData.priceWithDiscount': { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$leadData.priceWithDiscount' }, avg: { $avg: '$leadData.priceWithDiscount' } } },
      ]).toArray(),
      // Leads período anterior (para comparação)
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox', messageType: 'newLead',
        timeStamp: { $gte: prevFrom, $lt: prevTo },
      }),
      // Bot: conversas por estado (iniciadas no período)
      db.collection('conversations').aggregate([
        { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
        { $group: { _id: '$step', count: { $sum: 1 } } },
      ]).toArray(),
      // Bot: step de abandono mais comum (no período)
      db.collection('conversations').aggregate([
        { $match: { createdAt: { $gte: dateFrom, $lte: dateTo }, step: { $nin: ['LEAD_REGISTERED', 'ESCALATED_TO_HUMAN', 'CLOSED', 'INIT'] } } },
        { $group: { _id: '$step', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]).toArray(),
      // Motivos de fecho no período
      db.collection('conversations').aggregate([
        { $match: { step: { $in: ['CLOSED', 'LEAD_REGISTERED'] }, updatedAt: { $gte: dateFrom, $lte: dateTo }, closeReason: { $ne: null, $exists: true } } },
        { $group: { _id: { reason: '$closeReason', step: '$step' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      // ── Funil por variante: entrada (visita) -> inbox (conversa) -> lead ──
      // Visitas por variante (colecção visits). Higiene: só Portugal (config).
      db.collection('visits').aggregate([
        { $match: { firstSeen: { $gte: dateFrom, $lte: dateTo }, ...visitPT } },
        { $group: { _id: '$variante', count: { $sum: 1 } } },
      ]).toArray(),
      // Conversas de quiz iniciadas por variante (inbox)
      db.collection('conversations').aggregate([
        { $match: { canal: 'web-quiz', createdAt: { $gte: dateFrom, $lte: dateTo } } },
        { $group: { _id: '$quizVariante', count: { $sum: 1 } } },
      ]).toArray(),
      // Conversas de quiz que chegaram a lead por variante
      db.collection('conversations').aggregate([
        { $match: { canal: 'web-quiz', step: 'LEAD_REGISTERED', createdAt: { $gte: dateFrom, $lte: dateTo } } },
        { $group: { _id: '$quizVariante', count: { $sum: 1 } } },
      ]).toArray(),
      // Conversas de quiz (para contar contacto captado SEM lead -> leads efetivas).
      // Mongo 3.0 nao tem $strLenCP/$regex em agregacao -> contamos em JS.
      db.collection('conversations').find(
        { canal: 'web-quiz', createdAt: { $gte: dateFrom, $lte: dateTo } },
        { projection: { quizVariante: 1, step: 1, 'data.telefone': 1, 'data.email': 1 } },
      ).limit(5000).toArray(),
      // Data da 1a visita registada (desde quando ha dados de visitas)
      db.collection('visits').aggregate([
        { $group: { _id: null, min: { $min: '$firstSeen' } } },
      ]).toArray(),
      // Aparelho das visitas no periodo (device gravado; ua p/ derivar registos antigos)
      db.collection('visits').find(
        { firstSeen: { $gte: dateFrom, $lte: dateTo } },
        { projection: { _id: 0, device: 1, ua: 1 } },
      ).limit(20000).toArray(),
    ]);

    // Preencher os baldes do período com 0.
    // Hoje/Ontem -> 24 horas ("00h".."23h"); restantes -> um por dia.
    let leadsPerDay: { date: string; count: number }[];
    if (hourly) {
      const hoursMap: Record<string, number> = {};
      for (let h = 0; h < 24; h++) hoursMap[String(h).padStart(2, '0')] = 0;
      // Hora de Lisboa (lida do instante), robusta a horário de verão/inverno.
      const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false, hourCycle: 'h23' });
      for (const r of leadsPerDayRaw as any[]) {
        const h = hourFmt.format(new Date(r.timeStamp));
        if (h in hoursMap) hoursMap[h]++;
      }
      leadsPerDay = Object.entries(hoursMap).map(([h, count]) => ({ date: `${h}h`, count }));
    } else {
      const daysMap: Record<string, number> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(dateTo.getTime() - i * 24 * 60 * 60 * 1000);
        daysMap[d.toISOString().slice(0, 10)] = 0;
      }
      for (const r of leadsPerDayRaw as any[]) daysMap[r._id] = r.count;
      leadsPerDay = Object.entries(daysMap).map(([date, count]) => ({ date, count }));
    }

    const totalRevMonth   = (revenueRaw as any[])[0]?.total ?? 0;
    const avgLeadValue    = (revenueRaw as any[])[0]?.avg ?? 0;
    const conversionRate  = simsMonth + leadsMonth > 0 ? (leadsMonth / (simsMonth + leadsMonth)) * 100 : 0;
    const growthRate      = prevPeriodLeads > 0 ? ((leadsMonth - prevPeriodLeads) / prevPeriodLeads) * 100 : null;

    const botCompleted = (convStats as any[]).find((s: any) => s._id === 'LEAD_REGISTERED')?.count ?? 0;
    const botEscalated = (convStats as any[]).find((s: any) => s._id === 'ESCALATED_TO_HUMAN')?.count ?? 0;
    const botClosed    = (convStats as any[]).find((s: any) => s._id === 'CLOSED')?.count ?? 0;
    const botTotal     = (convStats as any[]).reduce((a: number, s: any) => a + s.count, 0);

    // ── Funil por variante do quiz ──────────────────────────────────────────
    const visitsByVar: Record<string, number> = {};
    for (const r of visitsByVarRaw as any[]) if (r._id) visitsByVar[String(r._id)] = r.count;
    const convByVar: Record<string, number> = {};
    for (const r of quizConvByVarRaw as any[]) if (r._id) convByVar[String(r._id)] = r.count;
    const leadByVar: Record<string, number> = {};
    for (const r of quizLeadByVarRaw as any[]) if (r._id) leadByVar[String(r._id)] = r.count;

    // Contacto captado SEM lead, por variante (telemóvel vs só email) — leads efetivas.
    const emailReV = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const contactByVar: Record<string, { phone: number; emailOnly: number }> = {};
    for (const c of quizContactRaw as any[]) {
      if (c.step === 'LEAD_REGISTERED') continue; // já é lead, não conta como "captado sem lead"
      const v = c.quizVariante ? String(c.quizVariante) : null;
      if (!v) continue;
      const hasPhone = String(c.data?.telefone ?? '').replace(/\D/g, '').length >= 9;
      const hasEmail = emailReV.test(String(c.data?.email ?? ''));
      const b = (contactByVar[v] ??= { phone: 0, emailOnly: 0 });
      if (hasPhone) b.phone++;
      else if (hasEmail) b.emailOnly++;
    }

    // Só variantes do quiz (o funil visita->inbox->lead aplica-se a estas).
    const quizKeys = Array.from(new Set([
      ...Object.keys(convByVar), ...Object.keys(leadByVar), ...Object.keys(visitsByVar),
    ])).filter((k) => /^QUIZ/i.test(k));

    const variantFunnel = quizKeys.map((k) => {
      const visits = visitsByVar[k] ?? 0;
      const conversas = convByVar[k] ?? 0;
      const leads = leadByVar[k] ?? 0;
      // Nao pode haver menos visitas do que conversas: se acontecer, a recolha de
      // visitas ainda esta incompleta -> nao mostrar taxas baseadas em visitas.
      const visitsReliable = visits >= conversas && visits > 0;
      const cap = contactByVar[k] ?? { phone: 0, emailOnly: 0 };
      const effectiveLeads = Math.round((leads + alpha * cap.phone + beta * cap.emailOnly) * 10) / 10;
      return {
        variante: k,
        visits, conversas, leads,
        capturedPhone: cap.phone, capturedEmailOnly: cap.emailOnly, effectiveLeads,
        visitsReliable,
        visitToConv: visitsReliable ? Math.round((conversas / visits) * 1000) / 10 : null,
        convToLead:  conversas > 0 ? Math.round((leads / conversas) * 1000) / 10 : null,
        visitToLead: visitsReliable ? Math.round((leads / visits) * 1000) / 10 : null,
        visitToEff:  visitsReliable ? Math.round((effectiveLeads / visits) * 1000) / 10 : null,
      };
    }).sort((a, b) => b.leads - a.leads);

    const visitsSince: Date | null = (visitsSinceRaw as any[])[0]?.min ?? null;

    // Distribuição por aparelho
    const deviceBreakdown = { mobile: 0, tablet: 0, desktop: 0, total: 0 };
    for (const v of deviceRaw as any[]) {
      const d = v.device ?? deviceFromUA(v.ua);
      if (d === 'mobile') { deviceBreakdown.mobile++; deviceBreakdown.total++; }
      else if (d === 'tablet') { deviceBreakdown.tablet++; deviceBreakdown.total++; }
      else if (d === 'desktop') { deviceBreakdown.desktop++; deviceBreakdown.total++; }
    }

    // Vencedora (amostra minima >= 5 conversas):
    //  - se as visitas forem fiaveis, usar o funil COMPLETO visita->lead (global),
    //    que capta tambem a etapa visita->conversa;
    //  - senao, cair na taxa de conclusao conversa->lead.
    const MIN_CONV = 5;
    const byGlobal = variantFunnel.filter((v) => v.visitsReliable && v.visitToLead != null && v.conversas >= MIN_CONV);
    let bestVariant: string | null = null;
    let bestMetric: 'visitToLead' | 'convToLead' | null = null;
    if (byGlobal.length) {
      bestVariant = byGlobal.reduce((best, v) => (v.visitToLead! > best.visitToLead! ? v : best)).variante;
      bestMetric = 'visitToLead';
    } else {
      const byConv = variantFunnel.filter((v) => v.conversas >= MIN_CONV && v.convToLead != null);
      if (byConv.length) {
        bestVariant = byConv.reduce((best, v) => (v.convToLead! > best.convToLead! ? v : best)).variante;
        bestMetric = 'convToLead';
      }
    }

    // ── Drop-off por passo (quiz): onde os visitantes abandonam ──────────────
    // Cada conversa web-quiz guarda no history os passos por que passou
    // ({step, stepIndex}). Reconstruímos, por variante, quantos alcançaram cada
    // passo (a partir do índice máximo atingido) e onde caíram. A ordem dos passos
    // é derivada dos próprios dados (moda por índice) — serve qualquer variante.
    const quizConvsRaw = await db.collection('conversations').find(
      { canal: 'web-quiz', createdAt: { $gte: dateFrom, $lte: dateTo } },
      { projection: { quizVariante: 1, step: 1, 'history.step': 1, 'history.stepIndex': 1, 'history.timestamp': 1 } },
    ).limit(5000).toArray();

    type VarAgg = { started: number; completed: number; maxIdxs: number[]; nameAt: Record<number, Record<string, number>>; durations: Record<number, number[]> };
    const byVar: Record<string, VarAgg> = {};
    for (const c of quizConvsRaw as any[]) {
      const vv = c.quizVariante ? String(c.quizVariante) : null;
      if (!vv || !/^QUIZ/i.test(vv)) continue;
      const b = (byVar[vv] ??= { started: 0, completed: 0, maxIdxs: [], nameAt: {}, durations: {} });
      b.started++;
      if (c.step === 'LEAD_REGISTERED') b.completed++;
      let maxIdx = -1;
      const hist = Array.isArray(c.history) ? c.history : [];
      for (const h of hist) {
        const idx = typeof h?.stepIndex === 'number' ? h.stepIndex : -1;
        if (idx < 0) continue;
        if (idx > maxIdx) maxIdx = idx;
        if (h.step) { (b.nameAt[idx] ??= {})[h.step] = (b.nameAt[idx][h.step] ?? 0) + 1; }
      }
      b.maxIdxs.push(maxIdx);
      // Tempo por passo: gaps entre eventos consecutivos (ordenados por timestamp).
      const timed = hist
        .filter((h: any) => typeof h?.stepIndex === 'number' && h?.timestamp)
        .map((h: any) => ({ idx: h.stepIndex as number, t: new Date(h.timestamp).getTime() }))
        .filter((h: any) => !isNaN(h.t))
        .sort((a: any, b2: any) => a.t - b2.t);
      for (let k = 1; k < timed.length; k++) {
        const dt = timed[k].t - timed[k - 1].t;
        if (dt >= 0 && dt < 30 * 60 * 1000) (b.durations[timed[k].idx] ??= []).push(dt);
      }
    }

    const DROPOFF_MIN = 30; // amostra mínima p/ os % e o "maior fuga" serem fiáveis
    const dropoff = Object.entries(byVar).map(([variante, b]) => {
      const maxObserved = b.maxIdxs.reduce((m, x) => Math.max(m, x), -1);
      const nameAt = (i: number): string => {
        const m = b.nameAt[i];
        if (!m) return `passo ${i + 1}`;
        return Object.entries(m).sort((a, c) => c[1] - a[1])[0][0];
      };
      const median = (i: number): number | null => {
        const arr = b.durations[i];
        if (!arr || !arr.length) return null;
        const s = [...arr].sort((a, c) => a - c);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
      };
      const reached = (k: number) => b.maxIdxs.filter((x) => x >= k).length;
      const steps: { index: number; step: string; reached: number; dropped: number; droppedPct: number | null; medianMs: number | null }[] = [];
      for (let k = 0; k <= maxObserved; k++) {
        const r = reached(k);
        const next = k < maxObserved ? reached(k + 1) : b.completed;
        const dropped = Math.max(0, r - next);
        steps.push({ index: k, step: nameAt(k), reached: r, dropped, droppedPct: r > 0 ? Math.round((dropped / r) * 100) : null, medianMs: median(k) });
      }
      return { variante, started: b.started, completed: b.completed, reliable: b.started >= DROPOFF_MIN, steps };
    }).filter((d) => d.steps.length > 0).sort((a, b) => b.started - a.started);

    return Response.json({
      success: true,
      period,
      kpis: {
        leadsMonth, leadsAllTime, conversionRate: Math.round(conversionRate),
        totalRevMonth, avgLeadValue, growthRate,
      },
      leadsPerDay,
      granularity: hourly ? 'hour' : 'day',
      metricFilterPT: filterPT,
      dropoff,
      leadsPerSource:  (leadsPerSourceRaw  as any[]).map((r: any) => ({ source: r._id ?? 'desconhecida', count: r.count })),
      leadsPerUrgency: (leadsPerUrgencyRaw as any[]).map((r: any) => ({ urgency: r._id, count: r.count })),
      topRoutes: (topRoutesRaw as any[]).map((r: any) => ({
        origem: r._id.origem, destino: r._id.destino, count: r.count,
        avgPrice: Math.round((r.avgPrice ?? 0) * 100) / 100,
      })),
      bot: {
        total: botTotal, completed: botCompleted, escalated: botEscalated,
        closed: botClosed, active: botTotal - botCompleted - botEscalated - botClosed,
        topActiveSteps: (botStepStats as any[]).map((s: any) => ({ step: s._id, count: s.count })),
      },
      closeReasons: (closeReasonsRaw as any[]).map((r: any) => ({
        reason: r._id.reason as string,
        step:   r._id.step as string,
        count:  r.count as number,
      })),
      variantFunnel,
      bestVariant,
      bestMetric,
      visitsSince,
      deviceBreakdown,
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, stack: err.stack?.slice(0, 300) }, { status: 500 });
  }
}
