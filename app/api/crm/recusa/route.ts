import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { MOTIVOS_RECUSA, registarRecusa, type MotivoRecusa } from '@/lib/crm/consultas';
import { actualizarScore } from '@/lib/crm/outcomes';
import { paginaEscolha, paginaHtml } from '@/lib/crm/pagina';
import { operadorDaSessao } from '@/lib/crm/sessao';
import { validar } from '@/lib/crm/tokens';

/**
 * Janela de recusa de 24h (spec §6.3).
 *
 *   GET  /api/crm/recusa?c=<consulta>&p=<parceiro>&t=<token>[&m=<motivo>]   público, assinado
 *   POST /api/crm/recusa  { consultaId, partnerId, motivo }                 operadora
 *
 * O parceiro contesta uma lead inválida e recupera o crédito. É de propósito fácil: a
 * spec quer que ele reporte os negativos por interesse próprio, e são os negativos que
 * medem a qualidade das leads. Um formulário difícil não produziria dado nenhum.
 *
 * O link assinado não é autenticação — é a garantia de que não foi fabricado. O que o
 * protege a sério é o resto: só vale dentro das 24h, só uma vez por envio, e só para o
 * parceiro que recebeu aquela lead.
 */

const ROTULOS: Record<MotivoRecusa, string> = {
  contacto_errado: 'Contacto errado',
  duplicado: 'Lead duplicada',
  fora_ambito: 'Fora do meu âmbito',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const consultaId = searchParams.get('c') ?? '';
  const partnerId = searchParams.get('p') ?? '';
  const token = searchParams.get('t') ?? '';
  const motivo = searchParams.get('m') ?? '';

  if (!consultaId || !partnerId || !validar('recusa', `${consultaId}:${partnerId}`, token)) {
    return paginaHtml('Ligação inválida', 'Este link não é válido ou já expirou.', false);
  }

  // Sem motivo, pergunta-se — mantendo o token no link para não perder a assinatura.
  if (!(MOTIVOS_RECUSA as readonly string[]).includes(motivo)) {
    const base = `/api/crm/recusa?c=${encodeURIComponent(consultaId)}&p=${encodeURIComponent(partnerId)}&t=${encodeURIComponent(token)}`;
    return paginaEscolha(
      'Contestar esta lead',
      'Diga-nos qual foi o problema. O valor da lead volta para a sua carteira.',
      MOTIVOS_RECUSA.map((m) => ({ label: ROTULOS[m], url: `${base}&m=${m}` })),
    );
  }

  try {
    const db = await getDb();
    const r = await registarRecusa(db, consultaId, partnerId, motivo as MotivoRecusa, `parceiro:${partnerId}`);
    if (!r.ok) return paginaHtml('Não foi possível contestar', escapar(r.erro ?? 'erro desconhecido'), false);

    await actualizarScore(db, partnerId).catch(() => {});
    return paginaHtml('Lead contestada', 'O valor foi devolvido à sua carteira. Obrigado pelo reporte.');
  } catch (err: any) {
    return paginaHtml('Não foi possível contestar', escapar(err.message ?? 'erro'), false);
  }
}

/** A mesma coisa a partir do dashboard, quando o parceiro contesta por telefone. */
export async function POST(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return Response.json({ error: 'Sem sessão' }, { status: 401 });

  try {
    const body = await request.json();
    const consultaId = String(body.consultaId ?? '');
    const partnerId = String(body.partnerId ?? '');
    const motivo = String(body.motivo ?? '');

    const db = await getDb();
    const r = await registarRecusa(db, consultaId, partnerId, motivo as MotivoRecusa, operador.nome);
    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });

    await actualizarScore(db, partnerId).catch(() => {});
    return Response.json({ success: true, saldo: r.estornado });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function escapar(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
