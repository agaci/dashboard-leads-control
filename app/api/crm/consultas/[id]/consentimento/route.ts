import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { registarConsentimento } from '@/lib/crm/consultas';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';
// O texto passou a viver em lib/crm/guiao.ts: o email automatico precisa do mesmo,
// e uma rota nao e sitio de onde outra parte do sistema deva importar.
import { GUIAO_CONSENTIMENTO } from '@/lib/crm/guiao';
export { GUIAO_CONSENTIMENTO };

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
