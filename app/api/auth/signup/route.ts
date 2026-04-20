import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { hash } from 'bcryptjs';

export async function POST(request: NextRequest) {
  const { name, email, password } = await request.json();

  if (!name || !email || !password) {
    return Response.json({ error: 'Nome, email e password são obrigatórios' }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json({ error: 'Password deve ter pelo menos 6 caracteres' }, { status: 400 });
  }

  const db = await getDb();
  const exists = await db.collection('dashboardUsers').findOne({ email: email.toLowerCase() });
  if (exists) return Response.json({ error: 'Este email já está registado' }, { status: 409 });

  const hashed = await hash(password, 12);
  await db.collection('dashboardUsers').insertOne({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hashed,
    role: 'Operator',
    active: false,
    createdAt: new Date(),
  });

  return Response.json({ success: true });
}
