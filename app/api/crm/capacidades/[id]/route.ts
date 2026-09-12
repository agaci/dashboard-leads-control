import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { eCategoriaValida, normalizar } from '@/lib/crm/categorias';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';
import { zonasDeCapacidade } from '@/lib/crm/zonas';

/**
 * Uma linha de capacidade.
 *
 *   PUT    /api/crm/capacidades/<id>
 *   DELETE /api/crm/capacidades/<id>
 *
 * Apagar é seguro aqui, ao contrário do parceiro: uma capacidade não é referida por
 * nenhum envio nem por nenhum débito. O que se perde é a regra, não o histórico.
 */

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const oid = paraOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

    const body = await request.json();
    const $set: Record<string, unknown> = { updatedAt: new Date() };

    if (eCategoriaValida(body.categoria)) $set.categoria = body.categoria;
    // A mesma regra do POST, e da mesma funcao: era esta linha que convertia o vazio em
    // ['nacional'] e prendia a capacidade a "todo o pais" para sempre.
    if (Array.isArray(body.zonas)) $set.zonas = zonasDeCapacidade(body.zonas);
    if ('maxWeightKg' in body) $set.maxWeightKg = numero(body.maxWeightKg);
    if ('maxDimensionCm' in body) $set.maxDimensionCm = numero(body.maxDimensionCm);
    if ('adr' in body) $set.adr = !!body.adr;
    if ('temperatura' in body) $set.temperatura = !!body.temperatura;
    if (Array.isArray(body.tiposViatura)) $set.tiposViatura = body.tiposViatura.map(String);
    if (Number.isFinite(Number(body.prioridade))) $set.prioridade = Number(body.prioridade);
    if ('active' in body) $set.active = !!body.active;

    const db = await getDb();
    await db.collection('crm_capabilities').updateOne({ _id: oid }, { $set });
    const doc: any = await db.collection('crm_capabilities').findOne({ _id: oid });
    return Response.json({ success: true, capacidade: doc ? { ...doc, _id: String(doc._id) } : null });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const oid = paraOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });
    const db = await getDb();
    await db.collection('crm_capabilities').deleteOne({ _id: oid });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
