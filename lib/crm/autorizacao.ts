import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { CrmConsulta } from '@/types/crm';
import { lerConfig } from './config';
import { lerConsulta, mudarEstado, registarConsentimento } from './consultas';
import { GUIAO_AUTORIZACAO_EMAIL } from './guiao';
import { linkAutorizacao } from './tokens';
import { sendPedidoAutorizacaoEmail } from '@/lib/email/resend';

/**
 * Autorização pedida ao cliente por email, sem operadora pelo meio.
 *
 * O caso que isto resolve: uma lead da Linha B que entra às 23h de sexta ficava parada
 * até segunda de manhã. Um pedido de transporte não espera três dias — quando a gerente
 * de conta liga, a pessoa já contratou outra empresa. Com o interruptor ligado a
 * pergunta é feita na hora e a resposta pode chegar antes de alguém chegar ao trabalho.
 *
 * Três coisas que este ficheiro não faz, e não é por esquecimento:
 *
 *   1. **Não distribui.** Só recolhe a autorização. Quem distribui é a `distribuir()`,
 *      com as regras de sempre — e só corre sozinha se o envio automático também estiver
 *      ligado. São dois interruptores porque são duas decisões: perguntar ao cliente e
 *      vender a lead não têm de andar juntas.
 *   2. **Não insiste.** Um pedido por lead. Uma segunda mensagem sobre a mesma coisa não
 *      é um lembrete, é insistência — e o assunto é a partilha dos dados da pessoa.
 *   3. **Não faz nada quando já há autorização.** Se a gerente já falou ao telefone, o
 *      email não sai. É a razão de o interruptor se desligar quando há gente de serviço.
 */

/** Motivos por que um pedido não chega a sair. Todos normais; nenhum é erro. */
export type MotivoNaoPedido =
  | 'desligado'          // o interruptor está em baixo
  | 'ja_autorizado'      // já há consentimento, seja de que via for
  | 'ja_pedido'          // já se perguntou a esta consulta
  | 'sem_email'          // a lead não deixou email
  | 'nao_e_linha_b'      // não há nada para autorizar
  | 'sem_resend';        // falta a chave do serviço de email

export interface PedidoPreparado {
  preparado: boolean;
  motivo?: MotivoNaoPedido;
  erro?: string;
  /** Só quando `preparado`: o que o email precisa de mostrar. */
  para?: string;
  texto?: string;
  url?: string;
  validadeHoras?: number;
  nome?: string;
  servico?: string;
}

export interface ResultadoPedido {
  enviado: boolean;
  motivo?: MotivoNaoPedido;
  erro?: string;
}

/**
 * Prepara o pedido e devolve o que é preciso para o mostrar. **Não envia nada.**
 *
 * Existe separado do envio porque o pedido viaja de duas maneiras: dentro do email de
 * confirmação do pedido, quando a lead nasce fora do âmbito (é o caso normal, e evita
 * duas mensagens à mesma pessoa em minutos), ou num email só dele, quando a consulta
 * aparece mais tarde e a confirmação já foi enviada há muito.
 *
 * Grava o registo antes de qualquer envio, de propósito: um envio bem sucedido cuja
 * gravação falhasse deixava a porta aberta a uma segunda mensagem sobre o mesmo assunto.
 * Um pedido registado que não saiu é o erro preferível — a gerente de conta vê-o na
 * consulta e liga.
 *
 * Nunca lança.
 */
export async function prepararPedido(db: Db, consultaId: string): Promise<PedidoPreparado> {
  try {
    const cfg = await lerConfig(db);
    if (!cfg.pedirAutorizacaoPorEmail) return { preparado: false, motivo: 'desligado' };

    const consulta = await lerConsulta(db, consultaId);
    if (!consulta) return { preparado: false, erro: 'consulta não encontrada' };
    if (consulta.route !== 'lead_sale') return { preparado: false, motivo: 'nao_e_linha_b' };
    if (consulta.consentimento) return { preparado: false, motivo: 'ja_autorizado' };
    if (consulta.autorizacao) return { preparado: false, motivo: 'ja_pedido' };

    const email = String(consulta.cliente?.email ?? '').trim();
    if (!email || !email.includes('@')) return { preparado: false, motivo: 'sem_email' };
    if (!process.env.RESEND_API_KEY) return { preparado: false, motivo: 'sem_resend' };

    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + horas(cfg.autorizacaoValidadeHoras));

    await db.collection('crm_consultas').updateOne(
      { _id: paraOid(consultaId) },
      {
        $set: {
          autorizacao: { pedidaEm: agora, para: email, expiraEm, respondidaEm: null, resposta: null },
          updatedAt: agora,
        },
        $push: {
          history: {
            estado: consulta.estado, timestamp: agora, actor: 'sistema',
            motivo: `pedido de autorização enviado para ${email} (validade ${cfg.autorizacaoValidadeHoras}h)`,
          },
        } as any,
      },
    );

    return {
      preparado: true,
      para: email,
      texto: GUIAO_AUTORIZACAO_EMAIL.texto,
      url: linkAutorizacao(consultaId),
      validadeHoras: cfg.autorizacaoValidadeHoras,
      nome: primeiroNome(consulta.cliente?.nome),
      servico: descricaoDoPedido(consulta),
    };
  } catch (err: any) {
    console.error('[crm/autorizacao] falha a preparar o pedido', consultaId, err?.message ?? err);
    return { preparado: false, erro: err?.message ?? 'erro' };
  }
}

/**
 * Marca que o pedido preparado não chegou a sair.
 *
 * Sem isto a consulta ficava com uma pergunta registada que nunca chegou a ninguém, e
 * ninguém saberia — nem a gerente de conta, que veria "à espera de resposta" para sempre.
 */
export async function marcarEnvioFalhado(db: Db, consultaId: string): Promise<void> {
  try {
    await db.collection('crm_consultas').updateOne(
      { _id: paraOid(consultaId) },
      { $set: { 'autorizacao.falhouEm': new Date() } },
    );
  } catch { /* diagnostico, nao e o trabalho */ }
}

/**
 * Pede a autorização num email só dele.
 *
 * Para quando a consulta nasce fora do fluxo do quiz — triada à mão pela gerente de
 * conta, ou vinda de um pedido que chegou por telefone. Nesses casos não há email de
 * confirmação a sair ao mesmo tempo onde encaixar a pergunta.
 */
export async function pedirAutorizacao(db: Db, consultaId: string): Promise<ResultadoPedido> {
  const p = await prepararPedido(db, consultaId);
  if (!p.preparado) return { enviado: false, motivo: p.motivo, erro: p.erro };

  const ok = await sendPedidoAutorizacaoEmail({
    to: p.para!,
    nome: p.nome!,
    servico: p.servico!,
    guiao: GUIAO_AUTORIZACAO_EMAIL,
    url: p.url!,
    validadeHoras: p.validadeHoras!,
  }).catch(() => false);

  if (!ok) {
    await marcarEnvioFalhado(db, consultaId);
    return { enviado: false, erro: 'o serviço de email recusou a mensagem' };
  }
  return { enviado: true };
}

export type EstadoLink = 'valido' | 'invalido' | 'expirado' | 'ja_respondido' | 'ja_autorizado';

/** O que o link permite fazer neste momento. A assinatura valida-se antes, na rota. */
export function estadoDoLink(consulta: CrmConsulta | null): EstadoLink {
  if (!consulta) return 'invalido';
  if (consulta.consentimento) return 'ja_autorizado';
  const a = consulta.autorizacao;
  if (!a) return 'invalido';
  if (a.respondidaEm) return 'ja_respondido';
  if (new Date(a.expiraEm).getTime() < Date.now()) return 'expirado';
  return 'valido';
}

/**
 * A resposta do cliente.
 *
 * O "não" é tão importante como o "sim" e por isso também se grava: sem ele a consulta
 * ficava indistinguível de uma que ninguém abriu, e alguém acabaria por ligar a insistir
 * a quem já tinha dito que não. Fecha a consulta — não há nada mais a fazer com ela.
 */
export async function registarResposta(
  db: Db,
  consultaId: string,
  resposta: 'sim' | 'nao',
): Promise<{ ok: boolean; erro?: string }> {
  const consulta = await lerConsulta(db, consultaId);
  const estado = estadoDoLink(consulta);
  if (estado !== 'valido') return { ok: false, erro: estado };

  const agora = new Date();
  await db.collection('crm_consultas').updateOne(
    { _id: paraOid(consultaId) },
    { $set: { 'autorizacao.respondidaEm': agora, 'autorizacao.resposta': resposta, updatedAt: agora } },
  );

  if (resposta === 'sim') {
    // `actor: 'cliente'` e não o nome de uma operadora: ninguém transcreveu nada, foi a
    // própria pessoa. É o que distingue esta prova das outras.
    await registarConsentimento(db, consultaId, 'link_email', 'cliente', GUIAO_AUTORIZACAO_EMAIL);
    return { ok: true };
  }

  await mudarEstado(db, consultaId, 'expirada', 'cliente',
    'o cliente não autorizou o encaminhamento para outra empresa');
  return { ok: true };
}

// ── auxiliares ───────────────────────────────────────────────────────────────

function horas(h: number): number {
  const n = Number(h);
  return (isFinite(n) && n > 0 ? n : 72) * 3600 * 1000;
}

function primeiroNome(nome?: string): string {
  const n = String(nome ?? '').trim();
  if (!n) return 'Boa tarde';
  return n.split(/\s+/)[0];
}

/**
 * Uma linha que diga ao cliente de que pedido se trata.
 *
 * Sem isto o email chega a falar de "o seu pedido" e a pessoa, que pediu orçamentos a
 * três empresas na mesma tarde, não sabe a qual se refere — e não autoriza o que não
 * reconhece.
 */
function descricaoDoPedido(consulta: CrmConsulta): string {
  const p = consulta.pedido ?? {};
  const partes: string[] = [];
  if (p.origem) partes.push(String(p.origem));
  if (p.destino) partes.push(String(p.destino));
  const rota = partes.length === 2 ? `${partes[0]} para ${partes[1]}` : partes[0] ?? '';
  const material = String(p.material ?? '').trim();
  if (rota && material) return `${material} — ${rota}`;
  return material || rota || 'o transporte que nos pediu';
}

function paraOid(id: string): any {
  // Um id inválido nunca chega aqui: a `lerConsulta` já teria devolvido null antes.
  try { return new ObjectId(id); } catch { return id; }
}
