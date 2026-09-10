import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { mudarEstadoParceiro } from '@/lib/crm/prospectos';
import { proximosEstados } from '@/lib/crm/angariacao';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * O estado de um parceiro no funil.
 *
 *   GET  /api/crm/parceiros/<id>/estado   para onde é que esta ficha pode ir
 *   POST /api/crm/parceiros/<id>/estado   { estado, motivo }
 *
 * Passa pela `transicao()` de lib/crm/angariacao.ts: só se anda pelos caminhos previstos,
 * e nada muda de estado sem motivo escrito.
 */

function paraOid(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();
  try {
    const { id } = await params;
    const db = await getDb();
    const p: any = await db.collection('crm_partners').findOne({ _id: paraOid(id) });
    return Response.json({ success: true, proximos: proximosEstados(p?.estado) });
  } catch {
    return Response.json({ success: true, proximos: proximosEstados(undefined) });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const r = await mudarEstadoParceiro(db, id, String(body.estado ?? ''), String(body.motivo ?? ''), operador.nome);
    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true, parceiro: r.parceiro });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
