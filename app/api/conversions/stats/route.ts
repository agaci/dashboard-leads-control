import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { selectExportableLeads } from '@/lib/conversions/selectLeads';
import { selectEffectiveConversions } from '@/lib/conversions/selectEffective';

// Números do painel de atribuição (app/dashboard/atribuicao).
//
//   GET /api/conversions/stats?days=30
//
// Serve para responder à única pergunta que importa antes de confiar nisto:
// que percentagem das leads traz mesmo um identificador de clique do Google.

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const sp = new URL(req.url).searchParams;
    const days = Math.min(Math.max(parseInt(sp.get('days') ?? '30', 10) || 30, 1), 90);
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    const to = new Date();

    const db = await getDb();
    const leadFilter = {
      companyProvider: 'Yourbox',
      messageType: 'newLead',
      timeStamp: { $gte: from, $lte: to },
    };

    const [totalLeads, exportable, wbraid, gbraid, efetivas, visitAgg, syncAgg] = await Promise.all([
      db.collection('messages').countDocuments(leadFilter),
      selectExportableLeads(db, { from, to, kind: 'gclid' }),
      selectExportableLeads(db, { from, to, kind: 'wbraid' }),
      selectExportableLeads(db, { from, to, kind: 'gbraid' }),
      // Quizzes abandonados com contacto: conversões que o Google nunca soube que existiam.
      selectEffectiveConversions(db, { from, to, kind: 'gclid' }),

      // De onde vem realmente o tráfego, segundo o que o próprio site capturou.
      db.collection('visits').aggregate([
        { $match: { firstSeen: { $gte: from } } },
        {
          $group: {
            _id: { $ifNull: ['$attribution.utm.source', null] },
            visitas: { $sum: 1 },
            comClickId: {
              $sum: {
                $cond: [
                  { $or: [
                    { $ne: [{ $ifNull: ['$attribution.gclid', null] }, null] },
                    { $ne: [{ $ifNull: ['$attribution.wbraid', null] }, null] },
                    { $ne: [{ $ifNull: ['$attribution.gbraid', null] }, null] },
                  ] },
                  1, 0,
                ],
              },
            },
          },
        },
        { $sort: { visitas: -1 } },
        { $limit: 12 },
      ]).toArray(),

      // Estado de sincronização das leads que têm atribuição própria.
      db.collection('messages').aggregate([
        { $match: { ...leadFilter, conversionSync: { $exists: true } } },
        { $group: { _id: '$conversionSync.status', n: { $sum: 1 } } },
      ]).toArray(),
    ]);

    const clickIds = [...exportable, ...wbraid, ...gbraid];
    const comClickId = new Set(clickIds.map((r) => r.leadId)).size;
    const reconciliadas = clickIds.filter((r) => r.matchedBy === 'reconciled').length;

    const sync: Record<string, number> = { pending: 0, exported: 0, uploaded: 0, skipped: 0 };
    for (const s of syncAgg as any[]) if (s._id && s._id in sync) sync[s._id] = s.n;

    return Response.json({
      success: true,
      periodo: { days, from, to },
      leads: {
        total: totalLeads,
        comClickId,
        semClickId: Math.max(0, totalLeads - comClickId),
        cobertura: totalLeads ? Math.round((comClickId / totalLeads) * 1000) / 10 : 0,
        reconciliadas,
      },
      porTipo: {
        gclid: exportable.length,
        wbraid: wbraid.length,
        gbraid: gbraid.length,
      },
      efetivas: {
        total: efetivas.length,
        telefone: efetivas.filter((e) => e.kind === 'parcial_telefone').length,
        email: efetivas.filter((e) => e.kind === 'parcial_email').length,
        pendentes: efetivas.filter((e) => e.syncStatus === 'pending').length,
      },
      sync,
      pendentes: exportable.filter((r) => r.syncStatus === 'pending').length,
      fontes: (visitAgg as any[]).map((v) => ({
        source: v._id ?? '(directo/orgânico)',
        visitas: v.visitas,
        comClickId: v.comClickId,
      })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
