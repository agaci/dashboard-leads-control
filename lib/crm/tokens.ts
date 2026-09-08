import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Ligações assinadas para quem não tem sessão no dashboard.
 *
 * Três usos, todos da spec:
 *   'recusa'    parceiro contesta uma lead inválida dentro da janela de 24h (§6.3)
 *   'reporte'   parceiro reporta o resultado da lead (§6.1)
 *   'followup'  cliente responde ao toque das 48h, resposta de um toque (§6.2)
 *
 * Mesmo padrão do lib/contactToken.ts que já serve o reengajamento: HMAC curto sobre o
 * id, sem guardar nada. Não é autenticação — é só a garantia de que o link não foi
 * fabricado. O que o link permite fazer está limitado por estado e por janela temporal
 * do lado de quem o recebe, e é aí que estão as defesas a sério.
 */

export type TipoToken = 'recusa' | 'reporte' | 'followup';

function segredo(): string {
  return process.env.CRM_TOKEN_SECRET || process.env.CONTACT_SECRET || process.env.CRON_SECRET || 'yb_crm_fallback';
}

export function assinar(tipo: TipoToken, id: string): string {
  return createHmac('sha256', segredo()).update(`${tipo}:${id}`).digest('hex').slice(0, 16);
}

/** Comparação em tempo constante — barato de fazer bem, e evita afinar o token à força. */
export function validar(tipo: TipoToken, id: string, token: string): boolean {
  const esperado = assinar(tipo, id);
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(token ?? ''));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function urlBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://leads.comgo.pt').replace(/\/$/, '');
}

/** Link para o parceiro recusar uma lead (janela de 24h). */
export function linkRecusa(consultaId: string, partnerId: string): string {
  return `${urlBase()}/api/crm/recusa?c=${consultaId}&p=${partnerId}&t=${assinar('recusa', `${consultaId}:${partnerId}`)}`;
}

/** Link para o parceiro reportar o resultado da lead. */
export function linkReporte(consultaId: string, partnerId: string): string {
  return `${urlBase()}/api/crm/reporte?c=${consultaId}&p=${partnerId}&t=${assinar('reporte', `${consultaId}:${partnerId}`)}`;
}

/**
 * Link do follow-up ao cliente. `r=1` resolveu, `r=0` não resolveu; a avaliação de 1 a 5
 * vem depois, na página de confirmação, com o mesmo token.
 */
export function linkFollowUp(consultaId: string, resolveu: boolean): string {
  return `${urlBase()}/api/crm/followup?c=${consultaId}&r=${resolveu ? 1 : 0}&t=${assinar('followup', consultaId)}`;
}
