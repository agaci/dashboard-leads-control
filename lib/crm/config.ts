import type { Db } from 'mongodb';
import type { CrmConfig } from '@/types/crm';

/**
 * Configuração viva do CRM (`crm_config`, `_id: 'crm_main'`).
 *
 * Os valores de partida saem da grelha da spec §5.2. A spec é explícita a dizer que
 * não se fixam preços de secretária (§5.3): estes são o ponto de partida para a
 * descoberta de preço, e é por isso que vivem na base de dados e não no código.
 */

export const CRM_CONFIG_ID = 'crm_main';

export const CONFIG_DEFAULT: CrmConfig = {
  active: false,   // desligado até a operação querer — não distribui leads por engano
  cpl: {
    // Grelha de partida da spec §5.2, no meio de cada intervalo.
    sobrepeso:     11,   // volumes/pesos grandes: €8-15
    fora_gabarito: 11,
    viaturas:      20,   // €15-25
    mudancas:      22,   // €15-30
    temperatura:   60,   // frio/ADR/especiais: €40-100+
    adr:           60,
    // Transporte corrente: mercado largo e concorrido, vale menos por lead. Nao esta na
    // grelha da spec §5.2 porque na altura nao se passavam estes servicos a ninguem.
    encomendas:     8,
    paletes:       12,
    distribuicao:  12,
  },
  // A spec defende a lead exclusiva: "lead exclusiva vale 3 a 5x uma lead partilhada".
  maxParceirosPorLead: 1,
  // A operadora decide, até que os dados mostrem que a triagem merece confiança.
  envioAutomatico: false,
  // Nasce desligado: liga-se quando não há ninguém de serviço. Ver CrmConfig.
  pedirAutorizacaoPorEmail: false,
  // 72h cobre uma lead de sexta à noite respondida na segunda de manhã. Passado isso o
  // link deixa de valer — um consentimento dado a um pedido que a pessoa já esqueceu
  // não é consentimento informado.
  autorizacaoValidadeHoras: 72,
  janelaRecusaHoras: 24,
  followUpHoras: 48,
  limiteAvisoSaldo: 25,
  leadsGratisTrial: 5,
  // Questão em aberto na spec §13. Assumido, não decidido: o reporte pesa mais porque
  // é o comportamento que a plataforma quer premiar, e a recusa pesa a seguir porque
  // é o sinal que mede a qualidade das leads.
  pesosScore: { reporte: 0.35, recusa: 0.25, cliente: 0.25, resposta: 0.15 },
};

export async function lerConfig(db: Db): Promise<CrmConfig> {
  const doc: any = await db.collection('crm_config').findOne({ _id: CRM_CONFIG_ID as any });
  if (!doc) return { ...CONFIG_DEFAULT };
  return {
    ...CONFIG_DEFAULT,
    ...doc,
    cpl: { ...CONFIG_DEFAULT.cpl, ...(doc.cpl ?? {}) },
    pesosScore: { ...CONFIG_DEFAULT.pesosScore, ...(doc.pesosScore ?? {}) },
  };
}

export async function gravarConfig(db: Db, campos: Partial<CrmConfig>): Promise<CrmConfig> {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof campos.active === 'boolean') $set.active = campos.active;
  if (typeof campos.envioAutomatico === 'boolean') $set.envioAutomatico = campos.envioAutomatico;
  if (typeof campos.pedirAutorizacaoPorEmail === 'boolean') $set.pedirAutorizacaoPorEmail = campos.pedirAutorizacaoPorEmail;
  if (campos.cpl && typeof campos.cpl === 'object') $set.cpl = campos.cpl;
  if (campos.pesosScore && typeof campos.pesosScore === 'object') $set.pesosScore = campos.pesosScore;
  for (const k of ['maxParceirosPorLead', 'janelaRecusaHoras', 'followUpHoras', 'limiteAvisoSaldo', 'leadsGratisTrial', 'autorizacaoValidadeHoras'] as const) {
    const v = campos[k];
    if (typeof v === 'number' && isFinite(v) && v >= 0) $set[k] = v;
  }

  await db.collection('crm_config').updateOne({ _id: CRM_CONFIG_ID as any }, { $set }, { upsert: true });
  return lerConfig(db);
}

/**
 * Preço da lead para uma categoria.
 *
 * Sem preço definido devolve 0, e o zero tem significado: a distribuição recusa-se a
 * entregar uma lead sem preço em vez de a dar de graça sem ninguém decidir isso.
 */
export function cplDaCategoria(cfg: CrmConfig, categoria: string): number {
  const v = cfg.cpl?.[categoria];
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
}
