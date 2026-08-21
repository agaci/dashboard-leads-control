import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Procura utilizadores da plataforma YourBox (colecção `users`, partilhada com o backend
 * Meteor) para ligar um cliente de widget ao seu comissionista.
 *
 * GET /api/admin/yourbox-users?q=<nome|email>
 *
 * Só administradores: devolve dados de contas da plataforma.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Apenas administradores' }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return Response.json({ success: true, users: [] });

  // Sem escapes: descarta tudo o que nao seja letra, numero ou pontuacao de contacto.
  const esc = q.replace(/[^\p{L}\p{N}@._ -]/gu, '');
  if (!esc) return Response.json({ success: true, users: [] });
  const rx = new RegExp(esc, 'i');

  const db = await getDb();
  const users = await db.collection('users').find(
    { $or: [{ 'profile.name': rx }, { 'profile.company': rx }, { 'emails.address': rx }] },
    { projection: { 'profile.name': 1, 'profile.company': 1, 'profile.commissionUser': 1, 'profile.commissionLevel': 1, 'emails.address': 1, createdAt: 1 } },
  ).limit(15).toArray();

  return Response.json({
    success: true,
    users: users.map((u: any) => ({
      id:             String(u._id),
      name:           u.profile?.name ?? null,
      company:        u.profile?.company ?? null,
      email:          u.emails?.[0]?.address ?? null,
      // Comissionista actualmente atribuido a ESTE utilizador (quando ele e cliente)
      commissionUser:  u.profile?.commissionUser || null,
      commissionLevel: u.profile?.commissionLevel ?? null,
      createdAt:       u.createdAt ?? null,
    })),
  });
}
