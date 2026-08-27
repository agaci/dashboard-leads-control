import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { lerGestao, gravarGestao, adicionarComentario, apagarComentario, type Autor } from '@/lib/leads/gestao';
import { idDeGestao } from '@/lib/leads/parYourbox';

/**
 * Gestão de uma lead — o mesmo que o card "Gestão" do leadsBoard da YourBox, sobre a
 * mesma colecção (`leadsMetadata`). Ver lib/leads/gestao.ts.
 *
 *   GET    /api/leads/<id>/gestao
 *   PATCH  /api/leads/<id>/gestao        { status, priority, notes, followUpDate, tags }
 *   POST   /api/leads/<id>/gestao        { text }            -> novo comentário
 *   DELETE /api/leads/<id>/gestao?comentario=<cid>
 */

async function autorDaSessao(): Promise<Autor | null> {
  const session = await getServerSession(authOptions);
  const u: any = session?.user;
  if (!u) return null;
  return { nome: u.name || u.email || 'Operador', id: u.id ?? null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const autor = await autorDaSessao();
  if (!autor) return Response.json({ error: 'Sem sessão' }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  // A gestao vive contra a lead da plataforma YourBox quando existe gemea, para ser a
  // mesma que a equipa ve no leadsBoard. Ver lib/leads/parYourbox.ts.
  const chave = await idDeGestao(db, id);
  return Response.json({ success: true, gestao: await lerGestao(db, chave), partilhada: chave !== id });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const autor = await autorDaSessao();
  if (!autor) return Response.json({ error: 'Sem sessão' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();

    const chave = await idDeGestao(db, id);
    const gestao = await gravarGestao(db, chave, {
      status:       body.status,
      priority:     body.priority,
      notes:        body.notes,
      followUpDate: body.followUpDate,
      tags:         body.tags,
    }, autor);

    return Response.json({ success: true, gestao, partilhada: chave !== id });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const autor = await autorDaSessao();
  if (!autor) return Response.json({ error: 'Sem sessão' }, { status: 401 });

  try {
    const { id } = await params;
    const { text } = await req.json();
    if (typeof text !== 'string' || !text.trim()) {
      return Response.json({ error: 'Comentário vazio' }, { status: 400 });
    }
    const db = await getDb();
    const chave = await idDeGestao(db, id);
    return Response.json({ success: true, gestao: await adicionarComentario(db, chave, text, autor), partilhada: chave !== id });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const autor = await autorDaSessao();
  if (!autor) return Response.json({ error: 'Sem sessão' }, { status: 401 });

  try {
    const { id } = await params;
    const cid = new URL(req.url).searchParams.get('comentario');
    if (!cid) return Response.json({ error: 'comentario em falta' }, { status: 400 });
    const db = await getDb();
    const chave = await idDeGestao(db, id);
    return Response.json({ success: true, gestao: await apagarComentario(db, chave, cid), partilhada: chave !== id });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
