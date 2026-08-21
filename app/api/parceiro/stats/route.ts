import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { loadCommissionConfig, computeServices, usesMargin } from '@/lib/commissions/calc';

/**
 * Dados do portal do parceiro de widget (`/parceiro`).
 *
 * Autenticação: `Authorization: Bearer <secretToken>` — o mesmo token do gestor de
 * widgets, revogável ali pelo botão "Regenerar".
 *
 * SEM DADOS PESSOAIS. O parceiro é uma entidade distinta da YourBox e as leads são
 * contactos de terceiros: devolvem-se contagens, rotas e valores, nunca nome, telemóvel
 * ou email de uma lead ou de um cliente final.
 *
 * Comissões: quem as calcula é a plataforma YourBox. Aqui somam-se os serviços
 * executados atribuídos ao comissionista do parceiro e aplica-se a percentagem, para
 * conferência.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return Response.json({ error: 'Token em falta' }, { status: 401 });

    const db = await getDb();
    const w = await db.collection('widgetClients').findOne({ secretToken: token });
    if (!w) return Response.json({ error: 'Token inválido' }, { status: 401 });
    if (w.active === false) return Response.json({ error: 'Widget inactivo' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1));
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()));
    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2020) {
      return Response.json({ error: 'Período inválido' }, { status: 400 });
    }
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 1);

    // ── Leads angariadas pelo widget (só contagens e totais) ─────────────────
    const leadDocs = await db.collection('messages').find(
      {
        companyProvider: 'Yourbox',
        messageType: 'newLead',
        widgetClientId: w.clientId,
        timeStamp: { $gte: periodStart, $lt: periodEnd },
      },
      { projection: { leadData: 1, clientId: 1 } },
    ).limit(1000).toArray();

    let quoted = 0;
    let converted = 0;
    for (const d of leadDocs as any[]) {
      const ld = d.leadData ?? {};
      // Preço por tipo de serviço (nunca ?? entre os dois: podem coexistir)
      const price = ld.serviceType === 'arrasto' ? ld.partnerFinalPrice : ld.priceWithDiscount;
      if (typeof price === 'number') quoted += price;
      if (d.clientId) converted++;
    }

    // ── Conversas iniciadas (funil antes da lead) ────────────────────────────
    const started = await db.collection('conversations').countDocuments({
      $or: [{ widgetClientId: w.clientId }, { 'data.widgetClientId': w.clientId }],
      createdAt: { $gte: periodStart, $lt: periodEnd },
    });

    // ── Clientes angariados (acumulado, não só do período) ───────────────────
    const clientsWon = await db.collection('clients').countDocuments({ widgetClientId: w.clientId });

    // ── Serviços facturados e comissão (plataforma YourBox) ──────────────────
    // Detalhe linha a linha do valor do mês: cada serviço executado atribuído ao
    // comissionista deste parceiro, com o cliente que o pediu e a comissão respectiva.
    let commission: any = null;
    let services: any[] = [];
    if (w.commissionUserName) {
      // Configuração em vigor: serverSettings da YourBox, com override do parceiro
      const cfg = await loadCommissionConfig(db, {
        commissionPercentage:      w.commissionPercentage ?? null,
        commissionModel:           w.commissionModel ?? null,
        commissionMarginBase:      w.commissionMarginBase ?? null,
        referenceProfitPercentage: w.referenceProfitPercentage ?? null,
      });

      const docs = await db.collection('servicesHistory').find(
        {
          'parameters.commissionUser': w.commissionUserName,
          status: 'executed',
          timestamp: { $gte: periodStart, $lt: periodEnd },
        },
        { projection: { timestamp: 1, nr: 1, clientName: 1, client: 1, price: 1, driverPrice: 1, 'usersClient.clientKey': 1 } },
        // Totais derivados desta mesma lista, para que o resumo e o detalhe nunca
        // divirjam. O limite é folgado: nenhum parceiro chega perto num só mês.
      ).sort({ timestamp: -1 }).limit(3000).toArray();

      const computed = computeServices(docs as any, cfg, year, month);

      let billed = 0;
      let amount = 0;
      const clientes = new Set<string>();
      services = computed
        .filter((s) => s.price > 0 || s.commission > 0) // pernas sem venda não interessam ao parceiro
        .map((s) => {
          billed += s.price;
          amount += s.commission;
          if (s.clientId) clientes.add(s.clientId);
          return {
            date:       s.date,
            nr:         s.nr,
            client:     s.client,
            price:      Math.round(s.price * 100) / 100,
            commission: Math.round(s.commission * 100) / 100,
            margin:     s.margin === null ? null : Math.round(s.margin * 1000) / 10, // em %
            grouped:    s.groupedNrs.length,
          };
        });

      commission = {
        services:   services.length,
        clients:    clientes.size,
        billed:     Math.round(billed * 100) / 100,
        percentage: cfg.rate,
        amount:     Math.round(amount * 100) / 100,
        // Para o portal poder explicar ao parceiro sobre o que está a receber
        model:           usesMargin(cfg, year, month) ? 'margin' : 'fixed',
        marginBase:      cfg.marginBase,
        referenceMargin: cfg.referenceMargin,
      };
    }

    return Response.json({
      success: true,
      partner: w.name,
      period:  { month, year, label: `${String(month).padStart(2, '0')}/${year}` },
      funnel:  {
        started,
        leads:     leadDocs.length,
        converted,
        quoted:    Math.round(quoted * 100) / 100,
        clientsWon,
      },
      services,
      commission,
      commissionLinked: !!w.commissionUserName,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
