import type { Db } from 'mongodb';
import { marcarEnvioFalhado, pedirAutorizacao, prepararPedido } from '@/lib/crm/autorizacao';
import type { ResultadoEntrada } from '@/lib/crm/entrada';
import { lerEstado, registarPulso } from './redundancia';
import { sendConfirmacaoPedidoEmail } from './resend';

/**
 * O email de confirmação que o cliente recebe assim que termina o quiz.
 *
 * Vive aqui e não dentro da rota do quiz porque tem uma decisão sua: leva ou não leva o
 * pedido de autorização. A resposta vem da triagem, que acaba de correr no mesmo pedido
 * HTTP — é essa simultaneidade que torna isto possível, e é a razão de este email ter
 * de ser nosso e não da plataforma antiga. Lá, a classificação da lead ainda não existe
 * quando o email sai.
 *
 * Nunca lança. É chamado do fluxo que regista a lead, e um email que falha não pode
 * fazer perder uma lead — a mesma regra de lib/crm/entrada.ts.
 */

export interface DadosConfirmacao {
  nome?: string;
  email?: string;
  origem?: string;
  destino?: string;
  urgencia?: string;
  viatura?: string | null;
  material?: string;
  volumes?: number | string | null;
  weightKg?: number | string | null;
  embalado?: string;
  multiMorada?: boolean;
}

export interface ResultadoConfirmacao {
  enviado: boolean;
  comAutorizacao: boolean;
  motivo?: string;
}

export async function enviarConfirmacaoDoPedido(
  db: Db,
  dados: DadosConfirmacao,
  triagem: ResultadoEntrada,
): Promise<ResultadoConfirmacao> {
  try {
    const email = String(dados.email ?? '').trim();
    if (!email || !email.includes('@')) return { enviado: false, comAutorizacao: false, motivo: 'sem_email' };
    if (!process.env.RESEND_API_KEY) return { enviado: false, comAutorizacao: false, motivo: 'sem_resend' };

    // Quem envia a confirmacao esta decidido em lib/email/redundancia.ts, e este lado tem
    // de o respeitar tanto como o outro — senao `modo: 'nodechef'` dava DUAS confirmacoes
    // ao mesmo cliente em vez de uma. E o modo que permite por isto em producao antes de a
    // plataforma antiga saber calar-se.
    //
    // Mesmo calados quanto a confirmacao, a autorizacao continua a ser nossa: a plataforma
    // antiga nao a sabe pedir. Nesse caso sai no seu email proprio.
    const estado = await lerEstado(db);
    if (estado.modo === 'nodechef') {
      const pedido = triagem.route === 'lead_sale' && triagem.consultaId
        ? await pedirAutorizacao(db, triagem.consultaId)
        : { enviado: false };
      return { enviado: false, comAutorizacao: pedido.enviado, motivo: 'confirmacao_e_do_nodechef' };
    }

    // Só a Linha B tem alguma coisa para autorizar. `prepararPedido` devolve `preparado:
    // false` sozinho quando o interruptor está em baixo, quando já há autorização, ou
    // quando já se perguntou — não é preciso repetir aqui nenhuma dessas condições.
    const pedido = triagem.route === 'lead_sale' && triagem.consultaId
      ? await prepararPedido(db, triagem.consultaId)
      : null;

    const ok = await sendConfirmacaoPedidoEmail({
      to: email,
      nome: String(dados.nome ?? ''),
      resumo: resumoDoPedido(dados),
      autorizacao: pedido?.preparado
        ? { texto: pedido.texto!, url: pedido.url!, validadeHoras: pedido.validadeHoras! }
        : null,
    });

    // O pedido ficou gravado antes de o email sair. Se o email não saiu, o registo tem
    // de dizê-lo, senão a consulta fica à espera de uma resposta a uma pergunta que
    // nunca foi feita.
    if (!ok && pedido?.preparado && triagem.consultaId) {
      await marcarEnvioFalhado(db, triagem.consultaId);
    }

    // O pulso diz a plataforma antiga que esta esta viva e ja tratou desta lead. Aqui
    // por ser o momento exacto em que isso e verdade; o cron de minuto a minuto e que
    // faz o trabalho nas horas sem movimento (ver lib/email/redundancia.ts).
    if (ok) await registarPulso(db);

    return { enviado: ok, comAutorizacao: !!pedido?.preparado };
  } catch (err: any) {
    console.error('[email/confirmacao] falha a enviar a confirmação', err?.message ?? err);
    return { enviado: false, comAutorizacao: false, motivo: err?.message ?? 'erro' };
  }
}

/**
 * O resumo que vai no email.
 *
 * Não é o mesmo texto que a operação vê: aqui só entra o que o cliente reconhece como
 * tendo escrito. Sem isto, uma pessoa que pediu orçamentos a três empresas na mesma
 * tarde não sabe a qual dos emails está a responder.
 *
 * As observações ficam de fora de propósito: são uma mistura do que a pessoa escreveu
 * com marcadores que a aplicação compôs ("[VARIAS MORADAS - ...]"), e devolver-lhe isso
 * mostra as costuras do sistema sem lhe dizer nada de novo.
 */
function resumoDoPedido(d: DadosConfirmacao): [string, string | null | undefined][] {
  const vol = numero(d.volumes);
  const kg = numero(d.weightKg);
  return [
    ['Recolha', d.origem],
    ['Entrega', d.multiMorada ? 'Varias moradas (porta-a-porta)' : d.destino],
    ['Material', d.material],
    ['Carga', [vol ? `${vol} volume${vol === 1 ? '' : 's'}` : '', kg ? `${kg} kg` : ''].filter(Boolean).join(' · ') || null],
    ['Urgencia', d.urgencia],
    ['Embalagem', d.embalado],
  ];
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}
