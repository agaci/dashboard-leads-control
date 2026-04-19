import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      leadsMonth, leadsAllTime, simsMonth,
      leadsPerDayRaw, leadsPerSourceRaw, leadsPerUrgencyRaw,
      topRoutesRaw, revenueRaw, prevMonthLeads,
      convStats, botStepStats,
    ] = await Promise.all([
      // Leads confirmadas este mês
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox', messageType: 'newLead',
        timeStamp: { $gte: startOfMonth },
      }),
      // Total leads confirmadas
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox', messageType: 'newLead',
      }),
      // Simulações este mês
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox',
        messageType: { $in: ['preLeadSimulation', 'clientSimulation'] },
        timeStamp: { $gte: startOfMonth },
      }),
      // Leads por dia (últimos 30 dias)
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: startOf30Days } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timeStamp' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      // Leads por fonte
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead' } },
        { $group: { _id: '$leadData.source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      // Leads por urgência
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', 'leadData.urgencia': { $exists: true, $ne: null } } },
        { $group: { _id: '$leadData.urgencia', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      // Top rotas
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', 'leadData.origem': { $exists: true } } },
        { $group: {
          _id: { origem: '$leadData.origem', destino: '$leadData.destino' },
          count: { $sum: 1 },
          avgPrice: { $avg: '$leadData.priceWithDiscount' },
        }},
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]).toArray(),
      // Receita estimada este mês
      db.collection('messages').aggregate([
        { $match: { companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: startOfMonth }, 'leadData.priceWithDiscount': { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$leadData.priceWithDiscount' }, avg: { $avg: '$leadData.priceWithDiscount' } } },
      ]).toArray(),
      // Leads mês anterior (para comparação)
      db.collection('messages').countDocuments({
        companyProvider: 'Yourbox', messageType: 'newLead',
        timeStamp: { $gte: startOfPrevMonth, $lt: startOfMonth },
      }),
      // Bot: conversas por estado final
      db.collection('conversations').aggregate([
        { $group: { _id: '$step', count: { $sum: 1 } } },
      ]).toArray(),
      // Bot: step de abandono mais comum (conversas não terminadas)
      db.collection('conversations').aggregate([
        { $match: { step: { $nin: ['LEAD_REGISTERED', 'ESCALATED_TO_HUMAN', 'CLOSED', 'INIT'] } } },
        { $group: { _id: '$step', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]).toArray(),
    ]);

    // Preencher dias sem leads com 0
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      days[key] = 0;
    }
    for (const r of leadsPerDayRaw) days[r._id] = r.count;

    const totalRevMonth = revenueRaw[0]?.total ?? 0;
    const avgLeadValue = revenueRaw[0]?.avg ?? 0;
    const conversionRate = simsMonth + leadsMonth > 0 ? (leadsMonth / (simsMonth + leadsMonth)) * 100 : 0;
    const growthRate = prevMonthLeads > 0 ? ((leadsMonth - prevMonthLeads) / prevMonthLeads) * 100 : null;

    const botCompleted = convStats.find((s: any) => s._id === 'LEAD_REGISTERED')?.count ?? 0;
    const botEscalated = convStats.find((s: any) => s._id === 'ESCALATED_TO_HUMAN')?.count ?? 0;
    const botClosed = convStats.find((s: any) => s._id === 'CLOSED')?.count ?? 0;
    const botTotal = convStats.reduce((a: number, s: any) => a + s.count, 0);

    return Response.json({
      success: true,
      kpis: {
        leadsMonth, leadsAllTime, conversionRate: Math.round(conversionRate),
        totalRevMonth, avgLeadValue, growthRate,
      },
      leadsPerDay: Object.entries(days).map(([date, count]) => ({ date, count })),
      leadsPerSource: leadsPerSourceRaw.map((r: any) => ({ source: r._id ?? 'desconhecida', count: r.count })),
      leadsPerUrgency: leadsPerUrgencyRaw.map((r: any) => ({ urgency: r._id, count: r.count })),
      topRoutes: topRoutesRaw.map((r: any) => ({
        origem: r._id.origem, destino: r._id.destino, count: r.count,
        avgPrice: Math.round((r.avgPrice ?? 0) * 100) / 100,
      })),
      bot: {
        total: botTotal, completed: botCompleted, escalated: botEscalated,
        closed: botClosed, active: botTotal - botCompleted - botEscalated - botClosed,
        topActiveSteps: botStepStats.map((s: any) => ({ step: s._id, count: s.count })),
      },
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, stack: err.stack?.slice(0, 300) }, { status: 500 });
  }
}
