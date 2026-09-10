import { catalogo } from '@/lib/email/catalogo';
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

  return Response.json({
    success: true,
    modelos: catalogo().map(({ render, ...meta }) => meta),
  });
}
