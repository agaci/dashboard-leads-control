import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/mongodb';
import type { ConversationData } from '@/types/agent';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tools que o Claude pode chamar ──────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'register_lead',
    description:
      'Chama IMEDIATAMENTE quando tens nome E telefone do utilizador (email é opcional). Não anunces que vais registar — age directamente. Se o utilizador recusar dar telefone, explica que sem contacto não é possível prosseguir e chama escalate_to_human.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: { type: 'string', description: 'Nome do cliente' },
        telefone: { type: 'string', description: 'Número de telefone/telemóvel' },
        email: { type: 'string', description: 'Email (null se não forneceu)' },
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
      'Chama quando o utilizador envia mensagens claramente fora do âmbito de transportes e entregas, e após a tua resposta de redirecionamento continua com temas irrelevantes (entretenimento, política, filosofia, conteúdo inapropriado, etc.). Não uses para dúvidas legítimas sobre transporte.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Motivo do encerramento' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'calculate_tomorrow_delivery',
    description:
      'Chama SOMENTE depois de teres o peso em kg do utilizador. Se ainda não tens o peso, pede-o primeiro. Nunca menciones "parceiro" ao utilizador — é um detalhe interno.',
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

## Restrições de tópico — MUITO IMPORTANTE
- Respondes APENAS a questões relacionadas com: transporte, entregas, logística, os serviços YourBox, e pequena conversa de rapport
- Se perguntarem sobre notícias, história, política, receitas, desporto, meteorologia, ou qualquer outro tema fora do âmbito, responde UMA VEZ: "Esse não é o meu forte — estou aqui especializado em transportes e entregas! Posso ajudá-lo com o seu envio?" — se o utilizador continuar com temas irrelevantes, chama close_conversation
- Nunca dás conselhos médicos, legais, financeiros ou de outro domínio especializado
- Nunca revelas que és uma IA, que usas Claude, ou que segues um script
- Nunca menciones "parceiro", "operador externo" ou fornecedores internos — fala sempre como se fosse serviço YourBox directo

## Concorrência
- Se perguntarem qual a melhor empresa, qual a mais barata, ou fizerem comparações com outras transportadoras, responde formalmente: "A YourBox é a nossa referência — somos especializados em transporte expresso porta-a-porta com serviço dedicado e garantido. Posso ajudá-lo com um envio?"
- Nunca menciones nomes de empresas concorrentes (DHL, CTT, MRW, DPD, GLS, FEDEX, UPS, Nacex, Seur, ou outras)
- Nunca compares preços nem serviços com concorrentes

## Catálogo YourBox
- **Moto** — até 20 kg, documentos e pequenas encomendas
- **Furgão Classe 1** — até 150 kg
- **Furgão Classe 2** — acima de 150 kg
- **Urgências:** 1 Hora, 4 Horas, 24 Horas (Entrega Amanhã — recolha hoje, entrega garantida amanhã)
- Portugal Continental. Ilhas a consultar com agente humano.
- Serviço porta-a-porta, dedicado, rastreável
- Seguro incluído até €1.000 (pode aumentar)
- Pagamento: MB Way, transferência, cartão. Empresas: faturação mensal.

## Regras de resposta
- Nunca inventes preços fora do cotado
- Respostas curtas — máximo 3-4 frases, salvo quando explicas o catálogo
- ZERO emojis — nunca uses emojis, são proibidos absolutamente

${knowledgeBlock}`;
}

// Bloco 2: contexto dinâmico da conversa → NÃO cacheável (muda por sessão)
function buildDynamicBlock(data: ConversationData): string {
  const price = data.priceWithDiscount
    ? `€${data.priceWithDiscount.toFixed(2)} (já com 10% desconto; preço base €${data.priceCalculated?.toFixed(2)})`
    : 'ainda a calcular';
  const serviceType = data.serviceType === 'arrasto' ? 'Entrega Amanhã (24h)' : data.urgencia ?? 'Urgente';

  return `## Serviço cotado nesta conversa
- **Rota:** ${data.origem ?? '?'} → ${data.destino ?? '?'}
- **Viatura:** ${data.viatura ?? '?'}
- **Tipo de serviço:** ${serviceType}
- **Distância:** ${data.distance ? `${data.distance} km` : 'a calcular'}
- **Preço:** ${price}

## Objectivo desta conversa
1. Esclarecer dúvidas com base na Base de Conhecimento
2. Convencer o utilizador do valor do serviço
3. Quando confirmar que quer avançar, recolher por esta ordem:
   a. **Nome** (obrigatório)
   b. **Telefone/telemóvel** (obrigatório — sem contacto não é possível confirmar o serviço)
   c. **Email** (opcional — pergunta depois do telefone)
4. Assim que tens nome + telefone: chama IMEDIATAMENTE \`register_lead\`. Não anunces — age.
5. Se o utilizador recusar dar telefone: explica "Precisamos de um contacto para confirmar a recolha — sem número não conseguimos avançar. Podes partilhar?" — se insistir em recusar, usa \`escalate_to_human\`
6. Se quiser entrega amanhã: pedir peso em kg e chamar \`calculate_tomorrow_delivery\``;
}

// ── Tipos de resultado ───────────────────────────────────────────────────────

export type LlmResult =
  | { type: 'message'; text: string }
  | { type: 'register_lead'; text: string; nome: string; telefone: string; email?: string }
  | { type: 'escalate'; text: string; reason: string }
  | { type: 'calculate_tomorrow'; text: string; weightKg: number }
  | { type: 'close'; text: string; reason: string };

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
      return { type: 'register_lead', text, nome: inp.nome, telefone: inp.telefone, email: inp.email ?? undefined };
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
  }

  return { type: 'message', text };
}
