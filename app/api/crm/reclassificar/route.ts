import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { categoriasParaEscolher, reclassificar } from '@/lib/crm/reclassificar';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * A gerente de conta corrige a triagem de uma lead.
 *
 *   GET  /api/crm/reclassificar          catálogo de categorias, com a linha de cada uma
 *   POST /api/crm/reclassificar          { leadId, categoria, motivo }
 *
 * Serve os dois sentidos: uma lead servível que afinal não conseguimos fazer passa para a
 * Linha B e segue o caminho normal (autorização, distribuição, cobrança); e uma lead que
 * a triagem mandou para a Linha B e que afinal fazemos volta para a Linha A, para deixar
 * de sujar o quadro de "Por servir" — que é o que orienta a angariação de parceiros.
 *
 * As regras estão em lib/crm/reclassificar.ts.
 */

export async function GET() {
  if (!(await operadorDaSessao())) return semSessao();
  return Response.json({ success: true, categorias: categoriasParaEscolher() });
}

export async function POST(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const body = await request.json();
    const leadId = String(body.leadId ?? '').trim();
    if (!leadId) return Response.json({ error: 'leadId é obrigatório' }, { status: 400 });

    const db = await getDb();
    const r = await reclassificar(db, leadId, String(body.categoria ?? ''), String(body.motivo ?? ''), operador.nome);
    if (!r.ok) return Response.json({ error: r.erro, bloqueio: r.bloqueio }, { status: 400 });

    return Response.json({ success: true, consulta: r.consulta, mudouDeLinha: r.mudouDeLinha });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
