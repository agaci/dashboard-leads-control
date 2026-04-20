import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { hash } from 'bcryptjs';
import { ObjectId } from 'mongodb';

function isAdmin(session: any) {
  return session?.user?.role === 'administrator';
}

// PATCH — alterar role, active ou password
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: 'Não autenticado' }, { status: 401 });

  const selfId = (session.user as any)?.id ?? '';
  const { id: targetId } = await params;
  const isSelf = selfId === targetId;

  // Não-admin só pode alterar a própria password
  if (!isAdmin(session) && !isSelf) {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await request.json();
  const { role, active, password, name } = body;

  const $set: Record<string, any> = {};

  if (name !== undefined)     $set.name = name;
  if (password !== undefined && password.length >= 6) {
    $set.password = await hash(password, 12);
  }

  // Só administrator pode mudar role ou active
  if (isAdmin(session)) {
    if (role !== undefined) {
      const valid = ['administrator', 'Operator', 'commissionOperator'];
      if (!valid.includes(role)) return Response.json({ error: 'Role inválido' }, { status: 400 });
      $set.role = role;
    }
    if (active !== undefined) $set.active = !!active;
  }

  if (Object.keys($set).length === 0) {
    return Response.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const db = await getDb();
  let oid: ObjectId;
  try { oid = new ObjectId(targetId); } catch { return Response.json({ error: 'ID inválido' }, { status: 400 }); }

  await db.collection('dashboardUsers').updateOne({ _id: oid }, { $set });
  return Response.json({ success: true });
}

// DELETE — desactivar utilizador (não apaga, marca active: false)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return Response.json({ error: 'Sem permissão' }, { status: 403 });

  const { id } = await params;
  const selfId = (session!.user as any)?.id ?? '';
  if (selfId === id) {
    return Response.json({ error: 'Não pode desactivar a própria conta' }, { status: 400 });
  }

  const db = await getDb();
  let oid: ObjectId;
  try { oid = new ObjectId(id); } catch { return Response.json({ error: 'ID inválido' }, { status: 400 }); }

  await db.collection('dashboardUsers').updateOne({ _id: oid }, { $set: { active: false } });
  return Response.json({ success: true });
}
