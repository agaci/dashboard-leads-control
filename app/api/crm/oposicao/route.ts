import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { registarOposicao } from '@/lib/crm/prospectos';
import { paginaEscolha, paginaHtml } from '@/lib/pagina';
import { validar } from '@/lib/crm/tokens';

/**
 * "Não quero receber mais contactos."
 *
 *   GET /api/crm/oposicao?p=<parceiro>&t=<token>          pergunta
 *   GET /api/crm/oposicao?p=<parceiro>&t=<token>&c=1      regista
 *
 * Vai no rodapé de todas as cartas de apresentação. É exigência legal em comunicação
 * comercial não solicitada — mesmo a um email por dia — e respeitá-lo é permanente.
 *
 * **Dois passos, como na autorização.** Varredores de segurança abrem as ligações dos
 * emails antes do destinatário; um link que registasse a oposição ao ser aberto tirava
 * empresas do funil por conta de um antivírus, e ninguém saberia porquê.
 *
 * Bloqueia angariação, não bloqueia transaccional: se esta empresa vier a ser parceira
 * por outra via, continua a receber as leads que compra.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const partnerId = searchParams.get('p') ?? '';
  const token = searchParams.get('t') ?? '';
  const confirmado = searchParams.get('c') === '1';

  if (!partnerId || !validar('oposicao', partnerId, token)) {
    return paginaHtml('Ligação inválida', 'Este link não é válido. Se recebeu esta mensagem por engano, ignore-a.', false);
  }

  if (!confirmado) {
    const base = `/api/crm/oposicao?p=${encodeURIComponent(partnerId)}&t=${encodeURIComponent(token)}`;
    return paginaEscolha(
      'Não receber mais contactos',
      'Confirma que não quer voltar a receber contactos nossos sobre parcerias? '
      + '<br><br><span style="font-size:13px;color:#888">É definitivo, e não afecta nada '
      + 'além destes contactos.</span>',
      [
        { label: 'Sim, não me contactem mais', url: `${base}&c=1` },
        { label: 'Afinal não', url: `${base}` },
      ],
    );
  }

  try {
    const db = await getDb();
    const r = await registarOposicao(db, partnerId);
    if (!r.ok) return paginaHtml('Não conseguimos registar', 'Houve um problema do nosso lado. Responda ao nosso email e tratamos disto à mão.', false);

    return paginaHtml(
      r.jaEstava ? 'Já estava registado' : 'Registado',
      'Não voltamos a escrever-lhe sobre parcerias. Obrigado por nos ter dito.',
    );
  } catch (err: any) {
    console.error('[crm/oposicao] falha', partnerId, err?.message ?? err);
    return paginaHtml('Não conseguimos registar', 'Houve um problema do nosso lado. Responda ao nosso email e tratamos disto à mão.', false);
  }
}
