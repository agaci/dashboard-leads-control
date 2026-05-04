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
      convStats, botStepStats,
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
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, stack: err.stack?.slice(0, 300) }, { status: 500 });
  }
}
