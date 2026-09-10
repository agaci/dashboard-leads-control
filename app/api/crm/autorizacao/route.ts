import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { estadoDoLink, registarResposta } from '@/lib/crm/autorizacao';
import { lerConsulta } from '@/lib/crm/consultas';
import { GUIAO_AUTORIZACAO_EMAIL } from '@/lib/crm/guiao';
import { paginaEscolha, paginaHtml } from '@/lib/pagina';
import { validar } from '@/lib/crm/tokens';
import { esc } from '@/lib/html';

/**
 * O cliente responde ao pedido de autorização.
 *
 *   GET /api/crm/autorizacao?c=<consulta>&t=<token>          mostra a pergunta
 *   GET /api/crm/autorizacao?c=<consulta>&t=<token>&r=sim    regista a resposta
 *
 * **Os dois passos são a defesa, não uma cortesia.** Muitos servidores de email abrem
 * as ligações das mensagens antes de o destinatário as ler, à procura de malware —
 * Outlook, antivírus corporativos, alguns webmails. Um link que autorizasse ao ser
 * aberto dava consentimento por conta de um varredor automático, e um consentimento
 * assim é inválido e indefensável. Por isso o link do email só mostra a pergunta: quem
 * decide tem de carregar num botão desta página, e um varredor não carrega em botões.
 *
 * Pública de propósito: quem responde é o cliente, que nunca terá sessão no dashboard.
 * A assinatura garante que o link não foi fabricado; o resto das defesas está no estado
 * — só vale enquanto não expirar, só uma vez, e só para a consulta que o gerou.
 */

const RESPOSTAS: Record<string, 'sim' | 'nao'> = { sim: 'sim', nao: 'nao' };

const RECADOS: Record<string, { titulo: string; corpo: string }> = {
  invalido: {
    titulo: 'Ligação inválida',
    corpo: 'Este link não é válido. Se recebeu esta mensagem por engano, ignore-a.',
  },
  expirado: {
    titulo: 'Este pedido já expirou',
    corpo: 'Passou demasiado tempo desde que lhe escrevemos. Se ainda precisar do transporte, '
      + 'responda ao nosso email ou ligue-nos e tratamos disso.',
  },
  ja_respondido: {
    titulo: 'Já nos respondeu',
    corpo: 'Temos a sua resposta registada. Não precisa de fazer mais nada.',
  },
  ja_autorizado: {
    titulo: 'Já está tratado',
    corpo: 'Já temos a sua autorização registada. Não precisa de fazer mais nada.',
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const consultaId = searchParams.get('c') ?? '';
  const token = searchParams.get('t') ?? '';
  const escolha = searchParams.get('r') ?? '';

  if (!consultaId || !validar('autorizacao', consultaId, token)) {
    const { titulo, corpo } = RECADOS.invalido;
    return paginaHtml(titulo, corpo, false);
  }

  try {
    const db = await getDb();
    const consulta = await lerConsulta(db, consultaId);
    const estado = estadoDoLink(consulta);

    if (estado !== 'valido') {
      const { titulo, corpo } = RECADOS[estado] ?? RECADOS.invalido;
      return paginaHtml(titulo, corpo, estado === 'ja_autorizado' || estado === 'ja_respondido');
    }

    // Primeiro passo: a pergunta, com o texto à vista. O token viaja no link dos botões
    // para a assinatura não se perder entre um passo e o outro.
    if (!RESPOSTAS[escolha]) {
      const base = `/api/crm/autorizacao?c=${encodeURIComponent(consultaId)}&t=${encodeURIComponent(token)}`;
      return paginaEscolha(
        'A sua autorização',
        // O mesmo texto do email, outra vez: quem abre isto no telemóvel já não tem a
        // mensagem à frente, e ninguém deve decidir de memória.
        `${esc(GUIAO_AUTORIZACAO_EMAIL.texto)}<br/><br/>`
        + '<span style="font-size:13px;color:#888">Se não autorizar, o seu pedido fica connosco '
        + 'e não é passado a ninguém.</span>',
        [
          { label: 'Autorizo', url: `${base}&r=sim` },
          { label: 'Não autorizo', url: `${base}&r=nao` },
        ],
      );
    }

    const r = await registarResposta(db, consultaId, RESPOSTAS[escolha]);
    if (!r.ok) {
      const { titulo, corpo } = RECADOS[r.erro ?? 'invalido'] ?? RECADOS.invalido;
      return paginaHtml(titulo, corpo, false);
    }

    if (RESPOSTAS[escolha] === 'sim') {
      return paginaHtml(
        'Obrigado — está autorizado',
        'Vamos passar o seu pedido a uma empresa especializada, que o contacta directamente '
        + 'com uma proposta. A partir daqui é com ela que trata deste serviço.',
      );
    }

    return paginaHtml(
      'Registado — não vamos passar o seu pedido',
      'O seu pedido não segue para mais ninguém. Se precisar de alguma coisa, responda ao '
      + 'nosso email e falamos consigo.',
      false,
    );
  } catch (err: any) {
    console.error('[crm/autorizacao] falha a registar a resposta', consultaId, err?.message ?? err);
    return paginaHtml(
      'Não conseguimos registar a sua resposta',
      'Houve um problema do nosso lado. Responda ao nosso email e tratamos disto à mão.',
      false,
    );
  }
}
