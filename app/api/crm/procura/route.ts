import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { CATEGORIAS } from '@/lib/crm/categorias';
import { lerConfig } from '@/lib/crm/config';
import { quadroDeProcura } from '@/lib/crm/procuraNaoServida';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Procura por servir, por categoria e zona.
 *
 *   GET /api/crm/procura?dias=30
 *
 * É a lista de compras da angariação: onde faltam parceiros, quanto se deixou de
 * facturar, e — o que mais interessa — se o problema é falta de rede ou falta de saldo.
 * As duas coisas resolvem-se de maneiras opostas: uma com chamadas a empresas novas,
 * outra com uma chamada a quem já é parceiro.
 *
 * Devolve também quantos parceiros a célula já tem, para se saber quando parar de
 * angariar (SPECS-Angariacao-Parceiros §3).
 */

export async function GET(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const dias = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('dias') ?? '30'), 1), 365);
    const db = await getDb();

    const [quadro, cfg] = await Promise.all([quadroDeProcura(db, dias), lerConfig(db)]);

    // Quantos parceiros activos existem por categoria. Sem isto, uma célula com procura
    // alta e rede já feita aparecia ao lado de outra sem ninguém, como se fossem o mesmo
    // problema. A zona fica de fora da contagem de propósito: uma capacidade 'nacional'
    // cobre todas as zonas, e cruzá-las aqui daria uma imagem falsa de escassez.
    const caps: any[] = await db.collection('crm_capabilities').find({ active: true }).toArray();
    const parceirosPorCategoria: Record<string, number> = {};
    for (const c of caps) {
      const k = String(c.categoria);
      parceirosPorCategoria[k] = (parceirosPorCategoria[k] ?? 0) + 1;
    }

    return Response.json({
      success: true,
      dias,
      total: quadro.total,
      valor: quadro.valor,
      celulas: quadro.celulas.map((c) => ({
        ...c,
        label: CATEGORIAS[c.categoria]?.label ?? c.categoria,
        cpl: cfg.cpl?.[c.categoria] ?? 0,
        parceiros: parceirosPorCategoria[c.categoria] ?? 0,
      })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
