import { catalogo } from '@/lib/email/catalogo';
import { getDb } from '@/lib/mongodb';
import { lerTextosCarta } from '@/lib/crm/textos';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * O catálogo dos emails que esta plataforma envia.
 *
 *   GET /api/crm/emails
 *
 * Só os metadados — o HTML de cada um vem da rota de pré-visualização, para a lista não
 * carregar oito documentos completos de cada vez que alguém abre o separador.
 */
export async function GET() {
  if (!(await operadorDaSessao())) return semSessao();

  // Os textos das cartas vem da base: o catalogo tem de mostrar o que esta a valer, e
  // nao o que estava em codigo quando isto foi escrito.
  const textos = await lerTextosCarta(await getDb()).catch(() => undefined);

  return Response.json({
    success: true,
    modelos: catalogo(textos).map(({ render, ...meta }) => meta),
  });
}
