import { NextRequest } from 'next/server';
import { modelo } from '@/lib/email/catalogo';
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
  const m = modelo(id);
  if (!m) return new Response('modelo desconhecido', { status: 404 });

  const { searchParams } = new URL(request.url);
  const valores: Record<string, unknown> = {};
  for (const [k, v] of searchParams.entries()) if (v.trim()) valores[k] = v;

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
