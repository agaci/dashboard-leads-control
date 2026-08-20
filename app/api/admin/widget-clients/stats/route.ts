import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

/**
 * Apuramento de leads por cliente de widget white-label, para cálculo de comissões.
 *
 * GET /api/admin/widget-clients/stats?month=MM&year=YYYY
 *
 * Conta as leads carimbadas com `widgetClientId` (carimbo posto no momento do registo,
 * ver lib/widget/attribution.ts). Leads anteriores a esse carimbo não aparecem aqui —
 * para o histórico, usar a API pública /api/v1/stats, que ainda tem o fallback por
 * domínio.
 *
 * Preço: discriminado por serviceType (arrasto -> partnerFinalPrice, direto ->
 * priceWithDiscount). Nunca `??` entre os dois: uma lead que mudou de serviço a meio
 * do chat pode ter ambos preenchidos.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1));
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()));

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2020) {
      return Response.json({ error: 'Parâmetros month (1-12) e year inválidos' }, { status: 400 });
    }

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 1);

    const db = await getDb();

    const rows = await db.collection('messages').aggregate([
      {
        $match: {
          companyProvider: 'Yourbox',
          messageType: 'newLead',
          widgetClientId: { $exists: true, $ne: null },
          timeStamp: { $gte: periodStart, $lt: periodEnd },
        },
      },
      {
        $addFields: {
          _price: {
            $cond: [
              { $eq: ['$leadData.serviceType', 'arrasto'] },
              '$leadData.partnerFinalPrice',
              '$leadData.priceWithDiscount',
            ],
          },
        },
      },
      {
        $group: {
          _id: '$widgetClientId',
          name:       { $last: '$widgetClientName' },
          leads:      { $sum: 1 },
          converted:  { $sum: { $cond: [{ $ifNull: ['$clientId', false] }, 1, 0] } },
          withPrice:  { $sum: { $cond: [{ $gt: ['$_price', 0] }, 1, 0] } },
          totalValue: { $sum: { $ifNull: ['$_price', 0] } },
          lastLeadAt: { $max: '$timeStamp' },
        },
      },
      { $sort: { leads: -1 } },
    ]).toArray();

    // Nome actual do cliente (o carimbo guarda o nome à data do registo)
    const ids = rows.map((r: any) => r._id);
    const clients = ids.length
      ? await db.collection('widgetClients')
          .find({ clientId: { $in: ids } }, { projection: { clientId: 1, name: 1, active: 1 } })
          .toArray()
      : [];
    const byId = new Map(clients.map((c: any) => [c.clientId, c]));

    const out = rows.map((r: any) => ({
      clientId:   r._id,
      name:       byId.get(r._id)?.name ?? r.name ?? r._id,
      active:     byId.get(r._id)?.active !== false,
      leads:      r.leads,
      converted:  r.converted,        // leads já ligadas a um cliente do CRM
      withPrice:  r.withPrice,
      totalValue: Math.round((r.totalValue ?? 0) * 100) / 100,
      lastLeadAt: r.lastLeadAt,
    }));

    return Response.json({
      success: true,
      period: { month, year, label: `${String(month).padStart(2, '0')}/${year}` },
      clients: out,
      totals: {
        leads:      out.reduce((a, c) => a + c.leads, 0),
        totalValue: Math.round(out.reduce((a, c) => a + c.totalValue, 0) * 100) / 100,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
