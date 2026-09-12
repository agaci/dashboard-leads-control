import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { gravarTextoCarta, historicoTextos, lerTextosCarta } from '@/lib/crm/textos';
import { camposUsados } from '@/lib/crm/textosCarta';
import { APRESENTACOES } from '@/lib/crm/apresentacao';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * O texto das cartas de apresentação.
 *
 *   GET /api/crm/textos-carta[?historico=contexto]
 *   PUT /api/crm/textos-carta   { variante, assunto, abertura, oQueE[] }
 *
 * Gravar não substitui: cria uma versão nova (ver lib/crm/textos.ts). O rótulo da versão
 * fica no registo de cada envio, e é por ele que se sabe, mais tarde, qual das cartas é
 * que uma empresa recebeu.
 */

export async function GET(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const db = await getDb();
    const variante = new URL(request.url).searchParams.get('historico');
    if (variante) {
      return Response.json({ success: true, historico: await historicoTextos(db, variante) });
    }

    const textos = await lerTextosCarta(db);

    return Response.json({
      success: true,
      variantes: APRESENTACOES.map((a) => {
        const t = textos[a.id];
        return {
          id: a.id,
          nome: a.nome,
          quando: a.quando,
          versao: t.versao,
          criadoEm: t.criadoEm,
          criadoPor: t.criadoPor,
          assunto: t.assunto,
          abertura: t.abertura,
          oQueE: t.oQueE,
          // Que variáveis é que este texto precisa, lidas do próprio texto. É o que faz o
          // formulário de envio pedir exactamente o que a frase usa, sem uma segunda lista
          // a poder divergir dela.
          campos: camposUsados(t.abertura, ...t.oQueE),
        };
      }),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const body = await request.json();
    const db = await getDb();
    const r = await gravarTextoCarta(db, String(body.variante ?? ''), {
      assunto: body.assunto,
      abertura: body.abertura,
      oQueE: body.oQueE,
    }, operador.nome);

    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true, versao: r.versao });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
