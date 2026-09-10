import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { gravarModo, lerEstado, PULSO_VALIDADE_MIN } from '@/lib/email/redundancia';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Quem envia o email de confirmação ao cliente.
 *
 *   GET /api/crm/email-cliente   estado e idade do pulso
 *   PUT /api/crm/email-cliente   { modo: 'auto' | 'nodechef' | 'leads' }
 *
 * O modo normal é `auto` e não se mexe: a decisão sai da idade do pulso, sem ninguém a
 * accionar nada (ver lib/email/redundancia.ts). Os outros dois existem para forçar a mão
 * durante uma manutenção — e ficam registados com o nome de quem os pôs assim, porque um
 * `leads` esquecido ligado com este servidor em baixo deixa os clientes sem confirmação
 * nenhuma.
 */

export async function GET() {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const db = await getDb();
    const estado = await lerEstado(db);
    return Response.json({ success: true, estado, validadeMinutos: PULSO_VALIDADE_MIN });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const body = await request.json();
    const db = await getDb();
    const estado = await gravarModo(db, String(body.modo ?? ''), operador.nome);
    return Response.json({ success: true, estado, validadeMinutos: PULSO_VALIDADE_MIN });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
