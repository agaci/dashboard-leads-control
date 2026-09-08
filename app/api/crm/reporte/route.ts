import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { lerConsulta, mudarEstado } from '@/lib/crm/consultas';
import { actualizarScore, registarOutcome } from '@/lib/crm/outcomes';
import { marcarEstado, envioDaConsulta } from '@/lib/crm/dispatch';
import { paginaEscolha, paginaHtml } from '@/lib/crm/pagina';
import { operadorDaSessao } from '@/lib/crm/sessao';
import { validar } from '@/lib/crm/tokens';

/**
 * Reporte de resultado pelo parceiro (spec §6.1).
 *
 *   GET  /api/crm/reporte?c=<consulta>&p=<parceiro>&t=<token>[&r=ganhou|perdeu&v=<valor>]
 *   POST /api/crm/reporte  { consultaId, partnerId, tipo, valorServico }
 *
 * As 5 leads grátis do trial não são grátis — são pagas em reporte. Este endpoint é o
 * sítio onde esse pagamento acontece, e por isso está desenhado para ser respondido num
 * toque, do telemóvel, sem sessão.
 *
 * O reporte é uma das três fontes, e a menos fiável das três: depende de um serviço que
 * a YourBox não controla. Serve para alimentar o score, não para facturar.
 */

const TIPOS = ['ganhou', 'perdeu', 'nao_executado'] as const;
const ROTULOS: Record<string, string> = {
  ganhou: 'Fechei o serviço',
  perdeu: 'Não fechei',
  nao_executado: 'Não chegou a realizar-se',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const consultaId = searchParams.get('c') ?? '';
  const partnerId = searchParams.get('p') ?? '';
  const token = searchParams.get('t') ?? '';
  const tipo = searchParams.get('r') ?? '';

  if (!consultaId || !partnerId || !validar('reporte', `${consultaId}:${partnerId}`, token)) {
    return paginaHtml('Ligação inválida', 'Este link não é válido ou já expirou.', false);
  }

  if (!(TIPOS as readonly string[]).includes(tipo)) {
    const base = `/api/crm/reporte?c=${encodeURIComponent(consultaId)}&p=${encodeURIComponent(partnerId)}&t=${encodeURIComponent(token)}`;
    return paginaEscolha(
      'Como correu esta lead?',
      'Um toque chega. Quem reporta sobe no ranking e recebe mais leads.',
      TIPOS.map((t) => ({ label: ROTULOS[t], url: `${base}&r=${t}` })),
    );
  }

  try {
    const db = await getDb();
    const resultado = await gravar(db, consultaId, partnerId, tipo, searchParams.get('v'), `parceiro:${partnerId}`);
    if (!resultado.ok) return paginaHtml('Não foi possível registar', escapar(resultado.erro ?? ''), false);
    return paginaHtml('Obrigado pelo reporte', 'Fica registado. É isto que mantém as leads a chegar.');
  } catch (err: any) {
    return paginaHtml('Não foi possível registar', escapar(err.message ?? 'erro'), false);
  }
}

export async function POST(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return Response.json({ error: 'Sem sessão' }, { status: 401 });

  try {
    const body = await request.json();
    const db = await getDb();
    const r = await gravar(db, String(body.consultaId ?? ''), String(body.partnerId ?? ''), String(body.tipo ?? ''), body.valorServico, operador.nome);
    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function gravar(
  db: any,
  consultaId: string,
  partnerId: string,
  tipo: string,
  valorBruto: unknown,
  actor: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!(TIPOS as readonly string[]).includes(tipo)) return { ok: false, erro: 'tipo de reporte inválido' };

  const consulta = await lerConsulta(db, consultaId);
  if (!consulta) return { ok: false, erro: 'consulta não encontrada' };

  const dispatch = await envioDaConsulta(db, consultaId, partnerId);
  if (!dispatch) return { ok: false, erro: 'este parceiro não recebeu esta lead' };

  await registarOutcome(db, {
    consultaId,
    partnerId,
    fonte: 'parceiro',
    tipo,
    valorServico: numero(valorBruto),
    motivo: `reporte do parceiro: ${tipo}`,
    chaveUnica: `${consultaId}:${partnerId}:reporte`,
  });

  // Um reporte é a primeira acção do parceiro sobre o envio, e alimenta a métrica de
  // responsividade. Falhar a transição não é motivo para perder o reporte.
  await marcarEstado(db, String(dispatch._id), 'aceite').catch(() => {});

  // 'entregue' -> 'em_reporte' é o que a spec prevê; se já lá estava, segue.
  if (consulta.estado === 'entregue') {
    await mudarEstado(db, consultaId, 'em_reporte', actor, `parceiro reportou: ${tipo}`);
  }

  await actualizarScore(db, partnerId).catch(() => {});
  return { ok: true };
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}

function escapar(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
