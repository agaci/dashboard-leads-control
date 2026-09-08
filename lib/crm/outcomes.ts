import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { CrmOutcome, FonteOutcome } from '@/types/crm';
import { lerConfig } from './config';
import { calcularScore, type Metricas, type ResultadoScore } from './score';

export { calcularScore, SCORE_SEM_HISTORICO } from './score';
export type { Metricas, ResultadoScore, PesosScore } from './score';

/**
 * Triangulação de resultado (spec §6).
 *
 * A YourBox não controla o serviço na Linha B. A visibilidade obtém-se por três fontes
 * independentes, nenhuma suficiente sozinha:
 *
 *   'parceiro'    reporta ganhou/perdeu e o valor — e recusa o que é inválido (§6.1, §6.3)
 *   'cliente'     responde ao follow-up das 48h — a fonte principal (§6.2)
 *   'plataforma'  abertura, tempo até acção, contacto revelado (§6.4)
 *
 * O score que sai daqui não serve para relatórios bonitos: serve para abrir e fechar a
 * torneira de leads (§6.5). É o único mecanismo de controlo que a spec considera real.
 */

export const TIPOS_PARCEIRO = ['ganhou', 'perdeu', 'nao_executado', 'recusa'] as const;
export const TIPOS_CLIENTE = ['resolveu', 'nao_resolveu', 'avaliacao'] as const;
export const TIPOS_PLATAFORMA = ['abriu', 'contacto_revelado', 'sem_accao'] as const;

export interface EntradaOutcome {
  consultaId: string;
  partnerId?: string | null;
  fonte: FonteOutcome;
  tipo: string;
  valorServico?: number | null;
  avaliacao?: number | null;
  motivo?: string;
  /**
   * Quando dada, o resultado só se regista uma vez.
   *
   * Os links de reporte e de follow-up vivem no WhatsApp e no email de outra pessoa:
   * são reabertos, reencaminhados e clicados duas vezes sem intenção nenhuma. Sem esta
   * chave, cada clique contava como uma resposta nova — e a avaliação do cliente pesa
   * 25% no score do parceiro. O mecanismo é o mesmo do resto do CRM: índice único e
   * sparse sobre um só campo (ver lib/crm/indices.ts).
   */
  chaveUnica?: string;
}

export interface ResultadoOutcome {
  outcome: CrmOutcome | null;
  /** true quando esta resposta já tinha sido dada — não é erro, é o segundo clique. */
  repetido: boolean;
}

export async function registarOutcome(db: Db, entrada: EntradaOutcome): Promise<ResultadoOutcome> {
  const doc: Record<string, unknown> = {
    consultaId: entrada.consultaId,
    partnerId: entrada.partnerId ?? null,
    fonte: entrada.fonte,
    tipo: entrada.tipo,
    valorServico: numeroOuNulo(entrada.valorServico),
    avaliacao: avaliacaoValida(entrada.avaliacao),
    motivo: entrada.motivo,
    createdAt: new Date(),
  };
  if (entrada.chaveUnica) doc.chaveUnica = entrada.chaveUnica;

  try {
    const res: any = await db.collection('crm_outcomes').insertOne(doc as any);
    return { outcome: { ...doc, _id: String(res.insertedId) } as unknown as CrmOutcome, repetido: false };
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
    const existente: any = await db.collection('crm_outcomes').findOne({ chaveUnica: entrada.chaveUnica });
    return { outcome: existente ? ({ ...existente, _id: String(existente._id) } as CrmOutcome) : null, repetido: true };
  }
}

export async function outcomesDaConsulta(db: Db, consultaId: string): Promise<CrmOutcome[]> {
  const docs: any[] = await db.collection('crm_outcomes').find({ consultaId }).sort({ createdAt: 1 }).toArray();
  return docs.map((d) => ({ ...d, _id: String(d._id) })) as CrmOutcome[];
}

// ── Score do parceiro ────────────────────────────────────────────────────────

/**
 * Métricas de um parceiro a partir dos envios e resultados registados.
 *
 * A avaliação do cliente NÃO se procura por `partnerId`: o cliente não sabe a quem a
 * lead foi entregue, e por isso o resultado dele nasce ligado à consulta e não ao
 * parceiro. Chega-se a ele pelo caminho longo — as consultas que este parceiro recebeu.
 * Sem isto, a fonte que a spec §6.2 chama principal valia 25% do score no papel e zero
 * na prática, que foi exactamente o que aconteceu até 07/09/2026.
 *
 * Só contam as consultas em que este parceiro foi o ÚNICO a receber. Numa lead partilhada
 * o cliente foi servido por um deles e não há como saber qual — atribuir a avaliação a
 * todos castigaria quem nem chegou a fazer o serviço.
 */
export async function metricasDoParceiro(db: Db, partnerId: string): Promise<Metricas> {
  const [dispatches, outcomes] = await Promise.all([
    db.collection('crm_dispatches').find({ partnerId, template: 'nova_lead' }).toArray() as Promise<any[]>,
    db.collection('crm_outcomes').find({ partnerId }).toArray() as Promise<any[]>,
  ]);

  const entregues = dispatches.filter((d) => d.estado !== 'falhado');
  const leadsRecebidas = entregues.length;
  const reportadas = outcomes.filter((o) => o.fonte === 'parceiro' && o.tipo !== 'recusa').length;
  const recusas = outcomes.filter((o) => o.tipo === 'recusa').length;
  const ganhos = outcomes.filter((o) => o.fonte === 'parceiro' && o.tipo === 'ganhou').length;

  const { avaliacaoMedia, recusasContraditas } = await sinaisDoCliente(
    db, partnerId, [...new Set(entregues.map((d) => String(d.consultaId)))],
  );

  // Tempo até à primeira acção do parceiro sobre o envio: abrir, aceitar ou recusar.
  const tempos = dispatches
    .map((d) => {
      const inicio = d.sentAt ? new Date(d.sentAt).getTime() : null;
      const accao = d.seenAt ?? d.respondedAt;
      return inicio && accao ? (new Date(accao).getTime() - inicio) / 60_000 : null;
    })
    .filter((n): n is number => n !== null && n >= 0);
  const respostaMediaMinutos = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

  return { leadsRecebidas, reportadas, recusas, recusasContraditas, ganhos, avaliacaoMedia, respostaMediaMinutos };
}

/**
 * O que o cliente disse sobre as leads deste parceiro, e as contradições.
 *
 * Uma contradição é o parceiro ter contestado a lead e o cliente ter dito, 48h depois,
 * que o transporte ficou resolvido. Não prova má fé — o cliente pode ter resolvido com
 * outra empresa qualquer — e por isso nada é cobrado automaticamente. Conta-se.
 */
async function sinaisDoCliente(
  db: Db,
  partnerId: string,
  consultaIds: string[],
): Promise<{ avaliacaoMedia: number | null; recusasContraditas: number }> {
  if (!consultaIds.length) return { avaliacaoMedia: null, recusasContraditas: 0 };

  // Exclusividade: só entram as consultas em que este parceiro foi o único destinatário.
  const todos: any[] = await db.collection('crm_dispatches')
    .find({ consultaId: { $in: consultaIds }, estado: { $ne: 'falhado' } }, { projection: { consultaId: 1, partnerId: 1 } } as any)
    .toArray();

  const destinatarios = new Map<string, Set<string>>();
  for (const d of todos) {
    const cid = String(d.consultaId);
    if (!destinatarios.has(cid)) destinatarios.set(cid, new Set());
    destinatarios.get(cid)!.add(String(d.partnerId));
  }
  const exclusivas = consultaIds.filter((cid) => (destinatarios.get(cid)?.size ?? 0) === 1);
  if (!exclusivas.length) return { avaliacaoMedia: null, recusasContraditas: 0 };

  const doCliente: any[] = await db.collection('crm_outcomes')
    .find({ consultaId: { $in: exclusivas }, fonte: 'cliente' })
    .toArray();

  const notas = doCliente.map((o) => Number(o.avaliacao)).filter((n) => isFinite(n) && n >= 1 && n <= 5);
  const avaliacaoMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;

  const recusadas = new Set(
    (await db.collection('crm_outcomes')
      .find({ consultaId: { $in: exclusivas }, partnerId, tipo: 'recusa' }, { projection: { consultaId: 1 } } as any)
      .toArray())
      .map((o: any) => String(o.consultaId)),
  );
  const recusasContraditas = doCliente
    .filter((o) => o.tipo === 'resolveu' && recusadas.has(String(o.consultaId)))
    .length;

  return { avaliacaoMedia, recusasContraditas };
}

/** Recalcula e grava o score. Chamado depois de cada resultado novo. */
export async function actualizarScore(db: Db, partnerId: string): Promise<ResultadoScore> {
  const cfg = await lerConfig(db);
  const metricas = await metricasDoParceiro(db, partnerId);
  const resultado = calcularScore(metricas, cfg.pesosScore);

  const oid = paraOid(partnerId);
  if (oid) {
    await db.collection('crm_partners').updateOne(
      { _id: oid as any },
      { $set: { score: resultado.score, updatedAt: new Date() } },
    );
  }
  return resultado;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, isFinite(v) ? v : 0));
}

/**
 * "Não indicado" tem de ficar `null`, nunca zero.
 *
 * `Number(null)` é 0, e sem esta guarda um parceiro que reporta ter fechado o serviço
 * sem dizer o valor aparecia no dashboard a declarar 0.00 EUR — que é afirmar uma coisa
 * falsa a partir da ausência de informação.
 */
function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : null;
}

function avaliacaoValida(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
