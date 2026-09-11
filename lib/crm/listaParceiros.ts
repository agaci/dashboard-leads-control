import type { Db } from 'mongodb';
import type { CrmCapability, CrmPartner } from '@/types/crm';
import { lerCarteirasEmLote } from './carteira';
import { DISTRITOS } from './zonas';
import {
  aplicarFiltros, categoriasDoParceiro, contarPorDistrito, ordenar, zonasDoParceiro,
  type Filtros, type Ordem, type ParceiroListado,
} from './filtros';

/**
 * A lista de parceiros, filtrada, ordenada e paginada.
 *
 * O que isto substitui: um `find({}).toArray()` seguido das carteiras de toda a gente.
 * Com uma dúzia de parceiros ninguém nota; com as centenas de que falamos, eram centenas
 * de documentos e centenas de carteiras a cada vez que alguém abre o separador.
 *
 * As regras de filtragem estão em lib/crm/filtros.ts, que é puro e testado. Aqui fica só
 * o que vai à base de dados, e uma decisão: **o que se filtra no Mongo e o que se filtra
 * em memória.**
 *
 * No Mongo fica o que é barato e reduz muito — o estado, a dimensão, a gerente de conta.
 * Em memória fica o que depende da herança de zonas entre parceiro e capacidades, que numa
 * consulta de Mongo 3.0 daria uma agregação que ninguém voltaria a perceber.
 */

export interface PedidoLista extends Filtros {
  ordem?: Ordem;
  pagina?: number;
  porPagina?: number;
}

export interface RespostaLista {
  parceiros: (CrmPartner & { saldo: number; zonasEfectivas: string[]; categorias: string[] })[];
  total: number;
  pagina: number;
  porPagina: number;
  /**
   * Quantos parceiros cobrem cada distrito.
   *
   * Contado **sem** o filtro de zona, de propósito: se contasse com ele, clicar num
   * distrito apagava todos os outros do mapa e a pessoa perdia a vista de conjunto
   * exactamente quando estava a explorá-la.
   */
  mapa: Record<string, number>;
}

export async function listarParceiros(db: Db, pedido: PedidoLista): Promise<RespostaLista> {
  const porPagina = Math.min(Math.max(Number(pedido.porPagina) || 40, 5), 200);
  const pagina = Math.max(Number(pedido.pagina) || 1, 1);

  // ── o que o Mongo faz bem ──────────────────────────────────────────────────
  const filtroMongo: Record<string, unknown> = {};
  if (pedido.estados?.length) filtroMongo.estado = { $in: pedido.estados };
  if (pedido.dimensoes?.length) filtroMongo.dimensao = { $in: pedido.dimensoes };
  if (pedido.atribuidoA) filtroMongo.atribuidoA = pedido.atribuidoA;

  const docs: any[] = await db.collection('crm_partners').find(filtroMongo).toArray();
  const parceiros = docs.map((d) => ({ ...d, _id: String(d._id) })) as CrmPartner[];
  if (!parceiros.length) {
    return { parceiros: [], total: 0, pagina, porPagina, mapa: vazio() };
  }

  const ids = parceiros.map((p) => String(p._id));

  // Capacidades de todos de uma vez. Uma consulta, não uma por parceiro.
  const caps: any[] = await db.collection('crm_capabilities').find({ partnerId: { $in: ids } }).toArray();
  const porParceiro = new Map<string, CrmCapability[]>();
  for (const c of caps) {
    const k = String(c.partnerId);
    if (!porParceiro.has(k)) porParceiro.set(k, []);
    porParceiro.get(k)!.push({ ...c, _id: String(c._id) } as CrmCapability);
  }

  const carteiras = await lerCarteirasEmLote(db, ids);

  const itens: ParceiroListado[] = parceiros.map((p) => ({
    parceiro: { ...p, saldo: carteiras.get(String(p._id))?.saldo ?? 0 },
    capacidades: porParceiro.get(String(p._id)) ?? [],
  }));

  // ── o que depende da herança de zonas ──────────────────────────────────────
  // Sem o filtro de zona: é este conjunto que pinta o mapa.
  const semZona = aplicarFiltros(itens, { ...pedido, zonas: undefined, paradosNaZona: undefined });
  const mapa = contarPorDistrito(semZona, DISTRITOS);

  const filtrados = ordenar(aplicarFiltros(itens, pedido), pedido.ordem);
  const inicio = (pagina - 1) * porPagina;

  return {
    parceiros: filtrados.slice(inicio, inicio + porPagina).map(({ parceiro, capacidades }) => ({
      ...(parceiro as CrmPartner),
      saldo: (parceiro as any).saldo ?? 0,
      // Calculadas uma vez aqui: a lista precisa delas para mostrar, e recalculá-las no
      // browser obrigaria a mandar as capacidades todas para lá.
      zonasEfectivas: zonasDoParceiro(parceiro, capacidades),
      categorias: categoriasDoParceiro(capacidades),
    })),
    total: filtrados.length,
    pagina,
    porPagina,
    mapa,
  };
}

function vazio(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of DISTRITOS) m[d] = 0;
  return m;
}
