import type { Db } from 'mongodb';
import { LIMITES_FALLBACK, type LimitesTabela } from './categorias';

/**
 * A parte da triagem que precisa da base de dados.
 *
 * A decisão em si — regras, categorias, confiança — vive em lib/crm/categorias.ts, sem
 * um único import de runtime, para poder ser testada sem Mongo. Aqui fica só o que não
 * dá para fazer sem ir à base: descobrir o que os parceiros de tabela aceitam hoje.
 */

export { triar, normalizar, LIMITES_FALLBACK } from './categorias';
export type { SinaisTriagem, ResultadoTriagem, LimitesTabela } from './categorias';

/**
 * O que os parceiros de tabela activos aceitam hoje, em peso e dimensão.
 *
 * Tira-se o máximo entre tarifas activas: basta um parceiro aceitar para a carga ser
 * servível sem ir para venda de lead. Se não houver tarifas carregadas, devolve o
 * fallback — o CRM não pode deixar de triar por a tabela estar vazia.
 */
export async function limitesDeTabela(db: Db): Promise<LimitesTabela> {
  try {
    const tarifas: any[] = await db
      .collection('partnerTariffs')
      .find({ active: true }, { projection: { conditions: 1 } } as any)
      .toArray();

    let maxKg = 0;
    let maxCm = 0;
    for (const t of tarifas) {
      const kg = Number(t?.conditions?.maxWeightPerExpedition);
      const cm = Number(t?.conditions?.maxDimensionCm);
      if (isFinite(kg) && kg > maxKg) maxKg = kg;
      if (isFinite(cm) && cm > maxCm) maxCm = cm;
    }

    return {
      maxKg: maxKg > 0 ? maxKg : LIMITES_FALLBACK.maxKg,
      maxCm: maxCm > 0 ? maxCm : LIMITES_FALLBACK.maxCm,
    };
  } catch {
    // Uma falha a ler a tabela não pode parar a triagem: com o fallback a lead é
    // classificada na mesma, e no pior caso fica na operação própria.
    return LIMITES_FALLBACK;
  }
}
