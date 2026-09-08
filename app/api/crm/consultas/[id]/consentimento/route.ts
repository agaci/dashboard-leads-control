import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { registarConsentimento } from '@/lib/crm/consultas';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Autorização do cliente para o pedido seguir para uma empresa especializada.
 *
 *   GET  /api/crm/consultas/<id>/consentimento   devolve o guião a ler
 *   POST /api/crm/consultas/<id>/consentimento   { via: 'telefone' | 'email' }
 *
 * O RGPD exige que se consiga DEMONSTRAR o consentimento, não que se grave a chamada.
 * Gravar até piora: passa a ser preciso consentimento para a própria gravação, com
 * retenção e regras próprias.
 *
 * O que fica registado é quem autorizou, quando, por que via, quem recolheu — e o texto
 * exacto que foi lido. Sem o texto não se prova o que a pessoa ouviu, e é sobre isso que
 * uma reclamação se debruça.
 */

/**
 * A frase que a operadora lê. Fixa de propósito: se cada uma disser à sua maneira, não
 * há forma de demonstrar o que foi dito. Ao mudar o texto, muda-se também a versão — as
 * autorizações antigas continuam a apontar para o guião que os clientes ouviram.
 */
export const GUIAO_CONSENTIMENTO = {
  versao: 'v1',
  texto:
    'Este transporte não é dos que fazemos. Temos empresas especializadas que o fazem — '
    + 'quer que lhes passemos o seu pedido, com o seu contacto, para lhe apresentarem uma proposta? '
    + 'A YourBox deixa de tratar deste serviço a partir daí.',
};

const VIAS = ['telefone', 'email'];

export async function GET() {
  if (!(await operadorDaSessao())) return semSessao();
  return Response.json({ success: true, guiao: GUIAO_CONSENTIMENTO });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const via = VIAS.includes(body.via) ? body.via : 'telefone';

    const db = await getDb();
    const r = await registarConsentimento(db, id, via, operador.nome, GUIAO_CONSENTIMENTO);
    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true, consulta: r.consulta });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
