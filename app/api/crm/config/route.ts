import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { CATEGORIAS_ORDENADAS } from '@/lib/crm/categorias';
import { gravarConfig, lerConfig } from '@/lib/crm/config';
import { limitesDeTabela } from '@/lib/crm/triagem';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Configuração do CRM (`crm_config`, `_id: 'crm_main'`).
 *
 *   GET /api/crm/config   config + catálogo de categorias + limites de tabela em vigor
 *   PUT /api/crm/config   { active, cpl, maxParceirosPorLead, janelaRecusaHoras, ... }
 *
 * Os limites de tabela vão na resposta porque são o que separa uma carga servível de
 * uma lead para vender, e não estão em lado nenhum da configuração: saem das tarifas
 * activas dos parceiros logísticos. Vê-los aqui evita a pergunta "porque é que esta
 * lead de 300 kg foi para fora?".
 */

export async function GET() {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const db = await getDb();
    const [config, limites] = await Promise.all([lerConfig(db), limitesDeTabela(db)]);
    return Response.json({
      success: true,
      config,
      limites,
      categorias: CATEGORIAS_ORDENADAS.map((c) => ({
        id: c.id, label: c.label, route: c.route, descricao: c.descricao,
        // O que o parceiro pode declarar. Os formularios filtram por isto e nao pela
        // rota: sao perguntas diferentes, e andavam coladas por acaso.
        declaravel: !!c.declaravel,
      })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const body = await request.json();
    const db = await getDb();

    // O CPL só aceita categorias conhecidas e valores positivos: um preço a zero numa
    // categoria faz a distribuição recusar-se a entregar, e é melhor que isso seja uma
    // decisão explícita do que o resultado de um campo mal preenchido.
    let cpl: Record<string, number> | undefined;
    if (body.cpl && typeof body.cpl === 'object') {
      cpl = {};
      for (const c of CATEGORIAS_ORDENADAS) {
        const v = Number(body.cpl[c.id]);
        if (isFinite(v) && v > 0) cpl[c.id] = Math.round(v * 100) / 100;
      }
    }

    const config = await gravarConfig(db, {
      active: body.active,
      envioAutomatico: body.envioAutomatico,
      pedirAutorizacaoPorEmail: body.pedirAutorizacaoPorEmail,
      autorizacaoValidadeHoras: body.autorizacaoValidadeHoras,
      cpl,
      pesosScore: body.pesosScore,
      maxParceirosPorLead: body.maxParceirosPorLead,
      janelaRecusaHoras: body.janelaRecusaHoras,
      followUpHoras: body.followUpHoras,
      limiteAvisoSaldo: body.limiteAvisoSaldo,
      leadsGratisTrial: body.leadsGratisTrial,
    });

    return Response.json({ success: true, config });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
