import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { CrmCategoria, CrmConsulta, CrmRoute } from '@/types/crm';
import { CATEGORIAS_ORDENADAS, rotaDaCategoria } from './categorias';
import { consultaDeLead, lerConsulta } from './consultas';

/**
 * A gerente de conta corrige a triagem.
 *
 * A triagem lê o formulário; a gerente de conta fala com a pessoa. Ao telefone descobrem-se
 * coisas que nenhum formulário apanha — o piano é de cauda, o carro não pega, a mudança é
 * de um quinto andar sem elevador — e a conclusão pode ser o contrário do que a triagem
 * decidiu, nos dois sentidos.
 *
 * Até aqui esse caminho não existia. Uma lead classificada como servível nem sequer abria
 * consulta, e colar o id em "triar uma lead existente" só voltava a correr a mesma triagem
 * sobre os mesmos dados, com o mesmo resultado. Ficava a "consulta manual", que obrigava a
 * reescrever tudo à mão e partia a ligação à lead.
 *
 * Três regras:
 *
 *   1. **A categoria é escolhida, não adivinhada.** É ela que decide que parceiros
 *      recebem a lead e quanto ela custa. A triagem já errou uma vez neste caso; não faz
 *      sentido pedir-lhe um segundo palpite.
 *   2. **O motivo é obrigatório.** É o único sítio onde fica escrito porque é que a
 *      triagem falhou, e é escrito no momento em que se sabe. Ao fim de umas dezenas,
 *      as regras de lib/crm/categorias.ts corrigem-se com dados em vez de palpites.
 *   3. **Depois de sair para um parceiro, não se reclassifica.** Há alguém pago e
 *      informado do outro lado. O caminho a partir daí é a janela de recusa.
 */

/** Estados a partir dos quais já não se mexe: a lead saiu, ou o assunto está fechado. */
const ESTADOS_FECHADOS = [
  'distribuída', 'entregue', 'em_reporte', 'fechada', 'recusada', 'expirada',
  'proposta_enviada', 'adjudicada', 'em_execução', 'concluída',
];

export type MotivoBloqueio = 'ja_distribuida' | 'sem_categoria' | 'sem_motivo' | 'mesma_categoria';

export interface ResultadoReclassificacao {
  ok: boolean;
  erro?: string;
  bloqueio?: MotivoBloqueio;
  consulta?: CrmConsulta;
  /** Mudou de linha, e não só de categoria dentro da mesma. */
  mudouDeLinha?: boolean;
}

/** Pode-se ainda mexer nesta consulta? Pura, para a interface poder decidir sem perguntar. */
export function podeReclassificar(consulta: Pick<CrmConsulta, 'estado'> | null): boolean {
  if (!consulta) return true;   // ainda não há consulta: cria-se uma
  return !ESTADOS_FECHADOS.includes(consulta.estado);
}

/** As categorias oferecidas, com a linha de cada uma. A interface não deve ter esta lista. */
export function categoriasParaEscolher(): { id: string; label: string; route: CrmRoute; descricao: string }[] {
  return CATEGORIAS_ORDENADAS.map((c) => ({
    id: c.id, label: c.label, route: c.route, descricao: c.descricao,
  }));
}

/**
 * Muda a categoria (e, com ela, a linha) de uma lead.
 *
 * Cria a consulta se ainda não existir — é o caso normal a vir de uma lead servível, que
 * nunca chegou a abrir nenhuma. A consulta nasce da lead e não à mão, para o histórico
 * ficar ligado ao `messages` original.
 *
 * Volta sempre ao estado `triada`: uma lead que mudou de linha não pode manter o estado
 * da linha anterior — `em_cotação` não existe do lado da venda de leads, e `qualificada`
 * não existe do lado da subcontratação.
 */
export async function reclassificar(
  db: Db,
  leadId: string,
  novaCategoria: string,
  motivo: string,
  actor: string,
): Promise<ResultadoReclassificacao> {
  const categoria = CATEGORIAS_ORDENADAS.find((c) => c.id === novaCategoria);
  if (!categoria) return { ok: false, bloqueio: 'sem_categoria', erro: 'categoria desconhecida' };

  const texto = String(motivo ?? '').trim();
  if (texto.length < 3) {
    return {
      ok: false, bloqueio: 'sem_motivo',
      erro: 'diga porque é que a triagem estava errada — é o que permite corrigir as regras',
    };
  }

  // `consultaDeLead` devolve a que existe, ou cria uma a partir da lead. Nos dois casos
  // sai daqui com os dados do `messages` e com a origem ligada à lead.
  let consulta: CrmConsulta;
  try {
    consulta = await consultaDeLead(db, leadId, actor);
  } catch (err: any) {
    return { ok: false, erro: err?.message ?? 'lead não encontrada' };
  }

  if (!podeReclassificar(consulta)) {
    return {
      ok: false, bloqueio: 'ja_distribuida',
      erro: `esta lead já está em "${consulta.estado}" — a partir daqui o caminho é a janela de recusa`,
    };
  }

  if (consulta.categoria === categoria.id) {
    return { ok: false, bloqueio: 'mesma_categoria', erro: 'a lead já está nessa categoria' };
  }

  const rotaNova = rotaDaCategoria(categoria.id as CrmCategoria);
  const mudouDeLinha = consulta.route !== rotaNova;
  const agora = new Date();
  const id = new ObjectId(String(consulta._id));

  await db.collection('crm_consultas').updateOne(
    { _id: id as any },
    {
      $set: {
        route: rotaNova,
        categoria: categoria.id,
        estado: 'triada',
        // A triagem automática fica registada como foi: `triagem` é o que a máquina
        // decidiu, e reescrevê-la apagava a prova de que errou. A correcção vive à parte.
        reclassificacao: {
          em: agora, actor, motivo: texto,
          de: { route: consulta.route, categoria: consulta.categoria },
          para: { route: rotaNova, categoria: categoria.id },
        },
        // O valor é da categoria antiga. Deixá-lo cá seria cobrar o preço errado ao
        // parceiro; a distribuição volta a calculá-lo a partir da configuração.
        valorLead: null,
        updatedAt: agora,
      },
      $push: {
        history: {
          estado: 'triada', timestamp: agora, actor,
          motivo: `reclassificada de ${consulta.categoria} para ${categoria.id}${mudouDeLinha ? ` (${consulta.route} -> ${rotaNova})` : ''}: ${texto}`,
        },
      } as any,
    },
  );

  // O carimbo na lead acompanha, senão a ficha continuava a dizer o que a triagem tinha
  // decidido e a contradizer a consulta.
  try {
    await db.collection('messages').updateOne(
      { _id: new ObjectId(leadId) as any },
      { $set: { 'crmTriagem.categoria': categoria.id, 'crmTriagem.route': rotaNova, 'crmTriagem.reclassificadaEm': agora } },
    );
  } catch { /* id do Meteor ou lead apagada: o carimbo e acessorio */ }

  const actualizada = await lerConsulta(db, String(consulta._id));
  return { ok: true, consulta: actualizada ?? undefined, mudouDeLinha };
}
