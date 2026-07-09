import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

function getPeriodDates(period: string): { dateFrom: Date; dateTo: Date; prevFrom: Date; prevTo: Date; days: number } {
  const now = new Date();
  let dateFrom: Date;
  let days: number;

  if (period === 'mes') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    days = now.getDate();
  } else {
    days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    dateFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const duration = now.getTime() - dateFrom.getTime();
  const prevTo   = new Date(dateFrom);
  const prevFrom = new Date(dateFrom.getTime() - duration);

  return { dateFrom, dateTo: now, prevFrom, prevTo, days };
}

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') ?? '30d';
    const { dateFrom, dateTo, prevFrom, prevTo, days } = getPeriodDates(period);

    const db = await getDb();

    const [
      leadsMonth, leadsAllTime, simsMonth,
      leadsPerDayRaw, leadsPerSourceRaw, leadsPerUrgencyRaw,
      topRoutesRaw, revenueRaw, prevPeriodLeads,
      convStats, botStepStats, closeReasonsRaw,
      visitsByVarRaw, quizConvByVarRaw, quizLeadByVarRaw, visitsSinceRaw,
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
      // Leads por dia no período
      db.collection('messages').aggregate([
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
      // Bot: conversas por estado final (all-time)
      db.collection('conversations').aggregate([
        { $group: { _id: '$step', count: { $sum: 1 } } },
      ]).toArray(),
      // Bot: step de abandono mais comum
      db.collection('conversations').aggregate([
        { $match: { step: { $nin: ['LEAD_REGISTERED', 'ESCALATED_TO_HUMAN', 'CLOSED', 'INIT'] } } },
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
      // Visitas por variante (colecção visits)
      db.collection('visits').aggregate([
        { $match: { firstSeen: { $gte: dateFrom, $lte: dateTo } } },
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
      // Data da 1a visita registada (desde quando ha dados de visitas)
      db.collection('visits').aggregate([
        { $group: { _id: null, min: { $min: '$firstSeen' } } },
      ]).toArray(),
    ]);

    // Preencher todos os dias do período com 0
    const daysMap: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(dateTo.getTime() - i * 24 * 60 * 60 * 1000);
      daysMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of leadsPerDayRaw as any[]) daysMap[r._id] = r.count;

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
      return {
        variante: k,
        visits, conversas, leads,
        visitsReliable,
        visitToConv: visitsReliable ? Math.round((conversas / visits) * 1000) / 10 : null,
        convToLead:  conversas > 0 ? Math.round((leads / conversas) * 1000) / 10 : null,
        visitToLead: visitsReliable ? Math.round((leads / visits) * 1000) / 10 : null,
      };
    }).sort((a, b) => b.leads - a.leads);

    const visitsSince: Date | null = (visitsSinceRaw as any[])[0]?.min ?? null;

    // Vencedora: melhor taxa conversa->lead com amostra minima (>= 5 conversas).
    const eligible = variantFunnel.filter((v) => v.conversas >= 5 && v.convToLead != null);
    const bestVariant = eligible.length
      ? eligible.reduce((best, v) => (v.convToLead! > best.convToLead! ? v : best)).variante
      : null;

    return Response.json({
      success: true,
      period,
      kpis: {
        leadsMonth, leadsAllTime, conversionRate: Math.round(conversionRate),
        totalRevMonth, avgLeadValue, growthRate,
      },
      leadsPerDay: Object.entries(daysMap).map(([date, count]) => ({ date, count })),
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
      visitsSince,
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, stack: err.stack?.slice(0, 300) }, { status: 500 });
  }
}
