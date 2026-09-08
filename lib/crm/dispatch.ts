import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { Resend } from 'resend';
import type { CrmCanal, CrmDispatch, CrmPartner, CrmTemplate, EstadoDispatch } from '@/types/crm';
import { sendWhatsAppMessage } from '@/lib/whatsapp/evolution';
import { garantirIndices } from './indices';
import { construir, type ContextoTemplate, type Mensagem } from './templates';
import { podeTransitarDispatch } from './estados';

/**
 * DispatchService (spec §9.5).
 *
 * Interface única: `enviar(parceiro, template, contexto)`. O CRM nunca sabe que canal
 * foi usado — decide-o a política em `escolherCanal()`. Acrescentar SMS ou trocar de
 * BSP passa a ser um adaptador novo neste ficheiro, não uma refactorização do CRM.
 *
 * O registo em `crm_dispatches` é por construção, não por lembrança: o documento é
 * criado ANTES do envio, e é a criação que dá a idempotência. A chave única rejeita o
 * segundo pedido, e o segundo pedido devolve o envio que já existe em vez de mandar
 * outra mensagem — a regra inviolável nº2 da spec §7, que é também o que impede o duplo
 * débito, porque o débito pende do dispatchId.
 *
 * ── Um desvio à spec, deliberado ────────────────────────────────────────────
 *
 * A spec fixa a chave em (consulta_id, partner_id, canal). Falta-lhe o TEMPLATE, e sem
 * ele o sistema não consegue mandar duas mensagens diferentes ao mesmo parceiro sobre a
 * mesma consulta — que é precisamente o que a própria spec pede em dois sítios:
 *
 *   - o aviso de saldo baixo (§9.3) é disparado pela lead que esvaziou a carteira;
 *   - na Linha A, `nova_consulta` e depois `adjudicacao` vão ao mesmo parceiro sobre
 *     a mesma consulta (§8, §9.3).
 *
 * Com a chave da spec, a segunda mensagem seria silenciosamente engolida como se fosse
 * um retry. O template entra na chave para que "não repetir a mesma mensagem" continue
 * a valer sem virar "não mandar mais nenhuma".
 */

const ERRO_DUPLICADO = 11000;

const FROM = process.env.ALERT_FROM_EMAIL ?? 'YourBox <noreply@yourbox.com.pt>';

export interface ResultadoEnvio {
  ok: boolean;
  /** true quando este envio já tinha sido feito — não se envia outra vez. */
  repetido?: boolean;
  dispatchId?: string;
  canal?: CrmCanal;
  erro?: string;
}

// ── Política de canal (spec §9.1 e §9.2) ─────────────────────────────────────

/**
 * Canais que a plataforma sabe entregar hoje. Push e SMS estão previstos na spec para
 * a fase 2; ficam declarados no tipo mas fora desta lista, para que a escolha nunca
 * caia num canal que não existe.
 */
const CANAIS_ACTIVOS: CrmCanal[] = ['whatsapp', 'email'];

/**
 * Primeiro canal preferido do parceiro que esteja activo e para o qual haja contacto.
 *
 * Sem preferência declarada, o WhatsApp vem primeiro: é o que a spec dá como canal de
 * notificação e interacção do MVP, com latência de segundos. O email é o que fica
 * quando não há número — serve de registo formal e nunca falha por falta de janela.
 */
export function escolherCanal(parceiro: CrmPartner): CrmCanal | null {
  return canaisUtilizaveis(parceiro)[0] ?? null;
}

/**
 * Todos os canais por onde este parceiro pode ser alcançado, pela ordem a tentar.
 *
 * A spec desenha uma escada de escalonamento (§9.2) precisamente porque nenhum canal é
 * de confiança sozinho: o WhatsApp é rápido e falha, o email é lento e não falha. Quem
 * chama isto tenta o primeiro e desce a escada — uma lead não se perde porque a
 * Evolution API esteve em baixo dois minutos.
 *
 * O canal preferido do parceiro vem primeiro; os restantes ficam como rede.
 */
export function canaisUtilizaveis(parceiro: CrmPartner): CrmCanal[] {
  const preferencia = (parceiro.canaisPreferidos ?? []).filter((c) => CANAIS_ACTIVOS.includes(c));
  const ordem = [...preferencia, ...CANAIS_ACTIVOS.filter((c) => !preferencia.includes(c))];

  const out: CrmCanal[] = [];
  for (const canal of ordem) {
    if (out.includes(canal)) continue;
    if (canal === 'whatsapp' && parceiro.telefone?.trim()) out.push('whatsapp');
    if (canal === 'email' && parceiro.email?.trim()) out.push('email');
  }
  return out;
}

// ── Adaptadores ──────────────────────────────────────────────────────────────

type Adaptador = (parceiro: CrmPartner, msg: Mensagem) => Promise<{ ok: boolean; erro?: string }>;

const ADAPTADORES: Record<CrmCanal, Adaptador> = {
  whatsapp: async (parceiro, msg) => {
    const numero = parceiro.telefone?.trim();
    if (!numero) return { ok: false, erro: 'parceiro sem telefone' };
    const ok = await sendWhatsAppMessage(numero, msg.texto);
    return ok ? { ok } : { ok, erro: 'Evolution API recusou o envio' };
  },

  email: async (parceiro, msg) => {
    const para = parceiro.email?.trim();
    if (!para) return { ok: false, erro: 'parceiro sem email' };
    if (!process.env.RESEND_API_KEY) return { ok: false, erro: 'RESEND_API_KEY em falta' };
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const r = await resend.emails.send({ from: FROM, to: [para], subject: msg.assunto, html: msg.html });
      if ((r as any)?.error) return { ok: false, erro: String((r as any).error?.message ?? 'Resend recusou o envio') };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, erro: err?.message ?? 'falha no envio de email' };
    }
  },

  // Fase 2. Declarados para que o tipo continue exaustivo e a falta se veja no log,
  // em vez de o envio desaparecer em silêncio.
  sms:  async () => ({ ok: false, erro: 'canal SMS ainda não implementado (fase 2)' }),
  push: async () => ({ ok: false, erro: 'canal push ainda não implementado (fase 2)' }),
};

// ── Envio ────────────────────────────────────────────────────────────────────

export interface OpcoesEnvio {
  /** Força um canal em vez de deixar a política escolher. Usado por re-tentativas. */
  canal?: CrmCanal;
  /** Prazo de resposta; passa a `expiresAt` e serve os SLA da spec §9.4. */
  expiraEmMinutos?: number;
  /**
   * Quando dado, o débito corre entre a criação do registo e o envio. Devolver `false`
   * cancela o envio e marca o dispatch como falhado — é assim que uma lead nunca sai
   * sem estar paga, nem é paga sem sair.
   */
  antesDeEnviar?: (dispatchId: string) => Promise<{ ok: boolean; erro?: string }>;
}

/**
 * Envia um template a um parceiro e regista o envio.
 *
 * A ordem é deliberada: registar, cobrar, enviar. Se o envio falhar, o chamador tem o
 * `dispatchId` para estornar; se o processo morrer a meio, fica um dispatch em
 * 'enviado' sem mensagem — visível e reconciliável — em vez de uma mensagem sem registo,
 * que não é nem uma coisa nem outra.
 */
export async function enviar(
  db: Db,
  parceiro: CrmPartner,
  template: CrmTemplate,
  ctx: ContextoTemplate,
  opts: OpcoesEnvio = {},
): Promise<ResultadoEnvio> {
  await garantirIndices(db);

  const consultaId = String(ctx.consulta?._id ?? '');
  const partnerId = String(parceiro._id ?? '');
  if (!consultaId || !partnerId) return { ok: false, erro: 'consulta ou parceiro sem id' };

  const canal = opts.canal ?? escolherCanal(parceiro);
  if (!canal) return { ok: false, erro: 'parceiro sem canal utilizável: falta telefone e email' };

  const agora = new Date();
  const doc: Omit<CrmDispatch, '_id'> = {
    consultaId,
    partnerId,
    canal,
    template,
    estado: 'enviado',
    chaveViva: `${consultaId}:${partnerId}:${canal}:${template}`,
    sentAt: null,
    deliveredAt: null,
    seenAt: null,
    respondedAt: null,
    expiresAt: opts.expiraEmMinutos ? new Date(agora.getTime() + opts.expiraEmMinutos * 60_000) : null,
    erro: null,
    createdAt: agora,
    updatedAt: agora,
  };

  let dispatchId: string;
  try {
    const res: any = await db.collection('crm_dispatches').insertOne(doc as any);
    dispatchId = String(res.insertedId);
  } catch (err: any) {
    if (err?.code !== ERRO_DUPLICADO) throw err;

    // O retry chegou a um envio vivo. Devolve-se o que existe, sem mandar nada — é
    // exactamente para isto que a chave única serve.
    const existente: any = await db.collection('crm_dispatches').findOne({ chaveViva: `${consultaId}:${partnerId}:${canal}:${template}` });
    return { ok: true, repetido: true, dispatchId: existente ? String(existente._id) : undefined, canal };
  }

  if (opts.antesDeEnviar) {
    const pronto = await opts.antesDeEnviar(dispatchId);
    if (!pronto.ok) {
      await marcarFalhado(db, dispatchId, pronto.erro ?? 'cancelado antes do envio');
      return { ok: false, dispatchId, canal, erro: pronto.erro };
    }
  }

  // O parceiro entra no contexto para os links assinados saírem por destinatário.
  const msg = construir(template, { ...ctx, parceiro });
  const resultado = await ADAPTADORES[canal](parceiro, msg);

  if (!resultado.ok) {
    await marcarFalhado(db, dispatchId, resultado.erro ?? 'falha no canal');
    return { ok: false, dispatchId, canal, erro: resultado.erro };
  }

  await db.collection('crm_dispatches').updateOne(
    { _id: new ObjectId(dispatchId) as any },
    { $set: { sentAt: new Date(), updatedAt: new Date() } },
  );

  return { ok: true, dispatchId, canal };
}

async function marcarFalhado(db: Db, dispatchId: string, erro: string): Promise<void> {
  await db.collection('crm_dispatches').updateOne(
    { _id: new ObjectId(dispatchId) as any },
    // Apagar a `chaveViva` liberta o canal para nova tentativa. O registo da falha
    // fica — e e assim que se percebe depois que um canal anda mau.
    {
      $set: { estado: 'falhado' as EstadoDispatch, erro, updatedAt: new Date() },
      $unset: { chaveViva: '' },
    } as any,
  );
}

/**
 * Avança o estado de um envio (entregue, visto, aceite, recusado, expirado).
 *
 * Passa pela máquina de estados de propósito: um webhook de leitura que chega depois
 * da recusa não pode fazer o dispatch andar para trás.
 */
export async function marcarEstado(
  db: Db,
  dispatchId: string,
  estado: EstadoDispatch,
): Promise<{ ok: boolean; erro?: string }> {
  const oid = paraOid(dispatchId);
  if (!oid) return { ok: false, erro: 'id inválido' };

  const actual: any = await db.collection('crm_dispatches').findOne({ _id: oid });
  if (!actual) return { ok: false, erro: 'envio não encontrado' };
  if (actual.estado === estado) return { ok: true };
  if (!podeTransitarDispatch(actual.estado, estado)) {
    return { ok: false, erro: `envio em "${actual.estado}" não pode passar a "${estado}"` };
  }

  const agora = new Date();
  const $set: Record<string, unknown> = { estado, updatedAt: agora };
  if (estado === 'entregue') $set.deliveredAt = agora;
  if (estado === 'visto') $set.seenAt = agora;
  if (estado === 'aceite' || estado === 'recusado') $set.respondedAt = agora;

  await db.collection('crm_dispatches').updateOne({ _id: oid }, { $set });
  return { ok: true };
}

/**
 * O envio que conta para este parceiro nesta consulta.
 *
 * Com varias tentativas — WhatsApp falhado, email entregue — o que interessa a quem
 * recusa ou reporta e o que esta vivo — o que ainda tem `chaveViva`. Ordena-se por
 * isso (um campo ausente ordena antes de um texto), e o mais recente desempata.
 */
export async function envioDaConsulta(db: Db, consultaId: string, partnerId: string): Promise<CrmDispatch | null> {
  const docs: any[] = await db.collection('crm_dispatches')
    .find({ consultaId, partnerId })
    .sort({ chaveViva: -1, createdAt: -1 })
    .limit(1)
    .toArray();
  const doc = docs[0];
  return doc ? ({ ...doc, _id: String(doc._id) } as CrmDispatch) : null;
}

export async function enviosDaConsulta(db: Db, consultaId: string): Promise<CrmDispatch[]> {
  const docs: any[] = await db.collection('crm_dispatches').find({ consultaId }).sort({ createdAt: 1 }).toArray();
  return docs.map((d) => ({ ...d, _id: String(d._id) })) as CrmDispatch[];
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
