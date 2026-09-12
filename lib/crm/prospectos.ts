import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { CrmPartner } from '@/types/crm';
import {
  transicao, podeReceberAngariacao, emailsConhecidos,
  type CrmInteraccao, type TipoInteraccao, TIPOS_INTERACCAO,
} from './angariacao';
import { metaApresentacao, validarCampos, type VarianteApresentacao } from './apresentacao';
import { assuntoApresentacao, montarApresentacao } from '@/lib/email/catalogo';
import { lerTextosCarta } from './textos';
import { linkOposicao, linkRegisto } from './tokens';
import { sendHtmlBruto } from '@/lib/email/resend';

/**
 * A ficha do prospecto, do lado da base de dados.
 *
 * O que a gerente de conta faz todos os dias: escrever o que aconteceu, mudar o estado
 * com um motivo, e enviar (ou reenviar) a carta de apresentação.
 *
 * As regras — que estados existem, por onde se pode andar, que campos cada carta precisa —
 * estão nos módulos puros (lib/crm/angariacao.ts e lib/crm/apresentacao.ts), que se testam
 * sem Mongo. Aqui fica só o que escreve.
 */

const COL = 'crm_interaccoes';

function paraOid(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}

async function lerParceiro(db: Db, id: string): Promise<CrmPartner | null> {
  const doc: any = await db.collection('crm_partners').findOne({ _id: paraOid(id) });
  return doc ? ({ ...doc, _id: String(doc._id) } as CrmPartner) : null;
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

/**
 * Regista o que aconteceu.
 *
 * Sem validar grande coisa de propósito: é uma nota escrita por uma pessoa sobre uma
 * conversa que teve, e o custo de a recusar por ser curta demais é ela não ser escrita.
 * A única exigência é haver texto.
 */
export async function registarInteraccao(
  db: Db,
  partnerId: string,
  tipo: string,
  resumo: string,
  actor: string,
  email?: CrmInteraccao['email'],
): Promise<{ ok: boolean; erro?: string; interaccao?: CrmInteraccao }> {
  if (!(TIPOS_INTERACCAO as readonly string[]).includes(tipo)) {
    return { ok: false, erro: 'tipo desconhecido' };
  }
  const texto = String(resumo ?? '').trim();
  if (!texto) return { ok: false, erro: 'escreva o que aconteceu' };

  const doc: Omit<CrmInteraccao, '_id'> = {
    partnerId: String(partnerId),
    tipo: tipo as TipoInteraccao,
    em: new Date(),
    actor,
    resumo: texto.slice(0, 2000),
    ...(email ? { email } : {}),
  };

  const r: any = await db.collection(COL).insertOne(doc as any);

  // A ficha guarda a data do último toque para a lista de trabalho poder ordenar por ela
  // sem ter de ir ler as interacções de todos os parceiros.
  await db.collection('crm_partners').updateOne(
    { _id: paraOid(partnerId) },
    { $set: { ultimoContactoEm: doc.em, updatedAt: doc.em } },
  ).catch(() => {});

  return { ok: true, interaccao: { ...doc, _id: String(r.insertedId) } };
}

export async function lerInteraccoes(db: Db, partnerId: string, limite = 100): Promise<CrmInteraccao[]> {
  const docs: any[] = await db.collection(COL)
    .find({ partnerId: String(partnerId) })
    .sort({ em: -1 })
    .limit(limite)
    .toArray();
  return docs.map((d) => ({ ...d, _id: String(d._id) })) as CrmInteraccao[];
}

// ── Estado ───────────────────────────────────────────────────────────────────

/**
 * Muda o estado da ficha.
 *
 * A mudança e o registo do porquê acontecem juntos: a `transicao()` devolve os dois, e
 * gravar um sem o outro deixaria uma ficha que mudou de estado sem se saber porquê — que
 * é uma ficha que alguém vai voltar a contactar por engano daqui a três meses.
 */
export async function mudarEstadoParceiro(
  db: Db,
  partnerId: string,
  novo: string,
  motivo: string,
  actor: string,
): Promise<{ ok: boolean; erro?: string; parceiro?: CrmPartner }> {
  const p = await lerParceiro(db, partnerId);
  if (!p) return { ok: false, erro: 'parceiro não encontrado' };

  const r = transicao(p.estado, novo, actor, motivo);
  if (!r.ok) return { ok: false, erro: r.erro };

  const $set: Record<string, unknown> = { estado: r.estado, updatedAt: r.entrada!.em };
  // Sair do funil deixa o motivo à vista na ficha, e não só no fundo da linha do tempo.
  if (novo === 'descartado' || novo === 'opos_se') $set.motivoSaida = r.entrada!.motivo;

  await db.collection('crm_partners').updateOne(
    { _id: paraOid(partnerId) },
    { $set, $push: { historicoEstado: r.entrada } as any },
  );

  await registarInteraccao(db, partnerId, 'nota',
    `Estado: ${p.estado} -> ${r.estado}. ${r.entrada!.motivo}`, actor);

  return { ok: true, parceiro: (await lerParceiro(db, partnerId)) ?? undefined };
}

// ── A carta de apresentação ──────────────────────────────────────────────────

export interface ResultadoEnvio {
  ok: boolean;
  erro?: string;
  para?: string;
  versao?: string;
}

/**
 * Envia (ou reenvia) a carta de apresentação.
 *
 * **Não há limite de envios, e é de propósito.** O reenvio é uma resposta a um pedido —
 * *"o meu gerente estava de férias e não viu, podem reenviar para este endereço?"* — e um
 * travão automático bloquearia exactamente o caso que o justifica. O que existe em vez do
 * travão é o registo: para quem, quando, por que operadora, com que motivo, e com que
 * versão do texto.
 *
 * O destinatário é escolhido a cada envio e pode ser outro que não o da ficha. Um
 * endereço novo fica gravado como contacto, senão perde-se no histórico.
 */
export async function enviarApresentacao(
  db: Db,
  partnerId: string,
  variante: string,
  valores: Record<string, unknown>,
  para: string,
  motivo: string,
  actor: string,
): Promise<ResultadoEnvio> {
  const p = await lerParceiro(db, partnerId);
  if (!p) return { ok: false, erro: 'parceiro não encontrado' };

  // A única recusa absoluta. Quem pediu para não ser contactado não é contactado, e não
  // há caminho na interface que o contorne.
  if (!podeReceberAngariacao(p)) {
    return { ok: false, erro: 'esta empresa pediu para não receber mais contactos' };
  }

  const meta = metaApresentacao(variante);
  if (!meta) return { ok: false, erro: 'carta desconhecida' };

  const valido = validarCampos(variante, valores);
  if (!valido.ok) return { ok: false, erro: valido.erro };

  const destino = String(para ?? '').trim().toLowerCase();
  if (!destino.includes('@')) return { ok: false, erro: 'o endereço de destino não é válido' };

  const jaEnviada = await db.collection(COL).countDocuments({ partnerId: String(partnerId), tipo: 'email' });
  const texto = String(motivo ?? '').trim();
  if (jaEnviada > 0 && !texto) {
    // O primeiro envio dispensa justificação; os seguintes não. É o motivo que, daqui a
    // seis meses, explica porque é que esta empresa levou três emails.
    return { ok: false, erro: 'diga porque é que está a reenviar — fica no histórico' };
  }

  // O texto que esta a valer, e a versao dele. A previsualizacao le daqui tambem: se
  // divergissem, a operadora aprovava uma carta e enviava outra.
  const todos = await lerTextosCarta(db).catch(() => undefined);
  const texto0 = todos?.[variante as VarianteApresentacao];

  const html = montarApresentacao(
    variante as VarianteApresentacao,
    valores,
    linkRegisto(partnerId),
    linkOposicao(partnerId),
    texto0,
  );

  const assunto = assuntoApresentacao(variante as VarianteApresentacao, valores, texto0);
  const enviado = await sendHtmlBruto({ to: destino, subject: assunto, html });

  await registarInteraccao(
    db, partnerId, 'email',
    jaEnviada > 0 ? `Reenvio da carta "${meta.nome}": ${texto}` : `Carta "${meta.nome}" enviada`,
    actor,
    // A versao do texto que foi mesmo enviado, e nao a do codigo: e por este rotulo que
    // daqui a meio ano se sabe qual das cartas esta empresa recebeu.
    { para: destino, template: `apresentacao_${variante}`, versao: texto0?.versao ?? meta.versao, motivo: texto || undefined, enviado },
  );

  if (!enviado) return { ok: false, erro: 'o serviço de email recusou a mensagem', para: destino };

  // Endereço novo passa a contacto da ficha: o reenvio de hoje é o contacto de amanhã.
  if (!emailsConhecidos(p).includes(destino)) {
    await db.collection('crm_partners').updateOne(
      { _id: paraOid(partnerId) },
      { $push: { contactos: { nome: destino.split('@')[0], email: destino, notas: 'veio de um reenvio da carta' } } as any },
    ).catch(() => {});
  }

  // Só avança quem ainda não tinha sido contactado. Um reenvio a quem já se registou não
  // o faz recuar no funil.
  if (p.estado === 'prospect') {
    await mudarEstadoParceiro(db, partnerId, 'contactado', `carta de apresentação enviada para ${destino}`, actor);
  }

  return { ok: true, para: destino, versao: meta.versao };
}

/**
 * A empresa pediu para não receber mais contactos.
 *
 * Bloqueia **angariação**, não bloqueia **transaccional**: se esta empresa vier a ser
 * parceira por outra via, continua a receber as leads que compra. Confundir as duas ou
 * deixa alguém sem as leads que pagou, ou continua a incomodar quem pediu para não ser
 * incomodado.
 */
export async function registarOposicao(db: Db, partnerId: string): Promise<{ ok: boolean; erro?: string; jaEstava?: boolean }> {
  const p = await lerParceiro(db, partnerId);
  if (!p) return { ok: false, erro: 'ficha não encontrada' };
  if (p.estado === 'opos_se') return { ok: true, jaEstava: true };

  const r = await mudarEstadoParceiro(db, partnerId, 'opos_se',
    'a empresa pediu, na ligação do email, para não receber mais contactos', 'a própria empresa');
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}
