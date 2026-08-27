import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

/**
 * Emparelhamento entre a lead desta aplicação e a lead gémea da plataforma YourBox.
 *
 * Cada submissão do quiz cria DOIS documentos em `messages`, com um segundo de diferença:
 *
 *   plataforma YourBox   _id Meteor      messageType 'directLeadVariantA'   senderName 'Lead Web *'
 *   esta aplicação       _id ObjectId    messageType 'newLead'              senderName 'Quiz Web'
 *
 * O primeiro nasce do `submitDirectLead` que o quiz das landings chama; o segundo do
 * nosso `quiz-progress`. São o mesmo pedido real.
 *
 * A gestão (leadsMetadata) é partilhada pelas duas plataformas, mas cada lado grava
 * contra o id da SUA lead — e por isso não se viam. Este módulo resolve qual é a lead
 * gémea para que a gestão passe a ser gravada sempre contra a lead da plataforma,
 * ficando visível e editável dos dois lados.
 *
 * O resultado é guardado em `ybLeadId` na nossa lead (e `ybLeadIdChecked` quando não há
 * gémea), para não repetir a procura a cada abertura.
 */

/** Janela curta de propósito: as gémeas nascem com segundos de diferença. Uma janela
 *  larga apanharia dois pedidos distintos da mesma pessoa como se fossem o mesmo. */
const JANELA_MS = 2 * 60 * 1000;

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-9);
const cidade = (s: unknown) => String(s ?? '').split(',')[0].trim().toLowerCase();

/**
 * Id da lead contra o qual a gestão deve ser gravada.
 *
 * Devolve o id da lead da plataforma YourBox quando existe gémea; caso contrário o id
 * da nossa lead (leads da Inbox, por exemplo, não passam pela plataforma). Nunca lança:
 * em caso de erro devolve o id recebido, e a gestão fica do nosso lado como antes.
 */
export async function idDeGestao(db: Db, leadId: string): Promise<string> {
  try {
    // Um id Meteor já é da plataforma: nada a resolver.
    if (!/^[0-9a-f]{24}$/i.test(leadId)) return leadId;

    const nossa: any = await db.collection('messages').findOne(
      { _id: new ObjectId(leadId) },
      { projection: { timeStamp: 1, ybLeadId: 1, ybLeadIdChecked: 1, 'leadData.telefone': 1, 'leadData.origem': 1, 'leadData.destino': 1 } },
    );
    if (!nossa) return leadId;

    if (nossa.ybLeadId) return String(nossa.ybLeadId);      // já emparelhada
    if (nossa.ybLeadIdChecked) return leadId;               // já procurámos e não há

    const tel = soDigitos(nossa.leadData?.telefone);
    const t = nossa.timeStamp ? new Date(nossa.timeStamp).getTime() : null;
    if (tel.length !== 9 || !t) {
      await marcarSemPar(db, leadId);
      return leadId;
    }

    const candidatas = await db.collection('messages').find(
      {
        messageType: 'directLeadVariantA',
        'leadData.telefone': { $in: [tel, Number(tel)] as any },
        timeStamp: { $gte: new Date(t - JANELA_MS), $lte: new Date(t + JANELA_MS) },
      },
      { projection: { timeStamp: 1, 'leadData.origem': 1, 'leadData.destino': 1 } },
    ).limit(5).toArray();

    if (!candidatas.length) {
      await marcarSemPar(db, leadId);
      return leadId;
    }

    // Com mais do que uma candidata, a rota desempata; senão fica a mais próxima no tempo.
    const nossaOrig = cidade(nossa.leadData?.origem);
    const nossaDest = cidade(nossa.leadData?.destino);
    const pontuada = candidatas.map((c: any) => {
      const mesmaRota = cidade(c.leadData?.origem) === nossaOrig && cidade(c.leadData?.destino) === nossaDest;
      return { c, mesmaRota, dt: Math.abs(new Date(c.timeStamp).getTime() - t) };
    }).sort((a, b) => (Number(b.mesmaRota) - Number(a.mesmaRota)) || (a.dt - b.dt));

    const escolhida = String(pontuada[0].c._id);
    await db.collection('messages').updateOne(
      { _id: new ObjectId(leadId) },
      { $set: { ybLeadId: escolhida, ybLeadIdChecked: new Date() } },
    );
    return escolhida;
  } catch {
    return leadId;
  }
}

async function marcarSemPar(db: Db, leadId: string) {
  try {
    await db.collection('messages').updateOne(
      { _id: new ObjectId(leadId) },
      { $set: { ybLeadIdChecked: new Date() } },
    );
  } catch { /* nada a fazer */ }
}

/** Versão em lote para listagens: devolve o id de gestão de cada lead. */
export async function idsDeGestao(db: Db, leadIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of leadIds) out.set(id, await idDeGestao(db, id));
  return out;
}
