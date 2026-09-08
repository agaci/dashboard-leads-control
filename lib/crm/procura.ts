import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { CrmCapability, CrmPartner } from '@/types/crm';
import {
  capacidadeServe, ordenar,
  type MotivoExclusao, type ParceiroElegivel, type RequisitosServico,
} from './capacidades';

/**
 * A procura de parceiros na base de dados.
 *
 * O critério — que capacidade serve que pedido, e por que ordem entram — é de
 * lib/crm/capacidades.ts, sem imports de runtime, para se poder testar sem Mongo. Aqui
 * fica só o que traz as linhas e as cruza.
 */

export interface ResultadoProcura {
  elegiveis: ParceiroElegivel[];
  excluidos: MotivoExclusao[];
}

/**
 * Parceiros que podem servir o pedido, já ordenados.
 *
 * Devolve também quem ficou de fora e porquê: sem isso, "não há parceiros" é uma
 * resposta impossível de investigar, e é a que a operadora vai ver no pior dia.
 * Parceiros suspensos nunca entram.
 */
export async function procurarParceiros(db: Db, req: RequisitosServico): Promise<ResultadoProcura> {
  const caps: any[] = await db
    .collection('crm_capabilities')
    .find({ categoria: req.categoria, active: true })
    .toArray();

  if (!caps.length) return { elegiveis: [], excluidos: [] };

  const partnerIds = [...new Set(caps.map((c) => String(c.partnerId)))];
  const parceiros: any[] = await db
    .collection('crm_partners')
    .find({ _id: { $in: partnerIds.map(paraOid).filter(Boolean) as any[] } })
    .toArray();

  const porId = new Map<string, CrmPartner>();
  for (const p of parceiros) porId.set(String(p._id), { ...p, _id: String(p._id) } as CrmPartner);

  const elegiveis: ParceiroElegivel[] = [];
  const excluidos: MotivoExclusao[] = [];

  for (const raw of caps) {
    const cap: CrmCapability = { ...raw, _id: String(raw._id), partnerId: String(raw.partnerId) };
    const parceiro = porId.get(cap.partnerId);
    if (!parceiro) {
      excluidos.push({ partnerId: cap.partnerId, motivo: 'capacidade órfã: parceiro não existe' });
      continue;
    }
    if (parceiro.estado === 'suspenso') {
      excluidos.push({ partnerId: cap.partnerId, motivo: 'parceiro suspenso' });
      continue;
    }

    const veredicto = capacidadeServe(cap, req);
    if (veredicto.serve) elegiveis.push({ parceiro, capacidade: cap, rank: 0 });
    else excluidos.push({ partnerId: cap.partnerId, motivo: veredicto.motivo });
  }

  return { elegiveis: ordenar(elegiveis), excluidos };
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
