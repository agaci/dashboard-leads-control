import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { Resend } from 'resend';
import type { CrmConsulta } from '@/types/crm';
import { sendWhatsAppMessage } from '@/lib/whatsapp/evolution';
import { lerConfig } from './config';
import { construir } from './templates';

/**
 * Follow-up ao cliente 48h depois da entrega (spec §6.2).
 *
 * A fonte principal de visibilidade, e a única que não depende da boa vontade do
 * parceiro: a lead chegou à YourBox, portanto é a YourBox que pergunta. Uma pergunta,
 * resposta de um toque. A spec espera 25 a 40% de resposta — chega para estatística.
 *
 * Efeito secundário que a spec valoriza e que aqui não é acidente: mantém a YourBox
 * presente na relação com o cliente. Por isso nada nesta mensagem revela que o serviço
 * foi entregue a outra empresa.
 */

const FROM = process.env.ALERT_FROM_EMAIL ?? 'YourBox <noreply@yourbox.com.pt>';

export interface ResumoFollowUp {
  candidatas: number;
  enviados: number;
  falhados: number;
  detalhe: { consultaId: string; canal: string; ok: boolean; erro?: string }[];
}

/**
 * Varre as consultas entregues há mais de 48h e ainda sem toque.
 *
 * O `followUpEnviadoAt` marca-se ANTES do envio: um cron que corra duas vezes por
 * engano manda no máximo uma mensagem a mais por engano — nunca uma enxurrada. Numa
 * mensagem ao cliente, errar por defeito é sempre o lado certo.
 */
export async function correrFollowUp(db: Db, limite = 50): Promise<ResumoFollowUp> {
  const cfg = await lerConfig(db);
  const corte = new Date(Date.now() - cfg.followUpHoras * 3600_000);

  const docs: any[] = await db.collection('crm_consultas').find({
    route: 'lead_sale',
    entregueAt: { $ne: null, $lte: corte },
    followUpEnviadoAt: null,
    estado: { $nin: ['recusada', 'expirada'] },
  }).sort({ entregueAt: 1 }).limit(Math.min(limite, 200)).toArray();

  const resumo: ResumoFollowUp = { candidatas: docs.length, enviados: 0, falhados: 0, detalhe: [] };

  for (const raw of docs) {
    const consulta: CrmConsulta = { ...raw, _id: String(raw._id) };
    const id = String(consulta._id);
    const telefone = consulta.cliente?.telefone?.trim();
    const email = consulta.cliente?.email?.trim();

    if (!telefone && !email) {
      // Sem contacto não há follow-up. Marca-se para não voltar a aparecer no varrimento.
      await marcarEnviado(db, id, 'sem contacto do cliente');
      resumo.detalhe.push({ consultaId: id, canal: 'nenhum', ok: false, erro: 'cliente sem telefone nem email' });
      resumo.falhados++;
      continue;
    }

    await marcarEnviado(db, id);
    const msg = construir('followup_cliente', { consulta });
    let ok = false;
    let erro: string | undefined;
    const canal = telefone ? 'whatsapp' : 'email';

    if (telefone) {
      ok = await sendWhatsAppMessage(telefone, msg.texto).catch(() => false);
      if (!ok) erro = 'Evolution API recusou o envio';
    }
    if (!ok && email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const r = await resend.emails.send({ from: FROM, to: [email], subject: msg.assunto, html: msg.html });
        ok = !(r as any)?.error;
        if (!ok) erro = String((r as any)?.error?.message ?? 'Resend recusou o envio');
      } catch (err: any) {
        erro = err?.message ?? 'falha no envio de email';
      }
    }

    if (ok) resumo.enviados++;
    else resumo.falhados++;
    resumo.detalhe.push({ consultaId: id, canal: telefone && !erro ? canal : email ? 'email' : canal, ok, erro });
  }

  return resumo;
}

async function marcarEnviado(db: Db, consultaId: string, motivo?: string): Promise<void> {
  const oid = paraOid(consultaId);
  if (!oid) return;
  const $set: Record<string, unknown> = { followUpEnviadoAt: new Date(), updatedAt: new Date() };
  if (motivo) $set.followUpNota = motivo;
  await db.collection('crm_consultas').updateOne({ _id: oid as any }, { $set });
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
