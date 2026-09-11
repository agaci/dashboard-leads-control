import type { Db } from 'mongodb';
import type { CrmCategoria } from '@/types/crm';
import { CATEGORIAS_LEAD_SALE, labelDaCategoria } from './categorias';

/**
 * Tipos de material do quiz (`crm_materiais`).
 *
 * A lista deixou de estar escrita no HTML: vive na base de dados, com CRUD no
 * dashboard, para a operação a poder afinar à medida que percebe que leads recebe.
 *
 * ── O que importa perceber antes de mexer nisto ──────────────────────────────
 *
 * O `valor` NÃO é uma etiqueta: é o que fica gravado em `leadData.material` e é o que
 * a triagem lê para decidir se a lead é servível. Daí duas regras:
 *
 *   1. **A categoria viaja no mesmo registo.** Sem isso, acrescentar "Mudanças
 *      completas" pela interface criava uma opção que a triagem não reconhecia — e a
 *      lead ia para a Linha A em silêncio, que é o pior tipo de falha.
 *
 *   2. **O `valor` não se muda depois de estar em uso.** As leads antigas guardaram a
 *      string tal como era; mudá-la deixa o histórico a apontar para nada. Muda-se o
 *      `label` à vontade — é só o que se mostra. Por isso o CRUD não deixa editar o
 *      `valor` de uma opção já usada.
 */

/** As categorias que a operação NÃO serve. As outras não fazem sentido num material. */
export type CategoriaNaoServida = CrmCategoria;

/** Este material é dos que a operação serve? */
export function servimos(m: Pick<CrmMaterial, 'categoria'>): boolean {
  return m.categoria == null;
}

/**
 * Valida a categoria de um material.
 *
 * `null` é resposta legítima e a mais comum: quer dizer "isto fazemos nós". O que não
 * se aceita é uma categoria da Linha A — ver o comentário no campo.
 */
export function categoriaDeMaterialValida(v: unknown): { ok: boolean; erro?: string } {
  if (v === null || v === undefined) return { ok: true };
  if (typeof v !== 'string' || !CATEGORIAS_LEAD_SALE.includes(v as CrmCategoria)) {
    return {
      ok: false,
      erro: `categoria inválida para um material. Use uma das que não servimos (${CATEGORIAS_LEAD_SALE.map(labelDaCategoria).join(', ')}), ou deixe vazio se for um serviço nosso.`,
    };
  }
  return { ok: true };
}

export interface CrmMaterial {
  _id?: string;
  /** O que fica gravado na lead. Imutável depois de usado. */
  valor: string;
  /** O que a pessoa lê no menu. Editável à vontade. */
  label: string;
  /**
   * O que separa o que fazemos do que não fazemos, e é a única coisa que aqui decide.
   *
   *   `null`              a operação própria trata disto. É o caso da esmagadora maioria.
   *   uma das seis        não fazemos: a lead vale como venda a um parceiro especializado.
   *
   * Só entram categorias da Linha B. `expresso` e `arrasto` são serviços nossos e saem
   * da URGÊNCIA, não do que vai dentro da caixa — deixá-las aqui criaria um terceiro
   * estado sem significado, e alguém acabaria por marcar um material como "expresso" a
   * pensar que estava a dizer "isto fazemos nós". Para isso serve o `null`.
   */
  categoria: CategoriaNaoServida | null;
  /** Agrupa no menu: os que têm categoria aparecem em "Serviços que tratamos à parte". */
  ordem: number;
  active: boolean;
  updatedAt?: Date;
}

/**
 * A lista de partida, tal como estava no HTML do quiz 7D em 08/09/2026.
 *
 * Fica aqui para semear a colecção e para servir de recurso quando a base não responde:
 * um menu de material vazio não é um menu degradado, é um quiz partido.
 */
export const MATERIAIS_INICIAIS: Omit<CrmMaterial, '_id'>[] = [
  ...[
    'Documentos / Envelopes',
    'Eletronica / Informatica',
    'Telemoveis / Tablets',
    'Eletrodomesticos',
    'Pecas automoveis',
    'Material medico / Farmaceutico',
    'Produtos alimentares (não perecíveis)',
    'Produtos alimentares (perecíveis / refrigerados)',
    'Vestuario / Calcado / Texteis',
    'Mobiliario / Decoracao',
    'Material de construcao',
    'Ferramentas / Equipamento industrial',
    'Obras de arte / Antiguidades (frágil)',
    'Vidro / Ceramica (frágil)',
    'Livros / Papel / Editorial',
    'Cosmetica / Perfumaria',
    'Brinquedos / Jogos',
    'Plantas / Flores',
    'Material de escritório',
    'Equipamento desportivo',
    'Instrumentos musicais',
    'Joalharia / Relojoaria',
    'Amostras comerciais',
    'Outro',
  ].map((v, i) => ({ valor: v, label: v, categoria: null, ordem: i * 10, active: true })),

  // Os que identificam um serviço que a operação não faz. A categoria está aqui, ao
  // lado do valor, e é isso que impede a lista e a triagem de divergirem.
  { valor: 'Mudança de casa / escritório',    label: 'Mudança de casa / escritório',    categoria: 'mudancas',      ordem: 1000, active: true },
  { valor: 'Viatura (carro, mota, atrelado)', label: 'Viatura (carro, mota, atrelado)', categoria: 'viaturas',      ordem: 1010, active: true },
  { valor: 'Carga refrigerada / congelada',   label: 'Carga refrigerada / congelada',   categoria: 'temperatura',   ordem: 1020, active: true },
  { valor: 'Mercadorias perigosas (ADR)',     label: 'Mercadorias perigosas (ADR)',     categoria: 'adr',           ordem: 1030, active: true },
  { valor: 'Grande volume / fora de medidas', label: 'Grande volume / fora de medidas', categoria: 'fora_gabarito', ordem: 1040, active: true },
];

/**
 * Lê a lista, semeando-a na primeira vez.
 *
 * A sementeira é idempotente e acontece só com a colecção vazia: quem apagar uma opção
 * de propósito não a vê voltar a aparecer.
 */
export async function lerMateriais(db: Db, apenasActivos = false): Promise<CrmMaterial[]> {
  const col = db.collection('crm_materiais');

  if (await col.countDocuments({}) === 0) {
    try {
      await col.insertMany(MATERIAIS_INICIAIS.map((m) => ({ ...m, updatedAt: new Date() })) as any[]);
      await col.createIndex({ valor: 1 }, { unique: true });
    } catch { /* corrida entre dois pedidos: quem perdeu lê o que o outro semeou */ }
  }

  const filtro = apenasActivos ? { active: true } : {};
  const docs: any[] = await col.find(filtro).sort({ ordem: 1, label: 1 }).toArray();
  return docs.map((d) => ({ ...d, _id: String(d._id) })) as CrmMaterial[];
}

/**
 * Categoria de um material, pela lista da base de dados.
 *
 * Devolve `undefined` quando o material não está na lista — e aí quem chamou deve cair
 * nas regras de texto de `lib/crm/categorias.ts`. É o que acontece com leads antigas,
 * gravadas antes de a opção existir, e com leads que não vêm do quiz.
 */
export async function categoriaDoMaterialBD(db: Db, material?: string): Promise<CrmCategoria | null | undefined> {
  const v = String(material ?? '').trim();
  if (!v) return undefined;
  try {
    const doc: any = await db.collection('crm_materiais').findOne({ valor: v }, { projection: { categoria: 1 } } as any);
    return doc ? (doc.categoria ?? null) : undefined;
  } catch {
    return undefined;
  }
}

/** Uma opção já foi usada por alguma lead? Se sim, o `valor` deixa de poder mudar. */
export async function materialEmUso(db: Db, valor: string): Promise<number> {
  return db.collection('messages').countDocuments({ 'leadData.material': valor });
}
