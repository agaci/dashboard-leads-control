import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { consultaDeLead, criarConsulta } from '@/lib/crm/consultas';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Consultas do CRM (`crm_consultas`).
 *
 *   GET  /api/crm/consultas?route=lead_sale&estado=entregue&categoria=adr
 *   POST /api/crm/consultas   { leadId }                     a partir de uma lead
 *   POST /api/crm/consultas   { cliente, pedido, origem }    manual (telefone, email)
 *
 * A criação nunca aceita categoria nem rota do cliente do API: são o resultado da
 * triagem automática (spec §3). Deixar passar uma categoria escolhida à mão seria abrir
 * a porta a "esta manda-se para fora" como decisão de momento, que é exactamente o que
 * a spec quer evitar.
 */

const ROUTES = ['lead_sale', 'subcontract'];

export async function GET(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { searchParams } = new URL(request.url);
    const limite = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const skip = Math.max(parseInt(searchParams.get('skip') ?? '0'), 0);

    const filtro: Record<string, unknown> = {};
    const route = searchParams.get('route');
    const estado = searchParams.get('estado');
    const categoria = searchParams.get('categoria');
    if (route && ROUTES.includes(route)) filtro.route = route;
    if (estado) filtro.estado = estado;
    if (categoria) filtro.categoria = categoria;
    // A ficha da lead usa isto para saber se ja existe consulta para ela.
    const leadId = searchParams.get('leadId');
    if (leadId) filtro['origem.leadId'] = leadId;

    const db = await getDb();
    const [docs, total] = await Promise.all([
      db.collection('crm_consultas').find(filtro).sort({ createdAt: -1 }).skip(skip).limit(limite).toArray() as Promise<any[]>,
      db.collection('crm_consultas').countDocuments(filtro),
    ]);

    return Response.json({
      success: true,
      total,
      skip,
      limit: limite,
      consultas: docs.map((d) => ({ ...d, _id: String(d._id) })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const body = await request.json();
    const db = await getDb();

    if (body.leadId) {
      const consulta = await consultaDeLead(db, String(body.leadId), operador.nome);
      return Response.json({ success: true, consulta }, { status: 201 });
    }

    const cliente = body.cliente ?? {};
    const pedido = body.pedido ?? {};
    if (!cliente.telefone && !cliente.email) {
      // Uma lead sem contacto não tem valor nenhum para vender, e não há a quem fazer
      // o follow-up das 48h. Recusar aqui é mais honesto do que descobrir depois.
      return Response.json({ error: 'a lead precisa de telefone ou email do cliente' }, { status: 400 });
    }

    const tipo = ['telefone', 'email', 'manual'].includes(body.origem?.tipo) ? body.origem.tipo : 'manual';
    const consulta = await criarConsulta(db, {
      origem: { tipo },
      cliente: {
        nome: cliente.nome ? String(cliente.nome).trim() : undefined,
        telefone: cliente.telefone ? String(cliente.telefone).trim() : undefined,
        email: cliente.email ? String(cliente.email).trim() : undefined,
      },
      pedido: {
        origem: pedido.origem ? String(pedido.origem) : undefined,
        destino: pedido.destino ? String(pedido.destino) : undefined,
        urgencia: pedido.urgencia ? String(pedido.urgencia) : undefined,
        viatura: pedido.viatura ? String(pedido.viatura) : undefined,
        weightKg: numero(pedido.weightKg),
        nVolumes: numero(pedido.nVolumes),
        totalCm: numero(pedido.totalCm),
        observacoes: pedido.observacoes ? String(pedido.observacoes) : undefined,
      },
      texto: body.texto ? String(body.texto) : undefined,
    }, operador.nome);

    return Response.json({ success: true, consulta }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}
