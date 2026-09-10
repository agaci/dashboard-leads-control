import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { categoriaDeMaterialValida, lerMateriais, materialEmUso, type CrmMaterial } from '@/lib/crm/materiais';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Tipos de material do quiz (`crm_materiais`).
 *
 *   GET  /api/crm/materiais            PÚBLICO — a lista activa, para o quiz
 *   GET  /api/crm/materiais?todos=1    autenticado — inclui as desactivadas
 *   POST /api/crm/materiais            criar
 *
 * O GET público é o único do CRM sem sessão, e de propósito: o quiz é HTML estático
 * noutro domínio e precisa da lista para desenhar o menu. Não expõe nada sensível —
 * são as opções que qualquer visitante veria na página de qualquer forma.
 */

export async function GET(request: NextRequest) {
  try {
    const todos = new URL(request.url).searchParams.get('todos') === '1';
    // Ver as desactivadas é trabalho de operação, não do visitante.
    if (todos && !(await operadorDaSessao())) return semSessao();

    const db = await getDb();
    const materiais = await lerMateriais(db, !todos);

    return Response.json(
      { success: true, materiais },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          // O quiz pode servir-se de uma copia guardada: a lista muda raramente e nao
          // vale uma ida ao servidor por visita. O dashboard NAO pode — quem acabou de
          // apagar uma opcao tem de ver a lista sem ela. Com `max-age` nos dois, o CRUD
          // gravava bem e mostrava o estado de ha cinco minutos, o que se le como "nao
          // funciona".
          'Cache-Control': todos ? 'no-store' : 'public, max-age=300',
        },
      },
    );
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const body = await request.json();
    const valor = String(body.valor ?? '').trim();
    const label = String(body.label ?? '').trim() || valor;
    if (!valor) return Response.json({ error: 'valor é obrigatório' }, { status: 400 });

    // Vazio quer dizer "isto fazemos nós", e é a resposta mais comum — não é um campo
    // por preencher. Só se aceitam categorias da Linha B; ver lib/crm/materiais.ts.
    const categoria = body.categoria === '' || body.categoria == null ? null : body.categoria;
    const valida = categoriaDeMaterialValida(categoria);
    if (!valida.ok) return Response.json({ error: valida.erro }, { status: 400 });

    const db = await getDb();
    await lerMateriais(db);   // garante a sementeira e o índice único antes de inserir

    if (await db.collection('crm_materiais').countDocuments({ valor })) {
      return Response.json({ error: 'já existe uma opção com este valor' }, { status: 409 });
    }

    const doc: Omit<CrmMaterial, '_id'> = {
      valor, label, categoria,
      ordem: Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : (categoria ? 1100 : 900),
      active: body.active !== false,
      updatedAt: new Date(),
    };
    const res: any = await db.collection('crm_materiais').insertOne(doc as any);
    return Response.json({ success: true, id: String(res.insertedId) }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/** O quiz vive noutro domínio; o preflight tem de passar. */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export { materialEmUso };
