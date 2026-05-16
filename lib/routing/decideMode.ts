import type { RoutingDecision, LeadRoutingConfig } from '@/types/pricing';

export const defaultRoutingConfig: LeadRoutingConfig = {
  systemActive: true,
  alwaysBot: false,
  delayMinutesBeforeBot: 0,
  autoStartHour: 9,
  autoEndHour: 20,
  autoWeekends: false,
  defaultMarkup: 1.35,
  recolherMoradasCompletas: false,
  pagamentoAtivo: false,
  pagamentoProvider: 'paybylink',
  whatsappBotAtivo: false,
  whatsappNumero: '',
  evolutionApiUrl: '',
  evolutionApiKey: '',
  evolutionInstance: 'yourbox',
  aggEscalationThreshold: 0,
  urgencyPhone: '',
  assistantName: '',
};

export function decideMode(
  config: LeadRoutingConfig,
  urgencia: string,
  now: Date
): RoutingDecision {
  if (!config.systemActive) return 'MANUAL';
  if (config.alwaysBot) return 'AUTO';
  if (urgencia === '24 Horas') return 'MANUAL';

  // Hora e dia sempre em Portugal (UTC+0 Inverno / UTC+1 Verão)
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const hour = pt.getHours();
  const day  = pt.getDay(); // 0=Dom, 6=Sáb
  const isWeekend = day === 0 || day === 6;

  if (isWeekend && !config.autoWeekends) return 'MANUAL';
  if (hour < config.autoStartHour || hour >= config.autoEndHour) return 'MANUAL';

  return 'AUTO';
}

export function getResponseTimeText(now: Date): string {
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const h   = pt.getHours();
  const day = pt.getDay();
  const isWeekend = day === 0 || day === 6;

  if (!isWeekend && h >= 8 && h < 20)  return '5 minutos';
  if (!isWeekend && h >= 20 && h < 23) return '5 a 20 minutos';
  if (!isWeekend && (h >= 23 || h < 4)) return '20 min a 4 horas';
  if (!isWeekend && h >= 4 && h < 8)  return '10 a 60 minutos';
  if (isWeekend && h >= 8 && h < 20)  return '10 a 30 minutos';
  return 'próximo dia útil';
}
