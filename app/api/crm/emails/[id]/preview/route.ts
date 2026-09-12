import { NextRequest } from 'next/server';
import { modelo } from '@/lib/email/catalogo';
import { getDb } from '@/lib/mongodb';
import { lerTextosCarta } from '@/lib/crm/textos';
import { operadorDaSessao } from '@/lib/crm/sessao';

/**
 * O email renderizado, tal como sai.
 *
 *   GET /api/crm/emails/<id>/preview[?campo=valor&...]
 *
 * Devolve HTML e não JSON de propósito: a página mostra-o dentro de um `<iframe>`, e um
 * iframe com `src` isola os estilos do email dos estilos do dashboard sem ninguém ter de
 * pensar nisso. Os valores em falta caem na amostra de cada modelo.
 *
 * `X-Frame-Options: SAMEORIGIN` porque isto é para ser mostrado dentro do dashboard e em
 * mais lado nenhum.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) {
    return new Response('sem sessão', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const { id } = await params;
  // A previsualizacao mostra o texto que esta a valer, que e o mesmo que o envio usa.
  const textos = await lerTextosCarta(await getDb()).catch(() => undefined);
  const m = modelo(id, textos);
  if (!m) return new Response('modelo desconhecido', { status: 404 });

  const { searchParams } = new URL(request.url);
  const valores: Record<string, unknown> = {};
  for (const [k, v] of searchParams.entries()) {
    // `_v` e a versao do texto, e vai no endereco so para o iframe recarregar depois de
    // se gravar. Se entrasse nos valores, deixava de haver "sem valores" — e a carta
    // aparecia com os campos vazios em vez da amostra.
    if (k === '_v' || !v.trim()) continue;
    valores[k] = v;
  }

  try {
    const html = m.render(Object.keys(valores).length ? valores : undefined);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return new Response(`falha a montar o email: ${err.message}`, { status: 500 });
  }
}
