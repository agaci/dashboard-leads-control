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

    // ── Serviços facturados e comissão (dados da plataforma YourBox) ──────────
    // O parceiro do widget é inscrito na YourBox como comissionista. Os clientes que
    // ele angaria ficam com users.profile.commissionUser = <nome do parceiro>, e cada
    // serviço desses clientes copia esse nome para parameters.commissionUser. Aqui só
    // lemos: quem calcula a comissão é a plataforma YourBox.
    const allWidgets = await db.collection('widgetClients')
      .find({}, { projection: { clientId: 1, name: 1, active: 1, commissionUserName: 1, commissionPercentage: 1 } })
      .toArray();

    const defaultPct: number = (await db.collection('serverSettings')
      .findOne({ commissionPercentage: { $exists: true } }, { projection: { commissionPercentage: 1 } })
    )?.commissionPercentage ?? 0.05;

    const commissionByWidget = new Map<string, any>();
    for (const w of allWidgets as any[]) {
      if (!w.commissionUserName) continue;
      const rows = await db.collection('servicesHistory').aggregate([
        {
          $match: {
            'parameters.commissionUser': w.commissionUserName,
            status: 'executed',
            timestamp: { $gte: periodStart, $lt: periodEnd },
          },
        },
        {
          $group: {
            _id: '$client',
            clientName: { $last: '$clientName' },
            services:   { $sum: 1 },
            billed:     { $sum: { $ifNull: ['$price', 0] } },
          },
        },
        { $sort: { billed: -1 } },
      ]).toArray();

      const pct = typeof w.commissionPercentage === 'number' ? w.commissionPercentage : defaultPct;
      const services = rows.reduce((a: number, r: any) => a + r.services, 0);
      const billed   = rows.reduce((a: number, r: any) => a + r.billed, 0);

      commissionByWidget.set(w.clientId, {
        commissionUserName: w.commissionUserName,
        percentage: pct,
        services,
        billed:     Math.round(billed * 100) / 100,
        commission: Math.round(billed * pct * 100) / 100,
        clients: rows.map((r: any) => ({
          userId:   r._id ? String(r._id) : null,
          name:     r.clientName ?? null,
          services: r.services,
          billed:   Math.round(r.billed * 100) / 100,
        })),
      });
    }

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
      commission: commissionByWidget.get(r._id) ?? null,
    }));

    // Parceiros sem leads no periodo mas com servicos facturados na YourBox
    const semLeads = allWidgets
      .filter((w: any) => w.commissionUserName && !out.some((o) => o.clientId === w.clientId))
      .map((w: any) => ({
        clientId: w.clientId, name: w.name, active: w.active !== false,
        leads: 0, converted: 0, withPrice: 0, totalValue: 0, lastLeadAt: null,
        commission: commissionByWidget.get(w.clientId) ?? null,
      }))
      .filter((w: any) => w.commission && w.commission.services > 0);
    out.push(...semLeads);

    return Response.json({
      success: true,
      period: { month, year, label: `${String(month).padStart(2, '0')}/${year}` },
      clients: out,
      totals: {
        leads:       out.reduce((a, c) => a + c.leads, 0),
        totalValue:  Math.round(out.reduce((a, c) => a + c.totalValue, 0) * 100) / 100,
        billed:      Math.round(out.reduce((a, c) => a + (c.commission?.billed ?? 0), 0) * 100) / 100,
        commission:  Math.round(out.reduce((a, c) => a + (c.commission?.commission ?? 0), 0) * 100) / 100,
      },
      defaultCommissionPercentage: defaultPct,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
