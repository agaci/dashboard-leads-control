import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { distribuir, lerConsulta, parceirosQueRecusaram } from '@/lib/crm/consultas';
import { requisitosDoPedido } from '@/lib/crm/capacidades';
import { procurarParceiros } from '@/lib/crm/procura';
import { lerCarteirasEmLote } from '@/lib/crm/carteira';
import { cplDaCategoria, lerConfig } from '@/lib/crm/config';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Distribuição de uma lead da Linha B.
 *
 *   GET  /api/crm/consultas/<id>/distribuir   pré-visualização: quem recebe, quanto paga
 *   POST /api/crm/consultas/<id>/distribuir   { maxParceiros?, forcarConfiancaBaixa? }
 *
 * O GET existe porque a distribuição cobra dinheiro a terceiros e não se desfaz com um
 * botão: a operadora vê primeiro quem vai receber, quanto vai ser debitado e quem ficou
 * de fora — e só depois carrega.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const db = await getDb();
    const consulta = await lerConsulta(db, id);
    if (!consulta) return Response.json({ error: 'Não encontrada' }, { status: 404 });
    if (consulta.route !== 'lead_sale') {
      return Response.json({ error: 'só as leads da Linha B se distribuem' }, { status: 400 });
    }

    const cfg = await lerConfig(db);
    const valorLead = cplDaCategoria(cfg, consulta.categoria);
    const { elegiveis, excluidos } = await procurarParceiros(db, requisitosDoPedido(consulta.categoria, consulta.pedido));
    const carteiras = await lerCarteirasEmLote(db, elegiveis.map((e) => String(e.parceiro._id)));
    const recusaram = await parceirosQueRecusaram(db, id);

    const maximo = Math.max(1, cfg.maxParceirosPorLead);
    let lugares = maximo;

    const candidatos = elegiveis.map((e) => {
      const partnerId = String(e.parceiro._id);
      const gratis = (e.parceiro.leadsGratisRestantes ?? 0) > 0;
      const custo = gratis ? 0 : valorLead;
      const saldo = carteiras.get(partnerId)?.saldo ?? 0;
      const jaRecusou = recusaram.has(partnerId);
      const podePagar = gratis || saldo >= custo;
      const recebe = !jaRecusou && podePagar && lugares > 0;
      if (recebe) lugares--;

      return {
        partnerId,
        nome: e.parceiro.nome,
        estado: e.parceiro.estado,
        score: e.parceiro.score,
        saldo,
        custo,
        gratis,
        recebe,
        motivo: jaRecusou
          ? 'já contestou esta lead'
          : podePagar
            ? (recebe ? 'recebe a lead' : 'fora do limite de parceiros por lead')
            : 'saldo insuficiente',
      };
    });

    return Response.json({
      success: true,
      crmActivo: cfg.active,
      categoria: consulta.categoria,
      confianca: consulta.triagem.confianca,
      valorLead,
      maxParceirosPorLead: maximo,
      candidatos,
      excluidos,
      avisos: avisos(cfg.active, valorLead, consulta.triagem.confianca, candidatos.some((c) => c.recebe)),
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
    const body = await request.json().catch(() => ({}));
    const db = await getDb();

    const r = await distribuir(db, id, operador.nome, {
      maxParceiros: Number.isFinite(Number(body.maxParceiros)) ? Number(body.maxParceiros) : undefined,
      forcarConfiancaBaixa: !!body.forcarConfiancaBaixa,
    });

    if (!r.ok) return Response.json({ error: r.erro, ...r }, { status: 400 });
    return Response.json({ success: true, ...r });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function avisos(activo: boolean, valorLead: number, confianca: string, alguemRecebe: boolean): string[] {
  const out: string[] = [];
  if (!activo) out.push('CRM inactivo na configuração: a distribuição vai ser recusada.');
  if (valorLead <= 0) out.push('Sem CPL definido para esta categoria.');
  if (confianca === 'baixa') out.push('Triagem com confiança baixa: confirme a categoria antes de distribuir.');
  if (!alguemRecebe) out.push('Nenhum parceiro está em condições de receber esta lead.');
  return out;
}
