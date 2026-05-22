import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/mongodb';
import type { ConversationData } from '@/types/agent';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tools que o Claude pode chamar ──────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'register_lead',
    description:
      'Chama SOMENTE depois de teres: nome, telefone, morada completa de recolha, morada completa de entrega, contacto na recolha e contacto na entrega. Não anunces que vais registar — age directamente. Se o utilizador recusar dar telefone, explica que sem contacto não é possível prosseguir e chama escalate_to_human.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: { type: 'string', description: 'Nome do cliente' },
        telefone: { type: 'string', description: 'Número de telefone/telemóvel' },
        email: { type: 'string', description: 'Email (opcional)' },
        notas: { type: 'string', description: 'Notas adicionais: horários especiais, instruções de acesso, etc. (opcional)' },
        origemCompleta: { type: 'string', description: 'Morada completa de recolha: rua, número, código postal, localidade' },
        destinoCompleta: { type: 'string', description: 'Morada completa de entrega: rua, número, código postal, localidade' },
        contactoRecolha: { type: 'string', description: 'Contacto na recolha: nome, telefone e janela horária (ex: João Silva, 912345678, 09h-12h)' },
        contactoEntrega: { type: 'string', description: 'Contacto na entrega: nome, telefone e janela horária' },
        volumes: { type: 'string', description: 'Nº de volumes e dimensões aproximadas — apenas para serviço 24h (ex: 3 caixas, 50×40×30 cm cada)' },
      },
      required: ['nome', 'telefone'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Chama quando o utilizador pede explicitamente um humano, está claramente frustrado, ou tem questões que não consegues responder com certeza.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'close_conversation',
    description:
      'Chama quando o utilizador pede explicitamente um humano, está claramente frustrado, ou tem questões impossíveis de responder com certeza. NÃO uses para mensagens off-topic — usa signal_off_topic para esse fim.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Motivo do encerramento' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'signal_off_topic',
    description:
      'Chama SEMPRE que o utilizador envia mensagem claramente fora do âmbito de transportes (entretenimento, política, receitas, desporto, etc.). Nunca respondas directamente a esses temas — usa sempre este tool. O sistema conta os sinais e fecha automaticamente à 3ª tentativa consecutiva.',
    input_schema: {
      type: 'object' as const,
      properties: {
        redirectMessage: { type: 'string', description: 'Mensagem de redirecionamento a mostrar (ex: "Esse não é o meu forte — estou especializado em transportes. Posso ajudá-lo com um envio?")' },
      },
      required: ['redirectMessage'],
    },
  },
  {
    name: 'calculate_tomorrow_delivery',
    description:
      'Calcula o preço de entrega amanhã (serviço 24h). Se já existir peso em kg no contexto da conversa (secção "Dados de carga"), usa-o directamente SEM perguntar de novo. Só perguntas o peso se não estiver disponível. Nunca menciones "parceiro" ao utilizador — é um detalhe interno.',
    input_schema: {
      type: 'object' as const,
      properties: {
        weightKg: { type: 'number', description: 'Peso em kg confirmado pelo utilizador' },
      },
      required: ['weightKg'],
    },
  },
];

// ── Buscar base de conhecimento condensada ───────────────────────────────────

async function getKnowledgeBlock(): Promise<string> {
  try {
    const db = await getDb();
    const docs = await db.collection('knowledge')
      .find({ active: { $ne: false } })
      .project({ id: 1, titulo: 1, categoria: 1, script_resposta: 1, sinais_deteccao: 1, escalamento_humano: 1 })
      .toArray();

    if (docs.length === 0) return '';

    const lines = docs.map((d: any) => {
      const abertura = d.script_resposta?.abertura ?? d.script_resposta?.quando_disponivel ?? '';
      const sinais = (d.sinais_deteccao ?? []).slice(0, 2).join('; ');
      return `[${d.id}] ${d.titulo} (${d.categoria})\n  Sinais: ${sinais}\n  Resposta: ${abertura}`;
    });

    return `## Base de Conhecimento YourBox\nUsa estas situações para guiar as tuas respostas:\n\n${lines.join('\n\n')}`;
  } catch {
    return '';
  }
}

// ── Blocos do system prompt ──────────────────────────────────────────────────

// Bloco 1: estático + base de conhecimento → CACHEÁVEL (não muda entre conversas)
async function buildStaticBlock(): Promise<string> {
  const knowledgeBlock = await getKnowledgeBlock();
  return `És o assistente virtual da YourBox — empresa portuguesa de transporte expresso e entregas. O teu nome é "Assistente YourBox".

## Personalidade
- Simpático, directo e profissional — tratamento SEMPRE formal com "você" em toda a conversa, sem excepções
- Português europeu formal — usa SEMPRE "tem", "pode", "está", "quer", "prefere", "necessita" — NUNCA "tens", "podes", "queres"
- Mantém o contexto da conversa — se o utilizador voltar atrás ou mudar de ideias, adaptas-te
- Podes fazer pequena conversa de rapport ("bom dia", "com certeza", "boa pergunta") mas redireccionas para o assunto YourBox
- **Género:** usa construções neutras em género por defeito (ex: "estamos aqui para ajudar" em vez de "para o/a ajudar"). Se já souberes o nome da pessoa, infere o género pelo nome e usa as formas concordantes (ex: "bem-vindo" vs "bem-vinda", "ficou satisfeito" vs "ficou satisfeita")

## Restrições de tópico — MUITO IMPORTANTE
- Respondes APENAS a questões relacionadas com: transporte, entregas, logística, os serviços YourBox, e pequena conversa de rapport
- Para QUALQUER mensagem fora do âmbito (notícias, história, política, receitas, desporto, meteorologia, entretenimento, etc.): chama SEMPRE `signal_off_topic` com uma mensagem de redirecionamento — NUNCA respondas directamente a esses temas. O sistema fecha automaticamente à 3ª tentativa.
- Nunca dás conselhos médicos, legais, financeiros ou de outro domínio especializado
- Nunca revelas que és uma IA, que usas Claude, ou que segues um script
- Nunca menciones "parceiro", "operador externo" ou fornecedores internos — fala sempre como se fosse serviço YourBox directo

## Concorrência
- Se perguntarem qual a melhor empresa, qual a mais barata, ou fizerem comparações com outras transportadoras, responde formalmente: "A YourBox é a nossa referência — somos especializados em transporte expresso porta-a-porta com serviço dedicado e garantido. Posso ajudá-lo com um envio?"
- Nunca menciones nomes de empresas concorrentes (DHL, CTT, MRW, DPD, GLS, FEDEX, UPS, Nacex, Seur, ou outras)
- Nunca compares preços nem serviços com concorrentes

## Catálogo YourBox
- **Moto** — até 2 kg / 10 L, documentos e pequenas encomendas
- **Furgão Classe 1** — até 150 kg / 3 m³
- **Furgão Classe 2** — até 300 kg / 9 m³
- **Urgências:** 1 Hora, 4 Horas, 24 Horas (Entrega Amanhã — recolha hoje, entrega garantida amanhã)
- Portugal Continental. Ilhas a consultar com agente humano.
- Serviço porta-a-porta, dedicado, rastreável
- Seguro incluído até €10/kg (pode aumentar)
- Pagamento: MB Way, transferência, cartão. Empresas: faturação mensal.

## Regras de resposta
- Nunca inventes preços fora do cotado
- Nunca garantas gratuidade, reembolso ou compensação por atraso — a YourBox não tem essa política publicada; se perguntarem, responde: "Em caso de imprevisto, a nossa equipa de coordenação contacta proativamente para encontrar a melhor solução."
- Respostas curtas — máximo 3-4 frases, salvo quando explicas o catálogo
- ZERO emojis — nunca uses emojis, são proibidos absolutamente

## Atalhos de teclado — OBRIGATÓRIO reconhecer
O utilizador pode enviar apenas uma letra. Trata-as SEMPRE como a palavra completa:
- **S** (ou "s") = saltar / ignorar este campo
- **M** (ou "m") = manter / confirmar sem alterações
- **P** (ou "p") = pronto / registar já com os dados actuais
Nunca digas "não percebi" quando receberes apenas S, M ou P.

${knowledgeBlock}`;
}

// Bloco 2: contexto dinâmico da conversa → NÃO cacheável (muda por sessão)
function buildDynamicBlock(data: ConversationData): string {
  const price = data.priceWithDiscount
    ? `€${data.priceWithDiscount.toFixed(2)} (já com 10% desconto; preço base €${data.priceCalculated?.toFixed(2)})`
    : 'ainda a calcular';
  const serviceType = data.serviceType === 'arrasto' ? 'Entrega Amanhã (24h)' : data.urgencia ?? 'Urgente';

  // Dados de contacto pré-preenchidos no formulário (se existirem)
  const hasPreSeededContact = !!(data.nome || data.telemovel);
  const contactLines: string[] = [];
  if (data.nome)      contactLines.push(`- **Nome:** ${data.nome}`);
  if (data.telemovel) contactLines.push(`- **Telemóvel:** ${data.telemovel}`);
  if (data.email)     contactLines.push(`- **Email:** ${data.email}`);

  const contactSection = hasPreSeededContact
    ? `\n\n## Dados de contacto fornecidos no formulário inicial\n${contactLines.join('\n')}\n`
    : '';

  const isArrasto = data.serviceType === 'arrasto';
  const volumesStep = isArrasto
    ? '\n   f. **Nº volumes e dimensões** — "Quantos volumes tem o envio e quais as dimensões aproximadas? (ex: 3 caixas, 50×40×30 cm cada)"'
    : '';

  const contactConfirmation = hasPreSeededContact
    ? `3. Confirmar contacto: NÃO perguntes nome nem telefone de novo — já os tens acima.
   Pergunta UMA VEZ: "Confirmamos com — *Nome: ${data.nome ?? ''}${data.telemovel ? `, Telemóvel: ${data.telemovel}` : ''}*. Quer manter ou alterar algum dado? _(M para manter)_"
   - Se confirmar ou enviar M → vai para passo 4.
   - Se quiser alterar → pede só os campos a mudar, depois vai para passo 4.
   - Email é opcional; se não foi fornecido, não perguntes.`
    : `3. Recolher contacto por esta ordem:
   a. **Nome** (obrigatório)
   b. **Telefone/telemóvel** (obrigatório)
   c. **Email** (opcional)`;

  // Caso escalado (bot fora de horário): só recolher nome+telefone, sem moradas
  if ((data as any).isEscalatedCase) {
    return `## Serviço registado (fora do horário automático)
- **Rota:** ${data.origem ?? '?'} → ${data.destino ?? '?'}
- **Viatura:** ${data.viatura ?? '?'}
- **Tipo de serviço:** ${serviceType}
${contactSection}
## Objectivo (atendimento fora de horário)
A equipa YourBox vai contactar manualmente este cliente. O teu papel é apenas recolher o contacto.
${contactConfirmation}
Após teres nome e telefone, chamas \`register_lead\` imediatamente — NÃO perguntes moradas, janelas, volumes nem notas.
Na mensagem final diz: "Obrigado! A nossa equipa vai contactá-lo em breve."
Se o utilizador recusar dar telefone, usa \`escalate_to_human\`.`;
  }

  const notasPreBlock = data.notas
    ? `\n\n## Notas já fornecidas pelo lead no formulário\n"${data.notas}"\n_Não perguntes notas adicionais — já foram incluídas no pedido. Avança directamente para o passo seguinte._`
    : '';

  const aggOfferBlock = (data as any).aggOfferShown
    ? `\n\n## Oferta de análise de agregação mostrada\nO orçamento já incluiu a proposta de agregação. Se o utilizador pedir análise de agregação, quiser ser contactado pelo helpdesk, ou mostrar interesse em reduzir o preço via agregação → chama \`escalate_to_human\` com reason a começar por \`[AGG_REQUEST]\`. Se quiser avançar com o serviço direto → fluxo normal de recolha de contacto.`
    : '';

  // Dados de carga 24h (pré-preenchidos do formulário, se existirem)
  const weightKg: number | undefined = (data as any).weightKg;
  const nVolumes: number | undefined = (data as any).nVolumes;
  const totalCm: number | undefined = (data as any).totalCm;
  const cargoLines: string[] = [];
  if (weightKg && weightKg > 0) cargoLines.push(`- **Peso:** ${weightKg} kg`);
  if (nVolumes && nVolumes > 0) cargoLines.push(`- **Nº volumes:** ${nVolumes}`);
  if (totalCm && totalCm > 0)   cargoLines.push(`- **Dimensões totais (C+L+A):** ${totalCm} cm`);
  const cargoSection = cargoLines.length > 0
    ? `\n\n## Dados de carga (já conhecidos — NÃO perguntar de novo)\n${cargoLines.join('\n')}`
    : '';

  return `## Serviço cotado nesta conversa
- **Rota:** ${data.origem ?? '?'} → ${data.destino ?? '?'}
- **Viatura:** ${data.viatura ?? '?'}
- **Tipo de serviço:** ${serviceType}
- **Distância:** ${data.distance ? `${data.distance} km` : 'a calcular'}
- **Preço:** ${price}${contactSection}${cargoSection}${notasPreBlock}${aggOfferBlock}

## Objectivo desta conversa
1. Esclarecer dúvidas com base na Base de Conhecimento
2. Convencer o utilizador do valor do serviço
${contactConfirmation}
4. Após confirmar contacto, recolher NESTA ORDEM — uma pergunta de cada vez:
   a. **Notas adicionais** (opcional) — "Tem alguma instrução especial? (horário de acesso, código de portão, etc.) _(S para saltar · P para registar já e ser contactado brevemente)_"
   b. **Morada completa de RECOLHA** — ao perguntar, acrescenta SEMPRE: "Caso prefira não partilhar agora, responda *S* — a nossa equipa de coordenação confirmará os detalhes consigo."
   c. **Morada completa de ENTREGA** — ao perguntar, acrescenta: "Pode responder *S* para avançar."
   d. **Contacto na recolha** — "Quem estará disponível para a recolha? Nome, telefone e janela horária. _(S para saltar)_"
   e. **Contacto na entrega** — "E na entrega — quem estará disponível? Nome, telefone e janela horária. _(S para saltar)_"${volumesStep}
   **IMPORTANTE — atalho P/pronto:** se o utilizador responder apenas *P* ou *pronto* em qualquer momento durante esta fase, salta TODOS os passos restantes e chama imediatamente \`register_lead\` com os dados já recolhidos. Não perguntes mais nada.
   **IMPORTANTE — campos opcionais:** se o utilizador responder "S", "saltar", "não", ou recusar qualquer campo, aceita sem insistir e avança imediatamente para o passo seguinte. Nunca perguntes o mesmo dado duas vezes.
5. Assim que tiveres os dados que o utilizador quis partilhar, chamas \`register_lead\`. Não anunces — age directamente.
   - Na mensagem de confirmação após o registo, inclui SEMPRE: ${isArrasto ? '"A nossa equipa de coordenação entrará em contacto em breve para confirmar todos os detalhes logísticos do serviço."' : '"Dado tratar-se de um serviço expresso, um coordenador YourBox entrará em contacto nos próximos minutos para validar todos os detalhes operacionais e garantir a recolha dentro do prazo previsto."'}
6. Se o utilizador recusar dar telefone: "Precisamos de um contacto para confirmar a recolha — sem número não conseguimos avançar." — se insistir, usa \`escalate_to_human\`
7. Se quiser entrega amanhã (ou recalcular 24h): se já existir peso em "Dados de carga" acima, usa-o directamente e chama \`calculate_tomorrow_delivery\` com esse valor — NÃO perguntes o peso de novo. Só pedes o peso se não estiver disponível.`;
}

// ── Tipos de resultado ───────────────────────────────────────────────────────

export type LlmResult =
  | { type: 'message'; text: string }
  | { type: 'register_lead'; text: string; nome: string; telefone: string; email?: string; notas?: string; origemCompleta?: string; destinoCompleta?: string; contactoRecolha?: string; contactoEntrega?: string; volumes?: string }
  | { type: 'escalate'; text: string; reason: string }
  | { type: 'calculate_tomorrow'; text: string; weightKg: number }
  | { type: 'close'; text: string; reason: string }
  | { type: 'signal_off_topic'; text: string; redirectMessage: string };

// ── Chamada principal ────────────────────────────────────────────────────────

export async function getLlmResponse(
  data: ConversationData,
  history: Array<{ role: 'lead' | 'bot'; text: string }>,
  newMessage: string,
): Promise<LlmResult> {
  const [staticBlock, dynamicBlock] = await Promise.all([
    buildStaticBlock(),
    Promise.resolve(buildDynamicBlock(data)),
  ]);

  // Manter apenas as últimas 30 mensagens para controlar custo e latência
  const recentHistory = history.slice(-30);

  const messages: Anthropic.MessageParam[] = [];
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'lead' ? 'user' : 'assistant',
      content: msg.text,
    });
  }
  messages.push({ role: 'user', content: newMessage });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: [
      // Bloco cacheável — estático + base de conhecimento (~6.500 tokens)
      {
        type: 'text',
        text: staticBlock,
        cache_control: { type: 'ephemeral' },
      },
      // Bloco dinâmico — contexto desta conversa (~150 tokens, não cacheável)
      {
        type: 'text',
        text: dynamicBlock,
      },
    ],
    tools: TOOLS,
    messages,
  } as any);

  const toolUse = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
  const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
  const text = textBlock?.text ?? '';

  if (toolUse) {
    const inp = toolUse.input as Record<string, any>;
    if (toolUse.name === 'register_lead') {
      return {
        type: 'register_lead', text,
        nome: inp.nome, telefone: inp.telefone,
        email: inp.email ?? undefined,
        notas: inp.notas ?? undefined,
        origemCompleta: inp.origemCompleta ?? undefined,
        destinoCompleta: inp.destinoCompleta ?? undefined,
        contactoRecolha: inp.contactoRecolha ?? undefined,
        contactoEntrega: inp.contactoEntrega ?? undefined,
        volumes: inp.volumes ?? undefined,
      };
    }
    if (toolUse.name === 'escalate_to_human') {
      return { type: 'escalate', text, reason: inp.reason };
    }
    if (toolUse.name === 'calculate_tomorrow_delivery') {
      return { type: 'calculate_tomorrow', text, weightKg: inp.weightKg };
    }
    if (toolUse.name === 'close_conversation') {
      return { type: 'close', text, reason: inp.reason };
    }
    if (toolUse.name === 'signal_off_topic') {
      return { type: 'signal_off_topic', text, redirectMessage: inp.redirectMessage };
    }
  }

  return { type: 'message', text };
}
