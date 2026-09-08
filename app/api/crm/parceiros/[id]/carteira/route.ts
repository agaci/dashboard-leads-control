import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { ajustar, carregar, extracto, lerCarteira } from '@/lib/crm/carteira';
import { lerConfig } from '@/lib/crm/config';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Carteira pré-paga de um parceiro (spec §5.4).
 *
 *   GET  /api/crm/parceiros/<id>/carteira
 *   POST /api/crm/parceiros/<id>/carteira   { valor, tipo: 'carregamento' | 'ajuste', motivo }
 *
 * Débitos e estornos NÃO se fazem por aqui: nascem sempre de um envio, em
 * lib/crm/consultas.ts, para que cada movimento tenha um `dispatchId` a que se agarrar.
 * O que a operação faz à mão é carregar saldo e, em último caso, corrigi-lo.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const db = await getDb();
    const cfg = await lerConfig(db);
    const [carteira, movimentos] = await Promise.all([
      lerCarteira(db, id, cfg.limiteAvisoSaldo),
      extracto(db, id, 100),
    ]);
    return Response.json({ success: true, carteira, movimentos });
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
    const valor = Number(body.valor);
    if (!isFinite(valor) || valor === 0) return Response.json({ error: 'valor inválido' }, { status: 400 });

    const db = await getDb();
    const oid = paraOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });
    const existe = await db.collection('crm_partners').countDocuments({ _id: oid as any });
    if (!existe) return Response.json({ error: 'parceiro não encontrado' }, { status: 404 });

    const tipo = body.tipo === 'ajuste' ? 'ajuste' : 'carregamento';
    const motivo = String(body.motivo ?? '').trim();

    const r = tipo === 'ajuste'
      ? await ajustar(db, id, valor, operador.nome, motivo)
      : await carregar(db, id, Math.abs(valor), operador.nome, motivo || 'carregamento de saldo');

    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true, saldo: r.saldo });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
