import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type {
  CrmCanal, CrmConsulta, CrmConsultaPedido, CrmHistoryEntry, CrmPartner, EstadoConsulta,
} from '@/types/crm';
import { parseNVolumesFromText, parseTotalCm, parseWeightKgFromText } from '@/lib/agent/partnerPricing';
import { normalizar } from './categorias';
import { zonaDaMorada } from './zonas';
import { distritoDaMorada } from './codigosPostais';
import { categoriaDoMaterialBD } from './materiais';
import { cplDaCategoria, lerConfig } from './config';
import { debitar, estornar, lerCarteira, lerCarteirasEmLote } from './carteira';
import { canaisUtilizaveis, enviar, envioDaConsulta, marcarEstado, type ResultadoEnvio } from './dispatch';
import { requisitosDoPedido, type MotivoExclusao } from './capacidades';
import { procurarParceiros } from './procura';
import { podeTransitarDispatch, transicao } from './estados';
import { registarOutcome } from './outcomes';
import { garantirIndices } from './indices';
import { classificarFalha, type SemParceiro } from './procuraNaoServida';
import { limitesDeTabela, triar, type SinaisTriagem } from './triagem';

/**
 * Consultas — o objecto central do CRM (spec §7).
 *
 * Este módulo é o único sítio que escreve em `crm_consultas`, e por isso é o único que
 * precisa de saber a regra inviolável nº1: nada muda de estado sem registo. Todas as
 * escritas de estado passam por `mudarEstado()`, que valida a transição e empurra a
 * entrada de `history` no mesmo `updateOne` — não há caminho que grave um sem o outro.
 */

export interface EntradaConsulta {
  origem: { tipo: 'lead' | 'telefone' | 'email' | 'manual'; leadId?: string; convId?: string };
  cliente: { nome?: string; telefone?: string; email?: string };
  pedido: CrmConsultaPedido;
  /** Texto livre extra para a triagem (mensagens da conversa, notas da operadora). */
  texto?: string;
}

/**
 * Cria a consulta já triada.
 *
 * A consulta nasce em 'nova' e passa logo a 'triada' — são dois estados porque a spec
 * os separa, e a passagem fica no histórico com o motivo da classificação. Assim a
 * pergunta "porque é que esta lead foi para venda?" tem resposta escrita, meses depois.
 */
export async function criarConsulta(db: Db, entrada: EntradaConsulta, actor: string): Promise<CrmConsulta> {
  await garantirIndices(db);

  const limites = await limitesDeTabela(db);
  // A lista de materiais e editavel: e ela que sabe a que categoria pertence uma opcao
  // criada depois de as regras de texto terem sido escritas.
  const categoriaDeclarada = await categoriaDoMaterialBD(db, entrada.pedido.material);
  const sinais: SinaisTriagem = {
    ...entrada.pedido,
    texto: entrada.texto,
    categoriaDeclarada: categoriaDeclarada ?? undefined,
  };
  const resultado = triar(sinais, limites);

  const agora = new Date();
  const historyInicial: CrmHistoryEntry[] = [
    { estado: 'nova', timestamp: agora, actor: actor || 'sistema', motivo: `consulta criada a partir de ${entrada.origem.tipo}` },
    { estado: 'triada', timestamp: agora, actor: 'sistema', motivo: `${resultado.categoria}: ${resultado.motivo} (confiança ${resultado.confianca})` },
  ];

  const doc: Omit<CrmConsulta, '_id'> = {
    route: resultado.route,
    categoria: resultado.categoria,
    estado: 'triada',
    origem: entrada.origem,
    cliente: entrada.cliente ?? {},
    pedido: { ...entrada.pedido, zona: entrada.pedido.zona ?? zonaDaMorada(entrada.pedido.origem, distritoDaMorada) },
    triagem: {
      categoria: resultado.categoria,
      route: resultado.route,
      motivo: resultado.motivo,
      confianca: resultado.confianca,
      at: agora,
    },
    entregueAt: null,
    recusaExpiraEm: null,
    followUpEnviadoAt: null,
    history: historyInicial,
    createdAt: agora,
    updatedAt: agora,
  };

  const res: any = await db.collection('crm_consultas').insertOne(doc as any);
  return { ...doc, _id: String(res.insertedId) };
}

/**
 * Cria uma consulta a partir de uma lead já existente em `messages`.
 *
 * Os campos de carga não estão todos no mesmo sítio: o peso e os volumes tanto podem
 * vir da conversa (pré-preenchidos pelo formulário) como estar enterrados no texto das
 * observações. Reaproveitam-se os parsers do lib/agent/partnerPricing.ts em vez de
 * escrever outros — se a forma como as pessoas escrevem "3 caixas de 20kg" mudar,
 * muda num sítio só.
 */
export async function consultaDeLead(db: Db, leadId: string, actor: string): Promise<CrmConsulta> {
  const lead: any = await db.collection('messages').findOne({ _id: idDeLead(leadId) as any });
  if (!lead) throw new Error('lead não encontrada');

  const jaExiste: any = await db.collection('crm_consultas').findOne({ 'origem.leadId': String(leadId) });
  if (jaExiste) return { ...jaExiste, _id: String(jaExiste._id) } as CrmConsulta;

  const d = lead.leadData ?? {};
  const observacoes = String(d.observacoes ?? '');

  // A conversa, quando existe, tem a carga já estruturada — vale mais do que reparsear.
  const conversa: any = lead.convId
    ? await db.collection('conversations').findOne({ _id: paraOid(String(lead.convId)) as any })
    : null;

  const pedido: CrmConsultaPedido = {
    origem: d.origem ?? undefined,
    destino: d.destino ?? undefined,
    zona: zonaDaMorada(d.origem, distritoDaMorada),
    urgencia: d.urgencia ?? undefined,
    viatura: d.viatura ?? undefined,
    material: d.material ?? undefined,
    weightKg: numeroOuNulo(conversa?.weightKg) ?? parseWeightKgFromText(observacoes),
    nVolumes: numeroOuNulo(conversa?.nVolumes) ?? parseNVolumesFromText(observacoes),
    totalCm: numeroOuNulo(conversa?.totalCm) ?? parseTotalCm(observacoes),
    observacoes: observacoes || undefined,
    // Guardadas no pedido, e nao so usadas de passagem: a consulta e a fonte de verdade
    // e volta a ser triada a partir daqui. Sem isto, a segunda triagem via uma lead mais
    // certa do que a primeira, sem nada ter mudado.
    naoSei: Array.isArray(d.naoSei) ? d.naoSei.map(String) : undefined,
  };

  return criarConsulta(db, {
    origem: { tipo: 'lead', leadId: String(leadId), convId: lead.convId ? String(lead.convId) : undefined },
    cliente: { nome: d.nome, telefone: d.telefone ? String(d.telefone) : undefined, email: d.email },
    pedido,
    texto: [observacoes, conversa?.data?.observacoes].filter(Boolean).join(' '),
  }, actor);
}

export async function lerConsulta(db: Db, id: string): Promise<CrmConsulta | null> {
  const oid = paraOid(id);
  if (!oid) return null;
  const doc: any = await db.collection('crm_consultas').findOne({ _id: oid });
  return doc ? ({ ...doc, _id: String(doc._id) } as CrmConsulta) : null;
}

/** Muda o estado, validando a transição e registando-a. Não há outro caminho. */
export async function mudarEstado(
  db: Db,
  id: string,
  novo: EstadoConsulta,
  actor: string,
  motivo: string,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; erro?: string; consulta?: CrmConsulta }> {
  const consulta = await lerConsulta(db, id);
  if (!consulta) return { ok: false, erro: 'consulta não encontrada' };

  const t = transicao(consulta.route, consulta.estado, novo, actor, motivo);
  if (!t.ok || !t.entrada) return { ok: false, erro: t.erro };

  await db.collection('crm_consultas').updateOne(
    { _id: paraOid(id) as any, estado: consulta.estado },   // guarda contra escrita concorrente
    {
      $set: { estado: novo, updatedAt: t.entrada.timestamp, ...extra },
      $push: { history: t.entrada } as any,
    },
  );

  return { ok: true, consulta: (await lerConsulta(db, id)) ?? undefined };
}

/**
 * Grava na consulta porque e que ela nao foi vendida.
 *
 * E o dado que alimenta o quadro de procura por servir (SPECS-Angariacao-Parceiros §2):
 * sem ele, saber que parceiros faltam e adivinhacao. Antes disto o motivo era calculado,
 * devolvido na resposta HTTP, e perdido.
 *
 * Nunca lanca: falhar a registar o motivo nao pode transformar-se em falhar a responder.
 */
async function marcarSemParceiro(
  db: Db,
  id: string,
  erro: string | undefined,
  elegiveis: number,
  falhados: { motivo: string }[],
): Promise<void> {
  try {
    const { motivo, detalhe } = classificarFalha(erro, elegiveis, falhados);
    const sp: SemParceiro = { em: new Date(), motivo, detalhe, elegiveis };
    await db.collection('crm_consultas').updateOne(
      { _id: paraOid(id) as any },
      { $set: { semParceiro: sp, updatedAt: new Date() } },
    );
  } catch (err: any) {
    console.error('[crm/consultas] falha a registar o motivo de nao venda', id, err?.message ?? err);
  }
}

// ── Distribuição (Linha B) ───────────────────────────────────────────────────

export interface ResultadoDistribuicao {
  ok: boolean;
  erro?: string;
  entregues: { partnerId: string; nome: string; canal: CrmCanal; dispatchId: string; debitado: number }[];
  falhados: { partnerId: string; nome: string; motivo: string }[];
  excluidos: MotivoExclusao[];
  valorLead?: number;
}

/**
 * Entrega a lead aos parceiros elegíveis, cobrando a carteira de cada um.
 *
 * A ordem — registar o envio, debitar, mandar a mensagem — não é arbitrária:
 *
 *   - registar primeiro dá o `dispatchId` a que o débito se agarra, e é o índice único
 *     desse registo que impede o segundo envio quando um retry chega;
 *   - debitar antes de enviar garante que nenhuma lead sai sem estar paga;
 *   - se o canal falhar depois do débito, estorna-se. O parceiro nunca paga uma
 *     mensagem que não recebeu.
 *
 * Um parceiro sem saldo não recebe e não bloqueia os outros: a lead segue para o
 * seguinte da ordem. É a torneira de leads da spec §6.5 a funcionar por si.
 */
export async function distribuir(
  db: Db,
  id: string,
  actor: string,
  opts: { maxParceiros?: number; forcarConfiancaBaixa?: boolean } = {},
): Promise<ResultadoDistribuicao> {
  const vazio = { entregues: [], falhados: [], excluidos: [] };

  const consulta = await lerConsulta(db, id);
  if (!consulta) return { ok: false, erro: 'consulta não encontrada', ...vazio };
  if (consulta.route !== 'lead_sale') {
    return { ok: false, erro: 'só se distribuem leads da Linha B; a Linha A cota por tabela', ...vazio };
  }
  if (!['triada', 'qualificada', 'recusada'].includes(consulta.estado)) {
    return { ok: false, erro: `consulta em "${consulta.estado}" não está por distribuir`, ...vazio };
  }
  // Portão do RGPD. Vem antes de tudo o resto de propósito: nenhuma verificação
  // comercial deve correr sobre uma lead que não pode legalmente sair daqui.
  if (!consulta.consentimento) {
    return {
      ok: false,
      erro: 'sem autorização do cliente para encaminhar o pedido. Registe a autorização antes de distribuir.',
      ...vazio,
    };
  }
  if (consulta.triagem.confianca === 'baixa' && !opts.forcarConfiancaBaixa) {
    return {
      ok: false,
      erro: 'triagem com confiança baixa: a lead deu sinais de mais do que uma categoria. Confirme a categoria antes de distribuir.',
      ...vazio,
    };
  }

  const cfg = await lerConfig(db);
  if (!cfg.active) return { ok: false, erro: 'CRM inactivo na configuração', ...vazio };

  const valorLead = cplDaCategoria(cfg, consulta.categoria);
  if (valorLead <= 0) {
    return { ok: false, erro: `sem CPL definido para "${consulta.categoria}" — defina o preço antes de distribuir`, ...vazio };
  }

  const { elegiveis, excluidos } = await procurarParceiros(db, requisitosDoPedido(consulta.categoria, consulta.pedido));
  if (!elegiveis.length) {
    await marcarSemParceiro(db, id, 'nenhum parceiro cobre esta consulta', 0, []);
    return { ok: false, erro: 'nenhum parceiro cobre esta consulta', entregues: [], falhados: [], excluidos };
  }

  const carteiras = await lerCarteirasEmLote(db, elegiveis.map((e) => String(e.parceiro._id)));
  const recusaram = await parceirosQueRecusaram(db, id);
  const maximo = Math.max(1, opts.maxParceiros ?? cfg.maxParceirosPorLead);

  // 'qualificada' antes de sair: se o processo morrer a meio da distribuição, a consulta
  // fica num estado que se percebe, e não em 'triada' como se nada tivesse acontecido.
  if (consulta.estado !== 'qualificada') {
    await mudarEstado(db, id, 'qualificada', actor, `CPL ${valorLead.toFixed(2)} EUR, ${elegiveis.length} parceiro(s) elegível(eis)`, { valorLead });
  }

  const entregues: ResultadoDistribuicao['entregues'] = [];
  const falhados: ResultadoDistribuicao['falhados'] = [];
  const consultaParaTemplate = { ...consulta, valorLead };

  for (const { parceiro } of elegiveis) {
    if (entregues.length >= maximo) break;

    const partnerId = String(parceiro._id);

    if (recusaram.has(partnerId)) {
      falhados.push({ partnerId, nome: parceiro.nome, motivo: 'já contestou esta lead' });
      continue;
    }

    const gratis = (parceiro.leadsGratisRestantes ?? 0) > 0;   // trial pago em dados (spec §6.1)
    const custo = gratis ? 0 : valorLead;
    const saldo = carteiras.get(partnerId)?.saldo ?? 0;

    if (!gratis && saldo < custo) {
      falhados.push({ partnerId, nome: parceiro.nome, motivo: `saldo insuficiente (${saldo.toFixed(2)} EUR)` });
      continue;
    }

    // Desce-se a escada de canais (spec §9.2): o preferido primeiro, os outros como
    // rede. Uma lead não se perde porque a Evolution API esteve em baixo dois minutos.
    // Cada tentativa é um envio próprio em `crm_dispatches` — a que falhou fica lá,
    // registada, e é assim que se percebe depois que o WhatsApp anda a falhar.
    const canais = canaisUtilizaveis(parceiro);
    let envio: ResultadoEnvio = { ok: false, erro: 'parceiro sem canal utilizável' };
    const tentativas: string[] = [];
    let saldoApos: number | null = null;

    for (const canal of canais) {
      envio = await enviar(db, parceiro, 'nova_lead', { consulta: consultaParaTemplate, valorLead: custo }, {
        canal,
        antesDeEnviar: async (dispatchId) => {
          if (custo <= 0) return { ok: true };
          const d = await debitar(db, partnerId, custo, {
            dispatchId, consultaId: id, actor, motivo: `lead ${consulta.categoria}`,
          });
          if (d.ok && typeof d.saldo === 'number') saldoApos = d.saldo;
          return d.ok ? { ok: true } : { ok: false, erro: d.erro };
        },
      });

      if (envio.ok) break;

      // Débito feito e canal falhado: devolve-se antes de tentar o seguinte, senão o
      // parceiro pagava uma vez por cada canal que a plataforma experimentasse.
      if (custo > 0 && envio.dispatchId) {
        await estornar(db, partnerId, {
          dispatchId: envio.dispatchId, consultaId: id, actor: 'sistema',
          motivo: `envio falhado por ${canal}: ${envio.erro ?? 'canal indisponível'}`,
        });
      }
      tentativas.push(`${canal}: ${envio.erro ?? 'falhou'}`);
    }

    if (!envio.ok) {
      falhados.push({
        partnerId, nome: parceiro.nome,
        motivo: tentativas.length ? tentativas.join(' | ') : (envio.erro ?? 'falha no envio'),
      });
      continue;
    }

    if (envio.repetido) {
      falhados.push({ partnerId, nome: parceiro.nome, motivo: 'já tinha recebido esta lead' });
      continue;
    }

    if (gratis) {
      await db.collection('crm_partners').updateOne(
        { _id: paraOid(partnerId) as any, leadsGratisRestantes: { $gt: 0 } },
        { $inc: { leadsGratisRestantes: -1 }, $set: { updatedAt: new Date() } },
      );
    }

    entregues.push({
      partnerId, nome: parceiro.nome, canal: envio.canal!, dispatchId: envio.dispatchId!, debitado: custo,
    });

    // O aviso vai depois da entrega, nunca antes: primeiro serve-se a lead, e so depois
    // se diz ao parceiro que a carteira esta a acabar. Nao pode fazer falhar a entrega.
    if (custo > 0 && saldoApos !== null) {
      await avisarSaldoBaixo(db, parceiro, saldoApos, consultaParaTemplate, cfg.limiteAvisoSaldo)
        .catch((err) => console.error('[crm/consultas] aviso de saldo:', err?.message ?? err));
    }
  }

  if (!entregues.length) {
    await marcarSemParceiro(db, id, 'nenhum parceiro recebeu a lead', elegiveis.length, falhados);
    return { ok: false, erro: 'nenhum parceiro recebeu a lead', entregues, falhados, excluidos, valorLead };
  }

  const agora = new Date();
  const recusaExpiraEm = new Date(agora.getTime() + cfg.janelaRecusaHoras * 3600_000);

  await mudarEstado(db, id, 'distribuída', actor, `enviada a ${entregues.length} parceiro(s)`, { valorLead });
  await mudarEstado(db, id, 'entregue', 'sistema', `entregue por ${entregues.map((e) => e.canal).join(', ')}`, {
    entregueAt: agora,
    recusaExpiraEm,
    // A lead deixou de estar por servir: a marca sai, senao o quadro de procura conta
    // como falta de parceiro uma tentativa que acabou por resultar.
    semParceiro: null,
  });

  return { ok: true, entregues, falhados, excluidos, valorLead };
}

/**
 * Aviso de saldo baixo (spec §9.3).
 *
 * "Sem saldo, as proximas leads seguem para outro parceiro" — e a spec poe isto como um
 * dos quatro templates iniciais. Sem ele, o parceiro so descobre que ficou sem saldo
 * quando reparar que deixou de receber leads, e a plataforma perde receita por silencio.
 *
 * Manda-se UMA vez por descida. O `avisoEnviadoAt` marca que ja foi, e o carregamento de
 * saldo limpa-o (ver carregar() em lib/crm/carteira.ts) — e assim o ciclo reabre sem
 * ninguem levar com o mesmo aviso a cada lead que recebe.
 */
async function avisarSaldoBaixo(
  db: Db,
  parceiro: CrmPartner,
  saldo: number,
  consulta: CrmConsulta,
  limitePadrao: number,
): Promise<void> {
  const partnerId = String(parceiro._id);
  const carteira = await lerCarteira(db, partnerId, limitePadrao);

  // O limite vem da configuracao, nao da carteira: e o campo "Aviso de saldo" que a
  // operadora ve e edita, e tem de ser esse a mandar.
  if (saldo >= limitePadrao) return;
  if (carteira.avisoEnviadoAt) return;

  const r = await enviar(db, parceiro, 'saldo_baixo', { consulta, saldo });
  if (!r.ok) return;

  await db.collection('crm_wallet').updateOne(
    { _id: partnerId as any },
    { $set: { avisoEnviadoAt: new Date(), updatedAt: new Date() } },
  );
}

/**
 * Quem já contestou esta lead.
 *
 * Uma recusa devolve a lead ao mercado, mas "mercado" nunca inclui quem acabou de dizer
 * que ela não servia: reenviá-la ao mesmo parceiro é pedir-lhe que recuse outra vez, e
 * gastar-lhe a paciência que a plataforma precisa dele. A spec §6.3 dá-lhe o direito de
 * contestar; este filtro é o que faz esse direito valer alguma coisa.
 */
export async function parceirosQueRecusaram(db: Db, consultaId: string): Promise<Set<string>> {
  const docs: any[] = await db
    .collection('crm_dispatches')
    .find({ consultaId, estado: 'recusado' }, { projection: { partnerId: 1 } } as any)
    .toArray();
  return new Set(docs.map((d) => String(d.partnerId)));
}

/**
 * Regista a autorização do cliente para o pedido ser encaminhado.
 *
 * O `actor` importa tanto como a data: o RGPD exige que se consiga DEMONSTRAR que houve
 * consentimento, e num consentimento verbal a demonstração é saber quem o recolheu e
 * quando. Fica no histórico da consulta pela mesma razão.
 */
export async function registarConsentimento(
  db: Db,
  consultaId: string,
  via: 'quiz' | 'telefone' | 'email' | 'link_email',
  actor: string,
  guiao?: { versao: string; texto: string },
): Promise<{ ok: boolean; erro?: string; consulta?: CrmConsulta }> {
  const consulta = await lerConsulta(db, consultaId);
  if (!consulta) return { ok: false, erro: 'consulta não encontrada' };
  if (consulta.consentimento) return { ok: true, consulta };

  const agora = new Date();
  await db.collection('crm_consultas').updateOne(
    { _id: paraOid(consultaId) as any },
    {
      $set: { consentimento: { em: agora, via, actor, guiao: guiao ?? null }, updatedAt: agora },
      $push: {
        history: {
          estado: consulta.estado,
          timestamp: agora,
          actor,
          motivo: `cliente autorizou o encaminhamento (via ${via}${guiao ? `, guião ${guiao.versao}` : ''})`,
        },
      } as any,
    },
  );
  return { ok: true, consulta: (await lerConsulta(db, consultaId)) ?? undefined };
}

// ── Janela de recusa (spec §6.3) ─────────────────────────────────────────────

export const MOTIVOS_RECUSA = ['contacto_errado', 'duplicado', 'fora_ambito'] as const;
export type MotivoRecusa = typeof MOTIVOS_RECUSA[number];

/**
 * O parceiro contesta uma lead inválida e recupera o crédito.
 *
 * A spec é clara sobre porque é que isto existe: o parceiro passa a reportar os
 * negativos por interesse próprio, e são os negativos que medem a qualidade das leads.
 * Por isso a recusa gera sempre um `crm_outcome` — o crédito devolvido é o preço a
 * pagar pelo dado.
 */
export async function registarRecusa(
  db: Db,
  consultaId: string,
  partnerId: string,
  motivo: MotivoRecusa,
  actor: string,
): Promise<{ ok: boolean; erro?: string; estornado?: number }> {
  if (!(MOTIVOS_RECUSA as readonly string[]).includes(motivo)) {
    return { ok: false, erro: `motivo inválido; use um de: ${MOTIVOS_RECUSA.join(', ')}` };
  }

  const consulta = await lerConsulta(db, consultaId);
  if (!consulta) return { ok: false, erro: 'consulta não encontrada' };
  if (!consulta.entregueAt) return { ok: false, erro: 'lead ainda não foi entregue' };

  const limite = consulta.recusaExpiraEm ? new Date(consulta.recusaExpiraEm).getTime() : 0;
  if (Date.now() > limite) {
    return { ok: false, erro: 'janela de recusa de 24h expirada' };
  }

  const dispatch = await envioDaConsulta(db, consultaId, partnerId);
  if (!dispatch) return { ok: false, erro: 'este parceiro não recebeu esta lead' };
  if (dispatch.estado === 'recusado') return { ok: false, erro: 'lead já contestada' };

  // A validade da transição verifica-se ANTES de mexer no dinheiro: um envio que falhou
  // ou expirou nunca chegou às mãos do parceiro, e devolver-lhe crédito por uma lead que
  // não recebeu seria um estorno impossível de justificar no extracto.
  if (!podeTransitarDispatch(dispatch.estado, 'recusado')) {
    return { ok: false, erro: `envio em "${dispatch.estado}" não pode ser contestado` };
  }

  const devolucao = await estornar(db, partnerId, {
    dispatchId: String(dispatch._id), consultaId, actor, motivo: `recusa: ${motivo}`,
  });

  await marcarEstado(db, String(dispatch._id), 'recusado');

  await registarOutcome(db, {
    consultaId, partnerId, fonte: 'parceiro', tipo: 'recusa', motivo,
    chaveUnica: `${consultaId}:${partnerId}:recusa`,
  });

  await mudarEstado(db, consultaId, 'recusada', actor, `recusa aceite: ${motivo}`);

  // Sem débito (lead de trial) o estorno falha, e isso não é erro: a recusa vale na
  // mesma, porque o que interessa é o dado.
  return { ok: true, estornado: devolucao.ok ? (devolucao.saldo !== undefined ? Number(devolucao.saldo) : undefined) : undefined };
}

// ── Auxiliares ───────────────────────────────────────────────────────────────

/** O `_id` de `messages` tanto é string do Meteor como ObjectId — ver leads-partilha.md 5.1. */
function idDeLead(leadId: string): string | ObjectId {
  return /^[0-9a-f]{24}$/i.test(leadId) ? new ObjectId(leadId) : leadId;
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

function numeroOuNulo(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}
