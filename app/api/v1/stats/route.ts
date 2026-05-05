import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) {
      return Response.json({ error: 'Token em falta. Use: Authorization: Bearer <token>' }, { status: 401, headers: CORS });
    }

    const db = await getDb();
    const widgetClient = await db.collection('widgetClients').findOne({ secretToken: token });
    if (!widgetClient) {
      return Response.json({ error: 'Token inválido' }, { status: 401, headers: CORS });
    }
    if (!widgetClient.active) {
      return Response.json({ error: 'Cliente inactivo' }, { status: 403, headers: CORS });
    }

    // ── Período ───────────────────────────────────────────────────────────────
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1));
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()));

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2020) {
      return Response.json({ error: 'Parâmetros month (1-12) e year inválidos' }, { status: 400, headers: CORS });
    }

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 1);

    // ── Domínios do cliente ───────────────────────────────────────────────────
    const origins: string[] = (widgetClient.allowedOrigins ?? []).filter((o: string) => o !== '*');
    if (origins.length === 0) {
      return Response.json({
        error: 'Sem domínios específicos configurados. Configure os domínios permitidos no gestor de widgets para activar as estatísticas.',
      }, { status: 422, headers: CORS });
    }

    // ── Query leads (colecção messages) ───────────────────────────────────────
    const leadsFilter = {
      companyProvider: 'Yourbox',
      messageType: 'newLead',
      'leadData.source': { $in: origins },
      timeStamp: { $gte: periodStart, $lt: periodEnd },
    };

    const leadDocs = await db.collection('messages')
      .find(leadsFilter)
      .sort({ timeStamp: -1 })
      .toArray();

    // ── Query conversas ───────────────────────────────────────────────────────
    const convsFilter = {
      'data.source': { $in: origins },
      createdAt: { $gte: periodStart, $lt: periodEnd },
    };

    const convDocs = await db.collection('conversations')
      .find(convsFilter, { projection: { history: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    // ── Agregar leads ─────────────────────────────────────────────────────────
    let totalValue = 0;
    let countWithPrice = 0;
    const byServiceType: Record<string, { count: number; totalValue: number }> = {
      direto: { count: 0, totalValue: 0 },
      arrasto: { count: 0, totalValue: 0 },
      internacional: { count: 0, totalValue: 0 },
    };

    const leadsOut = leadDocs.map((d: any) => {
      const ld = d.leadData ?? {};
      const price = ld.priceWithDiscount ?? ld.partnerFinalPrice ?? null;
      if (price != null) { totalValue += price; countWithPrice++; }

      const svcType = ld.serviceType ?? 'direto';
      if (!byServiceType[svcType]) byServiceType[svcType] = { count: 0, totalValue: 0 };
      byServiceType[svcType].count++;
      if (price != null) byServiceType[svcType].totalValue += price;

      return {
        id:          d._id.toString(),
        date:        d.timeStamp,
        name:        ld.nome ?? null,
        phone:       ld.telefone ?? null,
        email:       ld.email ?? null,
        route:       ld.origem && ld.destino ? `${ld.origem} → ${ld.destino}` : null,
        vehicle:     ld.viatura ?? null,
        urgency:     ld.urgencia ?? null,
        serviceType: svcType,
        price:       price,
        source:      ld.source ?? null,
        converted:   ld.converted ?? false,
        clientId:    d.clientId ?? null,
        variante:    d.variante ?? null,
      };
    });

    // ── Agregar conversas ─────────────────────────────────────────────────────
    const convStats = { total: 0, active: 0, escalated: 0, leadRegistered: 0, closed: 0, other: 0 };
    const convsOut = convDocs.map((c: any) => {
      convStats.total++;
      if (c.step === 'LEAD_REGISTERED')     convStats.leadRegistered++;
      else if (c.step === 'ESCALATED_TO_HUMAN') convStats.escalated++;
      else if (c.step === 'CLOSED')         convStats.closed++;
      else                                   convStats.active++;

      const cd = c.data ?? {};
      const price = cd.priceWithDiscount ?? cd.partnerFinalPrice ?? null;
      return {
        id:      c._id.toString(),
        date:    c.createdAt,
        step:    c.step,
        canal:   c.canal ?? null,
        name:    cd.nome ?? null,
        phone:   c.telemovel ?? null,
        route:   cd.origem && cd.destino ? `${cd.origem} → ${cd.destino}` : null,
        price:   price,
        source:  cd.source ?? null,
      };
    });

    // ── Resposta ──────────────────────────────────────────────────────────────
    return Response.json({
      success: true,
      client:  widgetClient.name,
      domains: origins,
      period:  { month, year, label: `${String(month).padStart(2, '0')}/${year}` },
      summary: {
        leads: {
          total:        leadsOut.length,
          withPrice:    countWithPrice,
          totalValue:   Math.round(totalValue * 100) / 100,
          avgValue:     countWithPrice > 0 ? Math.round((totalValue / countWithPrice) * 100) / 100 : 0,
        },
        conversations: convStats,
        byServiceType,
      },
      leads:         leadsOut,
      conversations: convsOut,
    }, { headers: CORS });

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
