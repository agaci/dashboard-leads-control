import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { lerInteraccoes, registarInteraccao } from '@/lib/crm/prospectos';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * A linha do tempo de um prospecto.
 *
 *   GET  /api/crm/parceiros/<id>/interaccoes
 *   POST /api/crm/parceiros/<id>/interaccoes  { tipo, resumo }
 *
 * Chamadas, emails, reuniões e notas na mesma lista. Quase sempre houve uma chamada antes
 * do email — se isto só soubesse registar emails, perdia-se metade da história que
 * explica porque é que aquele prospecto vale a pena.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();
  try {
    const { id } = await params;
    const db = await getDb();
    return Response.json({ success: true, interaccoes: await lerInteraccoes(db, id) });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const r = await registarInteraccao(db, id, String(body.tipo ?? ''), String(body.resumo ?? ''), operador.nome);
    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true, interaccao: r.interaccao }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
