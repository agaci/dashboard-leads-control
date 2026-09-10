import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { categoriaDeMaterialValida, materialEmUso } from '@/lib/crm/materiais';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Uma opção de material.
 *
 *   PUT    /api/crm/materiais/<id>   { label, categoria, ordem, active, valor? }
 *   DELETE /api/crm/materiais/<id>
 *
 * O `valor` só se pode mudar enquanto nenhuma lead o tiver usado, e apagar só se pode
 * enquanto nenhuma o tiver usado. Não é zelo excessivo: o valor é o que ficou gravado
 * em `leadData.material` e é o que a triagem lê. Mudá-lo depois deixa o histórico a
 * apontar para uma opção que já não existe, e ninguém dá por isso — as leads antigas
 * simplesmente deixam de ser explicáveis.
 *
 * Para tirar uma opção de circulação sem partir o passado: desactivar (`active: false`).
 * Deixa de aparecer no quiz e continua a explicar as leads que a usaram.
 */

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const oid = paraOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

    const body = await request.json();
    const db = await getDb();

    const actual: any = await db.collection('crm_materiais').findOne({ _id: oid });
    if (!actual) return Response.json({ error: 'Não encontrado' }, { status: 404 });

    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.label === 'string' && body.label.trim()) $set.label = body.label.trim();
    if (Number.isFinite(Number(body.ordem))) $set.ordem = Number(body.ordem);
    if ('active' in body) $set.active = !!body.active;

    if ('categoria' in body) {
      const c = body.categoria === '' || body.categoria == null ? null : body.categoria;
      const v = categoriaDeMaterialValida(c);
      if (!v.ok) return Response.json({ error: v.erro }, { status: 400 });
      $set.categoria = c;
    }

    // O valor só muda enquanto ninguém o tiver usado.
    const novoValor = typeof body.valor === 'string' ? body.valor.trim() : null;
    if (novoValor && novoValor !== actual.valor) {
      const usos = await materialEmUso(db, actual.valor);
      if (usos > 0) {
        return Response.json({
          error: `"${actual.valor}" já foi usado por ${usos} lead(s): o valor não pode mudar, senão o histórico fica sem explicação. Mude o texto que se mostra, ou desactive esta opção e crie outra.`,
        }, { status: 409 });
      }
      if (await db.collection('crm_materiais').countDocuments({ valor: novoValor })) {
        return Response.json({ error: 'já existe uma opção com esse valor' }, { status: 409 });
      }
      $set.valor = novoValor;
    }

    await db.collection('crm_materiais').updateOne({ _id: oid }, { $set });
    const doc: any = await db.collection('crm_materiais').findOne({ _id: oid });
    return Response.json({ success: true, material: { ...doc, _id: String(doc._id) } });
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
    const actual: any = await db.collection('crm_materiais').findOne({ _id: oid });
    if (!actual) return Response.json({ error: 'Não encontrado' }, { status: 404 });

    const usos = await materialEmUso(db, actual.valor);
    if (usos > 0) {
      return Response.json({
        error: `"${actual.valor}" foi usado por ${usos} lead(s). Desactive em vez de apagar: deixa de aparecer no quiz e continua a explicar essas leads.`,
      }, { status: 409 });
    }

    await db.collection('crm_materiais').deleteOne({ _id: oid });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
