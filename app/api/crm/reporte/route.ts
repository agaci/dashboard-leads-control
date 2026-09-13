import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { lerConsulta, mudarEstado } from '@/lib/crm/consultas';
import { actualizarScore, registarOutcome } from '@/lib/crm/outcomes';
import { marcarEstado, envioDaConsulta } from '@/lib/crm/dispatch';
import { paginaEscolha, paginaHtml } from '@/lib/pagina';
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

    // Segundo clique: diz-se o que ficou, e por onde se corrige. Responder "fica
    // registado" a quem acabou de escolher outra coisa era mandá-lo embora convencido de
    // que tinha corrigido.
    if (resultado.repetido) {
      const antes = ROTULOS[resultado.anterior ?? ''] ?? resultado.anterior ?? '';
      return paginaHtml(
        'Já tínhamos o seu reporte',
        // O rotulo tal como estava no botao que ele carregou da primeira vez: e assim que
        // ele reconhece o que escolheu, em vez de ter de traduzir um termo nosso.
        (antes ? `O que ficou registado foi: <strong>${escapar(String(antes))}</strong>. ` : '')
        + 'É esse que vale. Se foi engano, responda ao email que recebeu e corrigimos à mão.',
      );
    }

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
    // `repetido` vai na resposta: a operadora tem de saber que o reporte que ja la estava
    // se manteve, em vez de julgar que acabou de o mudar.
    return Response.json({ success: true, repetido: !!r.repetido, anterior: r.anterior });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Grava o reporte, se ainda não houver um.
 *
 * **Um reporte não se troca.** A chave única em `crm_outcomes` garante-o desde sempre: o
 * segundo clique bate no índice e nada muda. O que faltava era dizê-lo — a página
 * respondia "fica registado" na mesma, e quem tivesse clicado na opção errada ia-se
 * embora convencido de que a tinha corrigido.
 *
 * Fica imutável de propósito. O reporte alimenta o score e é a base de qualquer crédito;
 * deixá-lo trocar livremente era convidar a reportar "não fechei" para pedir estorno. O
 * caminho para um engano honesto é uma pessoa, e é isso que a página passa a dizer.
 */
async function gravar(
  db: any,
  consultaId: string,
  partnerId: string,
  tipo: string,
  valorBruto: unknown,
  actor: string,
): Promise<{ ok: boolean; erro?: string; repetido?: boolean; anterior?: string }> {
  if (!(TIPOS as readonly string[]).includes(tipo)) return { ok: false, erro: 'tipo de reporte inválido' };

  const consulta = await lerConsulta(db, consultaId);
  if (!consulta) return { ok: false, erro: 'consulta não encontrada' };

  const dispatch = await envioDaConsulta(db, consultaId, partnerId);
  if (!dispatch) return { ok: false, erro: 'este parceiro não recebeu esta lead' };

  const r = await registarOutcome(db, {
    consultaId,
    partnerId,
    fonte: 'parceiro',
    tipo,
    valorServico: numero(valorBruto),
    motivo: `reporte do parceiro: ${tipo}`,
    chaveUnica: `${consultaId}:${partnerId}:reporte`,
  });

  // Já havia reporte: não se mexe em mais nada. Marcar o envio outra vez ou recalcular o
  // score não mudaria resultado nenhum, e escreveria histórico por um clique que não
  // alterou nada.
  if (r.repetido) {
    return { ok: true, repetido: true, anterior: String(r.outcome?.tipo ?? '') };
  }

  // Um reporte é a primeira acção do parceiro sobre o envio, e alimenta a métrica de
  // responsividade. Falhar a transição não é motivo para perder o reporte.
  await marcarEstado(db, String(dispatch._id), 'aceite').catch(() => {});

  // 'entregue' -> 'em_reporte' é o que a spec prevê; se já lá estava, segue.
  if (consulta.estado === 'entregue') {
    await mudarEstado(db, consultaId, 'em_reporte', actor, `parceiro reportou: ${tipo}`);
  }

  await actualizarScore(db, partnerId).catch(() => {});
  return { ok: true, repetido: false };
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}

function escapar(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
