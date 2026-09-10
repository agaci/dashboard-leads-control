import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { enviarApresentacao } from '@/lib/crm/prospectos';
import { emailsConhecidos } from '@/lib/crm/angariacao';
import { APRESENTACOES } from '@/lib/crm/apresentacao';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Enviar (ou reenviar) a carta de apresentação a um prospecto.
 *
 *   GET  /api/crm/parceiros/<id>/apresentacao   cartas disponíveis e endereços conhecidos
 *   POST /api/crm/parceiros/<id>/apresentacao   { variante, valores, para, motivo }
 *
 * Não há limite de envios: o reenvio é uma resposta a um pedido da própria empresa, e um
 * travão automático bloquearia o caso que o justifica. O que existe em vez do travão é o
 * registo — para quem, quando, por quem, porquê, e com que versão do texto.
 */

function paraOid(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();
  try {
    const { id } = await params;
    const db = await getDb();
    const p: any = await db.collection('crm_partners').findOne({ _id: paraOid(id) });
    return Response.json({
      success: true,
      cartas: APRESENTACOES.map((a) => ({ id: a.id, nome: a.nome, quando: a.quando, assunto: a.assunto, campos: a.campos })),
      enderecos: p ? emailsConhecidos(p) : [],
      podeEnviar: p?.estado !== 'opos_se',
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const r = await enviarApresentacao(
      db, id,
      String(body.variante ?? ''),
      (body.valores ?? {}) as Record<string, unknown>,
      String(body.para ?? ''),
      String(body.motivo ?? ''),
      operador.nome,
    );
    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true, para: r.para, versao: r.versao });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
