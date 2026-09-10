import type { Db } from 'mongodb';
import type { CrmCategoria } from '@/types/crm';

/**
 * Procura não servida — a lista de compras da angariação de parceiros.
 *
 * Ver SPECS-Angariacao-Parceiros.md §2. A ideia é uma só: cada lead que não se conseguiu
 * vender já diz, com precisão, que parceiro falta. Doze leads de mudanças em Setúbal num
 * mês não são doze falhas — são um argumento de venda com valor em euros, e a ordem por
 * onde as gerentes de conta devem ligar.
 *
 * Antes disto, o `distribuir()` calculava o motivo de cada exclusão, devolvia-o na
 * resposta HTTP e ninguém o guardava. O dado mais valioso do CRM evaporava-se a cada
 * tentativa falhada.
 */

/** Porque é que a lead ficou por vender. Poucos motivos, e cada um pede outra acção. */
export type MotivoSemParceiro =
  /** Ninguém tem capacidade declarada para esta categoria e zona. Falta angariar. */
  | 'nenhum_cobre'
  /** Há quem cubra, mas sem saldo. Falta cobrar, não angariar. */
  | 'sem_saldo'
  /** Quem cobre já contestou esta lead. É caso isolado, não falta de rede. */
  | 'ja_recusaram'
  /** Falta o preço, o interruptor, ou a autorização do cliente. Nada disto é do mercado. */
  | 'bloqueio_interno'
  | 'outro';

export interface SemParceiro {
  em: Date;
  motivo: MotivoSemParceiro;
  detalhe: string;
  /** Quantos parceiros a procura encontrou, mesmo que nenhum tenha podido receber. */
  elegiveis: number;
}

/**
 * Traduz o resultado de uma distribuição falhada num motivo que se possa contar.
 *
 * A distinção que interessa é entre **falta de rede** e **falta de saldo**: a primeira
 * resolve-se a angariar, a segunda a telefonar a quem já é parceiro. Contá-las juntas
 * mandaria as gerentes de conta atrás de empresas novas quando o problema era uma
 * carteira vazia.
 */
export function classificarFalha(
  erro: string | undefined,
  elegiveis: number,
  falhados: { motivo: string }[],
): { motivo: MotivoSemParceiro; detalhe: string } {
  const motivos = falhados.map((f) => f.motivo).join(' | ');

  if (elegiveis === 0) {
    return { motivo: 'nenhum_cobre', detalhe: erro ?? 'nenhum parceiro cobre esta consulta' };
  }
  if (falhados.some((f) => /saldo insuficiente/i.test(f.motivo))) {
    return { motivo: 'sem_saldo', detalhe: motivos };
  }
  if (falhados.some((f) => /já contestou/i.test(f.motivo))) {
    return { motivo: 'ja_recusaram', detalhe: motivos };
  }
  if (erro && /(CPL|inactivo|autorização)/i.test(erro)) {
    return { motivo: 'bloqueio_interno', detalhe: erro };
  }
  return { motivo: 'outro', detalhe: motivos || erro || 'sem motivo registado' };
}

// ── O quadro ─────────────────────────────────────────────────────────────────

export interface Celula {
  categoria: CrmCategoria;
  zona: string;
  /** Leads por servir nesta célula, no período. */
  leads: number;
  /** O que se deixou de facturar, ao CPL de cada categoria. */
  valor: number;
  /** Quantas nem sequer chegaram a ser tentadas. */
  porTentar: number;
  /** Repartição por motivo, para se saber se é de angariar ou de cobrar. */
  motivos: Partial<Record<MotivoSemParceiro, number>>;
}

/**
 * O quadro de procura por servir, por categoria e zona.
 *
 * Conta as consultas da Linha B que ainda não foram entregues — as que falharam a
 * distribuição E as que ninguém tentou distribuir. As segundas contam tanto como as
 * primeiras: uma lead parada há duas semanas está tão por servir como uma que falhou.
 *
 * Feito em memória de propósito. São dezenas de consultas por mês, não milhões, e uma
 * agregação escrita à mão aqui é mais fácil de ler e de corrigir do que um `$group` —
 * e este quadro vai mudar de forma à medida que a angariação ensinar o que falta.
 */
export async function quadroDeProcura(db: Db, dias = 30): Promise<{ celulas: Celula[]; total: number; valor: number }> {
  const desde = new Date(Date.now() - dias * 24 * 3600_000);

  const docs: any[] = await db.collection('crm_consultas').find({
    route: 'lead_sale',
    createdAt: { $gte: desde },
    entregueAt: null,
    estado: { $nin: ['expirada', 'fechada'] },
  }).toArray();

  const mapa = new Map<string, Celula>();

  for (const c of docs) {
    const zona = c.pedido?.zona || 'zona desconhecida';
    const chave = `${c.categoria}|${zona}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, { categoria: c.categoria, zona, leads: 0, valor: 0, porTentar: 0, motivos: {} });
    }
    const cel = mapa.get(chave)!;
    cel.leads++;
    cel.valor += Number(c.valorLead) || 0;

    const sp: SemParceiro | undefined = c.semParceiro;
    if (sp) cel.motivos[sp.motivo] = (cel.motivos[sp.motivo] ?? 0) + 1;
    else cel.porTentar++;
  }

  const celulas = [...mapa.values()].sort((a, b) => b.valor - a.valor || b.leads - a.leads);
  return {
    celulas,
    total: celulas.reduce((s, c) => s + c.leads, 0),
    valor: Math.round(celulas.reduce((s, c) => s + c.valor, 0) * 100) / 100,
  };
}
