import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { hash } from 'bcryptjs';

// GET — listar utilizadores (só administrator)
export async function GET() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }
  const db = await getDb();
  const users = await db.collection('dashboardUsers')
    .find({}, { projection: { password: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
  return Response.json({ success: true, users });
}

// POST — criar utilizador (só administrator)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }
  const { name, email, password, role } = await request.json();
  if (!email || !password || !role) {
    return Response.json({ error: 'email, password e role são obrigatórios' }, { status: 400 });
  }
  const validRoles = ['administrator', 'Operator', 'commissionOperator'];
  if (!validRoles.includes(role)) {
    return Response.json({ error: 'Role inválido' }, { status: 400 });
  }
  const db = await getDb();
  const exists = await db.collection('dashboardUsers').findOne({ email: email.toLowerCase() });
  if (exists) return Response.json({ error: 'Email já existe' }, { status: 409 });

  const hashed = await hash(password, 12);
  await db.collection('dashboardUsers').insertOne({
    name: name ?? email,
    email: email.toLowerCase(),
    password: hashed,
    role,
    active: true,
    createdAt: new Date(),
  });
  return Response.json({ success: true });
}
