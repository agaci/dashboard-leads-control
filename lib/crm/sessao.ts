import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Quem está a fazer a operação.
 *
 * Todas as rotas do CRM precisam disto pela mesma razão: o `actor` entra no `history`
 * da consulta e no extracto da carteira. Um débito sem autor é um débito que ninguém
 * consegue explicar ao parceiro que reclamar.
 */

export interface Operador {
  nome: string;
  id: string | null;
  role?: string;
}

export async function operadorDaSessao(): Promise<Operador | null> {
  const session = await getServerSession(authOptions);
  const u: any = session?.user;
  if (!u) return null;
  return { nome: u.name || u.email || 'Operador', id: u.id ?? null, role: u.role };
}

/** Resposta pronta para quem chega sem sessão. */
export function semSessao(): Response {
  return Response.json({ error: 'Sem sessão' }, { status: 401 });
}
