import type { Conversation, BotResponse, ConversationStep } from '@/types/agent';
import type { PartnerPriceResult } from '@/types/partner';
import { isEscalationRequest, isPriceShock } from './matcher';
import { getSituacaoById } from './situacoes';
import { parseWeight } from './partnerPricing';

// Perguntas de qualificação — fluxo principal
const QUESTIONS: Record<ConversationStep, { text: string; quickReplies?: string[] }> = {
  COLLECTING_ORIGEM: {
    text: 'Qual é o local de *recolha*? (morada ou cidade)',
  },
  COLLECTING_DESTINO: {
    text: 'E o local de *entrega*?',
  },
  COLLECTING_VIATURA: {
    text: 'Que tipo de transporte precisa?\n\n*Moto* — até 2 kg\n*Furgão Classe 1* — até 150 kg\n*Furgão Classe 2* — acima de 150 kg',
    quickReplies: ['Moto', 'Furgão Classe 1', 'Furgão Classe 2'],
  },
  COLLECTING_URGENCIA: {
    text: 'Qual a urgência?\n\n*1 Hora* — entrega em 1 hora\n*4 Horas* — entrega em 4 horas\n*24 Horas* — entrega no dia seguinte',
    quickReplies: ['1 Hora', '4 Horas', '24 Horas'],
  },
  COLLECTING_NOME: {
    text: 'Para finalizar — qual é o seu nome?',
  },
  COLLECTING_EMAIL: {
    text: 'E o seu email para receber confirmação? (ou responda *não* para saltar)',
  },
  COLLECTING_ORIGEM_COMPLETA: {
    text: 'Para confirmar a recolha, indique a morada completa:\n\n_(Rua, número, código postal, localidade)_',
  },
  CONFIRMING_ORIGEM_COMPLETA: { text: '' },
  COLLECTING_DESTINO_COMPLETA: {
    text: 'E a morada completa de entrega?\n\n_(Rua, número, código postal, localidade)_',
  },
  CONFIRMING_DESTINO_COMPLETA: { text: '' },
  COLLECTING_DETALHES_RECOLHA: {
    text: 'Quem estará disponível para a recolha?\n\nIndique *nome*, *telefone* e *janela horária* _(ex: João Silva, 912 345 678, 09:00-12:00)_',
    quickReplies: ['09:00-12:00', '12:00-17:00', '17:00-20:00'],
  },
  COLLECTING_DETALHES_ENTREGA: {
    text: 'E na entrega — quem estará disponível para receber?\n\nNome, telefone e janela horária:',
    quickReplies: ['09:00-12:00', '12:00-17:00', '17:00-20:00'],
  },
  INIT: { text: '' },
  COLLECTING_WEIGHT: { text: '' },
  CALCULATING_PRICE: { text: '' },
  PRESENTING_PRICE: { text: '' },
  PRESENTING_PARTNER_PRICE: { text: '' },
  HANDLING_OBJECTION: { text: '' },
  AWAITING_PAYMENT: { text: '' },
  LEAD_REGISTERED: { text: '' },
  ESCALATED_TO_HUMAN: { text: '' },
  CLOSED: { text: '' },
};

// Mensagem de boas-vindas (PSERV)
export function buildWelcomeMessage(): BotResponse {
  return {
    text: 'Bem-vindo à *YourBox*!\n\nSou o assistente automático e vou ajudá-lo a calcular o preço e agendar o seu transporte em segundos.\n\nVamos começar:',
    nextStep: 'COLLECTING_ORIGEM',
  };
}

// Resposta após preço calculado
export function buildPriceMessage(conv: Conversation): BotResponse {
  const { priceCalculated, priceWithDiscount, discount, distance, urgencia, viatura } = conv.data;

  const priceText = priceCalculated
    ? `*Orçamento Estimado*\n\n` +
      `~~€${priceCalculated!.toFixed(2)}~~  *-€${discount!.toFixed(2)}*\n` +
      `*€${priceWithDiscount!.toFixed(2)}* _Desconto de 10% incluído_\n\n` +
      `Distância: ${distance} km\n` +
      `Viatura: ${viatura}\n` +
      `Urgência: ${urgencia}\n\n` +
      `Pretende avançar com este serviço?`
    : 'Para calcular o preço, precisamos dos detalhes do serviço.';

  return {
    text: priceText,
    nextStep: 'PRESENTING_PRICE',
    quickReplies: ['Sim, avançar', 'Tenho dúvidas', 'Ver entrega amanhã'],
  };
}

// Introdução ao serviço de entrega para amanhã
export function build24hIntroMessage(): BotResponse {
  return {
    text: '*Entrega YourBox para Amanhã*\n\n' +
      'Recolha hoje, entrega garantida amanhã em qualquer ponto do país.\n\n' +
      'Para calcular o preço, indique o *peso total* do envio (em kg):',
    nextStep: 'COLLECTING_WEIGHT',
  };
}

// Objecção de preço
export function buildObjectionResponse(conv: Conversation): BotResponse {
  const objCount = conv.data.objectionCount + 1;

  if (objCount >= 2) {
    return {
      text: 'Vou passar o seu caso para um especialista da YourBox que poderá analisar a melhor solução para si.\n\nAguarde um momento — alguém entrará em contacto brevemente.',
      nextStep: 'ESCALATED_TO_HUMAN',
      escalate: true,
      situacaoId: 'SIT-001',
    };
  }

  const { priceWithDiscount, distance } = conv.data;
  const isLongDistance = (distance ?? 0) > 150;

  if (isLongDistance) {
    return {
      text: `Para este trajeto temos também a opção de *entrega amanhã* a um preço mais acessível. Quer que calcule?`,
      nextStep: 'HANDLING_OBJECTION',
      quickReplies: ['Ver entrega amanhã', 'Manter urgente', 'Cancelar'],
      situacaoId: 'SIT-001',
    };
  }

  return {
    text: `Entendo. O valor de *€${priceWithDiscount?.toFixed(2)}* já inclui o desconto de 10% e IVA. Cobre transporte dedicado com recolha em menos de 1 hora.\n\nPosso ajudar com algo mais?`,
    nextStep: 'PRESENTING_PRICE',
    quickReplies: ['Avançar', 'Ver entrega amanhã', 'Não obrigado'],
    situacaoId: 'SIT-001',
  };
}

// Escalamento para humano
export function buildEscalationMessage(): BotResponse {
  return {
    text: 'Claro! Vou transferir para um membro da equipa YourBox.\n\nTempo de resposta: *' +
      getResponseTimeLabel() +
      '*\n\nO seu pedido foi registado e será atendido em breve.',
    nextStep: 'ESCALATED_TO_HUMAN',
    escalate: true,
    situacaoId: 'SIT-041',
  };
}

// Apresentar preços de entrega amanhã (múltiplas janelas)
export function buildPartnerPriceMessage(
  prices: PartnerPriceResult[],
  kg: number,
): BotResponse {
  if (prices.length === 0) {
    return {
      text: 'Não foi possível calcular o preço para este envio. Um agente vai entrar em contacto.',
      nextStep: 'ESCALATED_TO_HUMAN',
      escalate: true,
    };
  }

  // prices já chegam ordenadas da mais cara (10h) para a mais barata (19h)
  const recommended = prices[Math.floor(prices.length / 2)];
  const lines = prices.map((p) => `*${p.serviceLabelShort}* — *€${p.finalPrice.toFixed(2)}*`);

  return {
    text:
      `*Entrega YourBox Amanhã — ${kg} kg*\n\n` +
      lines.join('\n') +
      `\n\nRecomendamos *${recommended.serviceLabelShort}* — €${recommended.finalPrice.toFixed(2)}\n\n` +
      `Escolha a janela de entrega:`,
    nextStep: 'PRESENTING_PARTNER_PRICE',
    quickReplies: prices.map((p) => `${p.serviceLabelShort} €${p.finalPrice.toFixed(2)}`).concat(['Cancelar']),
  };
}

// Resposta após confirmação do preço de parceiro
export function buildPartnerConfirmedMessage(price: PartnerPriceResult): BotResponse {
  return {
    text: `*${price.serviceLabelShort}* — *€${price.finalPrice.toFixed(2)}*\n\n` +
      `${price.deliveryDescription ?? ''}\n\n` +
      `Para finalizar o pedido — qual é o seu *nome*?`,
    nextStep: 'COLLECTING_NOME',
  };
}

// Lead registada com sucesso
export function buildLeadRegisteredMessage(nome: string, priceWithDiscount?: number): BotResponse {
  const priceText = priceWithDiscount
    ? `O preço confirmado é *€${priceWithDiscount.toFixed(2)}* (IVA incluído). `
    : '';

  return {
    text: `Perfeito, *${nome}*! O seu pedido foi registado.\n\n${priceText}A nossa equipa entrará em contacto em breve para confirmar os detalhes.\n\n_Obrigado por escolher a YourBox!_`,
    nextStep: 'LEAD_REGISTERED',
  };
}

// Resposta quando SIT específica é detectada
export function buildSituacaoResponse(sitId: string, conv: Conversation): BotResponse | null {
  const sit = getSituacaoById(sitId);
  if (!sit) return null;

  // Situações com resposta directa do script
  const abertura = sit.script_resposta?.['abertura'] ?? sit.script_resposta?.['quando_disponivel'];
  if (!abertura) return null;

  // Verificar se deve escalar
  const shouldEscalate = sit.escalamento_humano?.some((crit) =>
    crit.toLowerCase().includes('humano') || crit.toLowerCase().includes('escalar')
  );

  return {
    text: abertura,
    nextStep: conv.step,  // manter step actual — conversa continua
    situacaoId: sitId,
    escalate: shouldEscalate,
  };
}

// Processar mensagem recebida → gerar resposta
export function processMessage(conv: Conversation, mensagem: string): BotResponse {
  // Escalamento explícito
  if (isEscalationRequest(mensagem)) return buildEscalationMessage();

  // Saudação genérica — devolver a pergunta actual sem bloquear
  const trimmedLower = mensagem.trim().toLowerCase().replace(/[!.,?]+$/, '').trim();
  const GREETINGS = new Set(['bom dia', 'boa tarde', 'boa noite', 'olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'boas']);
  if (GREETINGS.has(trimmedLower) && conv.step !== 'INIT') {
    const q = QUESTIONS[conv.step];
    if (q?.text) return { text: q.text, nextStep: conv.step, quickReplies: q.quickReplies };
  }

  // Choque de preço
  if (isPriceShock(mensagem) && conv.step === 'PRESENTING_PRICE') {
    return buildObjectionResponse(conv);
  }

  // Processar de acordo com o step actual
  switch (conv.step) {
    case 'INIT':
      return buildWelcomeMessage();

    case 'COLLECTING_ORIGEM':
      return {
        text: `Recolha em *${mensagem}*.\n\n` + QUESTIONS.COLLECTING_DESTINO.text,
        nextStep: 'COLLECTING_DESTINO',
      };

    case 'COLLECTING_DESTINO':
      return {
        text: `Entrega em *${mensagem}*.\n\n` + QUESTIONS.COLLECTING_URGENCIA.text,
        nextStep: 'COLLECTING_URGENCIA',
        quickReplies: QUESTIONS.COLLECTING_URGENCIA.quickReplies,
      };

    case 'COLLECTING_VIATURA': {
      const viatura = normalizeViatura(mensagem);
      if (!viatura) {
        return {
          text: 'Por favor escolha uma das opções: *Moto*, *Furgão Classe 1* ou *Furgão Classe 2*.',
          nextStep: 'COLLECTING_VIATURA',
          quickReplies: QUESTIONS.COLLECTING_VIATURA.quickReplies,
        };
      }
      // Fluxo direto — calcular preço
      return { text: 'A calcular preço...', nextStep: 'CALCULATING_PRICE' };
    }

    case 'COLLECTING_URGENCIA': {
      const urgencia = normalizeUrgencia(mensagem);
      if (!urgencia) {
        return {
          text: 'Por favor escolha: *1 Hora*, *4 Horas* ou *24 Horas*.',
          nextStep: 'COLLECTING_URGENCIA',
          quickReplies: QUESTIONS.COLLECTING_URGENCIA.quickReplies,
        };
      }
      if (urgencia === '24 Horas') return build24hIntroMessage();
      // Fluxo direto — pede viatura
      return {
        text: QUESTIONS.COLLECTING_VIATURA.text,
        nextStep: 'COLLECTING_VIATURA',
        quickReplies: QUESTIONS.COLLECTING_VIATURA.quickReplies,
      };
    }

    case 'COLLECTING_WEIGHT': {
      const kg = parseWeight(mensagem);
      if (!kg) {
        return {
          text: 'Por favor indique o peso em kg. Exemplo: *5* ou *12.5*',
          nextStep: 'COLLECTING_WEIGHT',
        };
      }
      // O cálculo real é feito no route handler (precisa de DB)
      return { text: 'A calcular preço...', nextStep: 'CALCULATING_PARTNER_PRICE' as any };
    }

    case 'PRESENTING_PARTNER_PRICE': {
      const lower = mensagem.toLowerCase();
      if (lower.includes('cancelar')) {
        return {
          text: 'Sem problema! Se precisar no futuro, estamos disponíveis.',
          nextStep: 'CLOSED',
        };
      }
      // Qualquer resposta não-cancelar = confirmar a janela escolhida
      // O route handler identifica a tarifa seleccionada
      return {
        text: QUESTIONS.COLLECTING_NOME.text,
        nextStep: 'COLLECTING_NOME',
      };
    }

    case 'CALCULATING_PRICE':
      // Este step é transitório — o route chama a API de preço e depois vai para PRESENTING_PRICE
      return buildPriceMessage(conv);

    case 'PRESENTING_PRICE': {
      const lower = mensagem.toLowerCase();
      if (lower.includes('sim') || lower.includes('avançar')) {
        return {
          text: QUESTIONS.COLLECTING_NOME.text,
          nextStep: 'COLLECTING_NOME',
        };
      }
      if (lower.includes('não') || lower.includes('cancelar')) {
        return {
          text: 'Sem problema! Se precisar de ajuda no futuro, estamos disponíveis.',
          nextStep: 'CLOSED',
        };
      }
      if (lower.includes('amanhã') || lower.includes('amanha') || lower.includes('24h') || lower.includes('ver entrega')) {
        return {
          text: 'Para calcular o preço de entrega para amanhã, indique o *peso total* do envio (em kg):',
          nextStep: 'COLLECTING_WEIGHT',
        };
      }
      // Dúvida ou objecção
      return buildObjectionResponse(conv);
    }

    case 'HANDLING_OBJECTION': {
      const lower = mensagem.toLowerCase();
      // "sim" aqui é resposta a "Quer que calcule [entrega amanhã]?" — vai para arrasto
      if (lower.includes('amanhã') || lower.includes('amanha') || lower.includes('24h') || lower.includes('ver entrega') || /\bsim\b/.test(lower)) {
        return {
          text: 'Para calcular o preço de entrega para amanhã, indique o *peso total* do envio (em kg):',
          nextStep: 'COLLECTING_WEIGHT',
        };
      }
      if (lower.includes('manter') || lower.includes('avançar') || lower.includes('urgente')) {
        return { text: QUESTIONS.COLLECTING_NOME.text, nextStep: 'COLLECTING_NOME' };
      }
      if (lower.includes('cancelar') || lower.includes('não')) {
        return {
          text: 'Sem problema! Se precisar no futuro, estamos disponíveis.',
          nextStep: 'CLOSED',
        };
      }
      return {
        text: 'Obrigado pelo contacto! Estamos sempre disponíveis.',
        nextStep: 'CLOSED',
      };
    }

    case 'COLLECTING_NOME':
      return {
        text: QUESTIONS.COLLECTING_EMAIL.text,
        nextStep: 'COLLECTING_EMAIL',
      };

    case 'COLLECTING_EMAIL':
      // Email opcional — qualquer resposta avança (route handler decide se vai para moradas ou lead)
      return {
        text: 'A registar o seu pedido...',
        nextStep: 'LEAD_REGISTERED',
      };

    // Fase 1 — moradas e contactos (processamento async feito no route handler)
    case 'COLLECTING_ORIGEM_COMPLETA':
      return { text: 'A analisar morada...', nextStep: 'CONFIRMING_ORIGEM_COMPLETA' };

    case 'CONFIRMING_ORIGEM_COMPLETA': {
      const lower = mensagem.toLowerCase();
      if (lower.includes('sim') || lower.includes('correc') || lower.includes('ok')) {
        return { text: QUESTIONS.COLLECTING_DESTINO_COMPLETA.text, nextStep: 'COLLECTING_DESTINO_COMPLETA' };
      }
      return { text: QUESTIONS.COLLECTING_ORIGEM_COMPLETA.text, nextStep: 'COLLECTING_ORIGEM_COMPLETA' };
    }

    case 'COLLECTING_DESTINO_COMPLETA':
      return { text: 'A analisar morada...', nextStep: 'CONFIRMING_DESTINO_COMPLETA' };

    case 'CONFIRMING_DESTINO_COMPLETA': {
      const lower = mensagem.toLowerCase();
      if (lower.includes('sim') || lower.includes('correc') || lower.includes('ok')) {
        return {
          text: QUESTIONS.COLLECTING_DETALHES_RECOLHA.text,
          nextStep: 'COLLECTING_DETALHES_RECOLHA',
          quickReplies: QUESTIONS.COLLECTING_DETALHES_RECOLHA.quickReplies,
        };
      }
      return { text: QUESTIONS.COLLECTING_DESTINO_COMPLETA.text, nextStep: 'COLLECTING_DESTINO_COMPLETA' };
    }

    case 'COLLECTING_DETALHES_RECOLHA':
      return {
        text: QUESTIONS.COLLECTING_DETALHES_ENTREGA.text,
        nextStep: 'COLLECTING_DETALHES_ENTREGA',
        quickReplies: QUESTIONS.COLLECTING_DETALHES_ENTREGA.quickReplies,
      };

    case 'COLLECTING_DETALHES_ENTREGA':
      return { text: 'A registar o seu pedido...', nextStep: 'LEAD_REGISTERED' };

    case 'AWAITING_PAYMENT':
      return {
        text: 'O seu pagamento ainda não foi confirmado. Por favor verifique a notificação *MB Way* no seu telemóvel.',
        nextStep: 'AWAITING_PAYMENT',
      };

    default:
      return {
        text: 'Obrigado pelo contacto! Para novo pedido, envie *PSERV*.',
        nextStep: 'CLOSED',
      };
  }
}

// Normalização de viatura
export function normalizeViatura(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes('moto'))          return 'Moto';
  if (t.includes('classe 1') || t.includes('furgão 1') || t.includes('furgao 1')) return 'Furgão Classe 1';
  if (t.includes('classe 2') || t.includes('furgão 2') || t.includes('furgao 2')) return 'Furgão Classe 2';
  if (t.includes('furgão') || t.includes('furgao')) return 'Furgão Classe 1';
  return null;
}

// Normalização de urgência — ordem importa: verificar '24' antes de '4' e '1'
export function normalizeUrgencia(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes('24') || t.includes('amanhã') || t.includes('amanha')) return '24 Horas';
  if (t.includes('4 hora') || t.includes('quatro hora') || /\b4\b/.test(t)) return '4 Horas';
  if (t.includes('1 hora') || t.includes('uma hora') || /\b1\b/.test(t)) return '1 Hora';
  return null;
}

// ── Mensagem pré-preenchida da landing page ──────────────────────────────────

export interface WAPrefilledData {
  origem?: string;
  destino?: string;
  viatura?: string;
  urgencia?: string;
  nome?: string;
  email?: string;
}

export function parseWAPrefilledMessage(text: string): WAPrefilledData | null {
  const lower = text.toLowerCase();
  if (!lower.includes('orçamento') && !lower.includes('orcamento') && !lower.includes('confirmar os detalhes')) {
    return null;
  }
  const result: WAPrefilledData = {};

  const deMatch   = text.match(/De:\s*(.+)/i);
  const paraMatch = text.match(/Para:\s*(.+)/i);
  if (deMatch)   result.origem  = deMatch[1].trim();
  if (paraMatch) result.destino = paraMatch[1].trim();

  const viaturaMatch = text.match(/Viatura:\s*(.+)/i);
  if (viaturaMatch) {
    const v = normalizeViatura(viaturaMatch[1].trim());
    if (v) result.viatura = v;
  }
  const urgenciaMatch = text.match(/Urg[eê]ncia:\s*(.+)/i);
  if (urgenciaMatch) {
    const u = normalizeUrgencia(urgenciaMatch[1].trim());
    if (u) result.urgencia = u;
  }
  // Form-a has a bug: "€" before nome → strip it
  const nomeMatch  = text.match(/Nome:\s*€?(.+)/i);
  if (nomeMatch) result.nome = nomeMatch[1].trim();
  const emailMatch = text.match(/Email:\s*(\S+@\S+)/i);
  if (emailMatch) result.email = emailMatch[1].trim();

  return Object.keys(result).length > 0 ? result : null;
}

export function buildWAPrefilledResponse(data: WAPrefilledData): BotResponse {
  const greeting = data.nome
    ? `Olá, *${data.nome}*! Recebi o seu pedido de orçamento.`
    : 'Olá! Recebi o seu pedido de orçamento.';
  const route = data.origem && data.destino
    ? `\n\n*${data.origem}* → *${data.destino}*`
    : '';

  if (!data.origem || !data.destino) return buildWelcomeMessage();

  if (data.urgencia === '24 Horas') {
    return {
      text: greeting + route + '\n\nPara a entrega amanhã, qual o *peso total* do envio (em kg)?',
      nextStep: 'COLLECTING_WEIGHT',
    };
  }
  if (data.viatura && data.urgencia) {
    return { text: greeting + route + '\n\nA calcular preço...', nextStep: 'CALCULATING_PRICE' };
  }
  if (data.urgencia) {
    return {
      text: greeting + route + '\n\n' + QUESTIONS.COLLECTING_VIATURA.text,
      nextStep: 'COLLECTING_VIATURA',
      quickReplies: QUESTIONS.COLLECTING_VIATURA.quickReplies,
    };
  }
  // Só temos origem + destino — perguntar urgência
  return {
    text: greeting + route + '\n\n' + QUESTIONS.COLLECTING_URGENCIA.text,
    nextStep: 'COLLECTING_URGENCIA',
    quickReplies: QUESTIONS.COLLECTING_URGENCIA.quickReplies,
  };
}

function getResponseTimeLabel(): string {
  const h = new Date().getHours();
  const d = new Date().getDay();
  const isWeekend = d === 0 || d === 6;
  if (!isWeekend && h >= 8 && h < 20) return '5 minutos';
  if (!isWeekend && h >= 20 && h < 23) return '5 a 20 minutos';
  if (isWeekend && h >= 8 && h < 20) return '10 a 30 minutos';
  return 'próximo dia útil';
}
