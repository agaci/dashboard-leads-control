import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import { decideMode, getResponseTimeText, defaultRoutingConfig } from '@/lib/routing/decideMode';
import type { PriceRequest, RoutingDecision } from '@/types/pricing';

const viaturaParaPeso: Record<string, string> = {
  Moto: '2',
  'Furgão Classe 1': '150',
  'Furgão Classe 2': '300',
};

function pesoParaType(peso: string): string {
  const p = parseInt(peso, 10);
  if (p <= 2)   return '2';
  if (p <= 50)  return '50';
  if (p <= 150) return '150';
  return '300';
}

function formatarData(d: Date): string {
  return d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
}

async function countSimulationsToday(db: Awaited<ReturnType<typeof getDb>>): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return db.collection('messages').countDocuments({
    company: 'Yourbox',
    messageType: { $in: ['preLeadSimulation', 'clientSimulation'] },
    timeStamp: { $gte: start },
  });
}

// Fase 1 — simulação sem contacto
async function insertPreLeadSimulation(
  db: Awaited<ReturnType<typeof getDb>>,
  params: PriceRequest,
  priceCalculated: number,
  priceWithDiscount: number,
  discount: number,
  totalDistance: number,
  LX_PT: number,
  GLX_GPT: number,
): Promise<string> {
  const timeStamp = formatarData(new Date());
  const variante = params.variante ?? 'A';
  const doc = {
    company: 'Yourbox',
    messageType: 'preLeadSimulation',
    to: 'admin',
    toPrivate: null,
    presentationMessage: 'stick',
    deletedAfter: 10000,
    message: `<div style="line-height:1;">
      <p><b>🧮 SIMULAÇÃO DE PREÇO</b> <small>(${timeStamp})</small></p>
      <p><b>Locais:</b></p>
      <p>${params.local_recolha}</p>
      <p>${params.local_entrega}</p>
      <p><b>Viatura:</b> ${params.viatura ?? ''}</p>
      <p><b>Urgência:</b> ${params.urgencia}</p>
      <p><b>Distância:</b> ${totalDistance} kms</p>
      <p><b>Preço:</b> €${priceCalculated.toFixed(2)}</p>
      <p><b>Com 10% OFF:</b> €${priceWithDiscount.toFixed(2)}</p>
      <p style="color:orange;"><b>⚠️ Sem contacto</b></p>
    </div>`,
    companyProvider: 'Yourbox',
    senderName: 'Simulação Web ' + variante,
    variante,
    timeStamp: new Date(),
    closed: false,
    closedAt: new Date(),
    reply: [],
    leadData: {
      origem: params.local_recolha,
      destino: params.local_entrega,
      viatura: params.viatura ?? '',
      urgencia: params.urgencia,
      priceCalculated,
      priceWithDiscount,
      discount,
      distance: totalDistance,
      urbano: LX_PT || false,
      extraUrbano: GLX_GPT || false,
      timeStamp: new Date(),
      converted: false,
      convertedAt: null,
      source: 'website',
    },
  };
  const result = await db.collection('messages').insertOne(doc);
  return result.insertedId.toString();
}

// Fase 2 — lead com contacto
async function insertNewLead(
  db: Awaited<ReturnType<typeof getDb>>,
  params: PriceRequest,
  priceCalculated: number,
  priceWithDiscount: number,
  discount: number,
  totalDistance: number,
  LX_PT: number,
  GLX_GPT: number,
  routing: RoutingDecision,
): Promise<string> {
  const timeStamp = formatarData(new Date());
  const variante = params.variante ?? 'A';
  const doc = {
    company: 'Yourbox',
    messageType: 'newLead',
    to: 'admin',
    toPrivate: null,
    presentationMessage: 'stick',
    deletedAfter: 0,
    message: `<div style="line-height:1;">
      <p><b>PEDIDO DE PRECO</b> <small>(${timeStamp})</small></p>
      <p><b>Contacto:</b></p>
      <p>${params.nome ?? ''}</p>
      <p>${params.email ?? ''}</p>
      <p>${params.telemovel ?? ''}</p>
      <p><b>Locais:</b></p>
      <p>${params.local_recolha}</p>
      <p>${params.local_entrega}</p>
      <p><b>Viatura:</b> ${params.viatura ?? ''}</p>
      <p><b>Urgência:</b> ${params.urgencia}</p>
      <p><b>Distância:</b> ${totalDistance} kms</p>
      <p><b>Preço Base:</b> €${priceCalculated.toFixed(2)}</p>
      <p><b>Preço Final (10% OFF):</b> €${priceWithDiscount.toFixed(2)}</p>
      <p style="color:green;"><b>CONTACTAR AGORA [routing: ${routing}]</b></p>
    </div>`,
    companyProvider: 'Yourbox',
    senderName: 'Lead Web ' + variante,
    variante,
    timeStamp: new Date(),
    closed: false,
    closedAt: null,
    reply: [],
    leadData: {
      origem: params.local_recolha,
      destino: params.local_entrega,
      viatura: params.viatura ?? '',
      urgencia: params.urgencia,
      priceCalculated,
      priceWithDiscount,
      discount,
      distance: totalDistance,
      urbano: LX_PT || false,
      extraUrbano: GLX_GPT || false,
      nome: params.nome,
      email: params.email,
      telefone: params.telemovel,
      timeStamp: new Date(),
      converted: true,
      convertedAt: new Date(),
      source: 'website',
    },
  };
  const result = await db.collection('messages').insertOne(doc);
  return result.insertedId.toString();
}

// Lead 24h sem contacto (Phase 1)
async function insert24hSimulation(
  db: Awaited<ReturnType<typeof getDb>>,
  params: PriceRequest,
): Promise<string> {
  const timeStamp = formatarData(new Date());
  const variante = params.variante ?? 'A';
  const doc = {
    company: 'Yourbox',
    messageType: 'preLeadSimulation',
    to: 'admin',
    toPrivate: null,
    presentationMessage: 'stick',
    deletedAfter: 10000,
    message: `<div style="line-height:1;">
      <p><b>🧮 SIMULAÇÃO 24H</b> <small>(${timeStamp})</small></p>
      <p>${params.local_recolha}</p>
      <p>${params.local_entrega}</p>
      <p><b>Viatura:</b> ${params.viatura ?? ''}</p>
      <p><b>Urgência:</b> 24 Horas</p>
      <p style="color:orange;"><b>⚠️ Requer contacto para orçamento</b></p>
    </div>`,
    companyProvider: 'Yourbox',
    senderName: 'Simulação Web ' + variante,
    variante,
    timeStamp: new Date(),
    closed: true,
    reply: [],
    leadData: {
      origem: params.local_recolha,
      destino: params.local_entrega,
      viatura: params.viatura ?? '',
      urgencia: '24 Horas',
      nome: params.nome,
      telefone: params.telemovel,
      email: params.email,
      converted: false,
      timeStamp: new Date(),
      source: 'website',
    },
  };
  const result = await db.collection('messages').insertOne(doc);
  return result.insertedId.toString();
}

// Lead 24h com contacto (Phase 2)
async function insert24hLead(
  db: Awaited<ReturnType<typeof getDb>>,
  params: PriceRequest,
): Promise<string> {
  const timeStamp = formatarData(new Date());
  const variante = params.variante ?? 'A';
  const doc = {
    company: 'Yourbox',
    messageType: 'newLead',
    to: 'admin',
    toPrivate: null,
    presentationMessage: 'stick',
    deletedAfter: 0,
    message: `<div style="line-height:1;">
      <p><b>PEDIDO DE PRECO 24H</b> <small>(${timeStamp})</small></p>
      <p>${params.nome ?? ''}</p>
      <p>${params.email ?? ''}</p>
      <p>${params.telemovel ?? ''}</p>
      <p>${params.local_recolha} → ${params.local_entrega}</p>
      <p><b>Viatura:</b> ${params.viatura ?? ''}</p>
      <p style="color:green;"><b>CONTACTAR AGORA</b></p>
    </div>`,
    companyProvider: 'Yourbox',
    senderName: 'Lead Web ' + variante,
    variante,
    timeStamp: new Date(),
    closed: false,
    closedAt: null,
    reply: [],
    leadData: {
      origem: params.local_recolha,
      destino: params.local_entrega,
      viatura: params.viatura ?? '',
      urgencia: '24 Horas',
      nome: params.nome,
      email: params.email,
      telefone: params.telemovel,
      converted: true,
      convertedAt: new Date(),
      timeStamp: new Date(),
      source: 'website',
    },
  };
  const result = await db.collection('messages').insertOne(doc);
  return result.insertedId.toString();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const params: PriceRequest = {
    local_recolha: searchParams.get('local_recolha') || '',
    local_entrega:  searchParams.get('local_entrega') || '',
    viatura:        searchParams.get('viatura') || undefined,
    peso_total:     searchParams.get('peso_total') || undefined,
    urgencia:       searchParams.get('urgencia') || '1 Hora',
    nome:           searchParams.get('nome') || undefined,
    email:          searchParams.get('email') || undefined,
    telemovel:      searchParams.get('telemovel') || undefined,
    variante:       searchParams.get('variante') || 'A',
    numero_volumes: searchParams.get('numero_volumes') || undefined,
    comprimento:    searchParams.get('comprimento') || undefined,
    largura:        searchParams.get('largura') || undefined,
    altura:         searchParams.get('altura') || undefined,
  };

  if (!params.local_recolha || !params.local_entrega) {
    return Response.json(
      { error: 'local_recolha e local_entrega são obrigatórios' },
      { status: 400 }
    );
  }

  const hasContact =
    params.email &&
    params.telemovel &&
    params.email.length > 3 &&
    params.email.includes('@');

  const isPhase1 = !hasContact;
  const isPhase2 = !!hasContact;

  const db = await getDb();
  const [settings, serverSettings] = await Promise.all([
    db.collection('calculators').findOne({ name: process.env.CALC_PRICE_MACHINE, companyProvider: 'Yourbox' }),
    db.collection('serverSettings').findOne({ companyProvider: 'Yourbox' }),
  ]);

  if (!settings) {
    return Response.json({ error: 'Calculadora não encontrada' }, { status: 500 });
  }

  if (serverSettings?.createNewLeadMessageSimulatePrice === false) {
    return Response.json({ error: 'Sistema temporariamente indisponível' }, { status: 503 });
  }

  const stats = {
    simulationsToday: await countSimulationsToday(db),
    rating: 4.8,
    totalReviews: 1247,
  };

  // ============================================
  // URGÊNCIA 24H
  // ============================================
  if (params.urgencia === '24 Horas') {
    if (isPhase1) {
      const simulationId = await insert24hSimulation(db, params);
      return Response.json({
        statusCode: 200,
        body: {
          success: true,
          simulationId,
          requiresContact: true,
          message: 'Para urgência 24h, preencha contacto para receber orçamento personalizado',
          stats,
        },
      });
    }
    // Phase 2 — 24h com contacto
    const leadId = await insert24hLead(db, params);
    return Response.json({
      statusCode: 200,
      body: {
        success: true,
        leadId,
        message: 'Lead registada! Receberá orçamento personalizado em breve.',
      },
    });
  }

  // ============================================
  // CÁLCULO DE PREÇO (1h / 4h)
  // ============================================
  const pesoRaw = params.viatura
    ? viaturaParaPeso[params.viatura] ?? params.peso_total ?? '2'
    : params.peso_total ?? '2';
  let type = pesoParaType(pesoRaw);
  let precedence = params.urgencia === '1 Hora' ? '1' : '4';

  const fixResult = await fixCityPrice(params.local_recolha, params.local_entrega, settings.poligonos);

  // Overrides automáticos
  if (fixResult.distanciaFinal > settings.globalParameters?.distance2To50 && type === '2') {
    type = '50';
  }
  if (fixResult.distanciaFinal > settings.globalParameters?.distance4To1 || new Date().getHours() > 13) {
    precedence = '1';
  }

  const priceResult = calculatePrice(fixResult, { type, precedence }, settings);

  const priceCalculated = priceResult.maxPrice;
  const discount        = priceCalculated * 0.1;
  const priceWithDiscount = priceCalculated - discount;

  // Roteamento
  const routingConfig = (await db.collection('leadRoutingConfig').findOne({})) ?? defaultRoutingConfig;
  const routing = decideMode(routingConfig as any, params.urgencia, new Date());

  // ============================================
  // FASE 1 — simulação sem contacto
  // ============================================
  if (isPhase1) {
    const simulationId = await insertPreLeadSimulation(
      db, params,
      priceCalculated, priceWithDiscount, discount,
      fixResult.distanciaFinal, priceResult.LX_PT, priceResult.GLX_GPT,
    );

    return Response.json({
      statusCode: 200,
      body: {
        success: true,
        simulationId,
        price: priceCalculated.toFixed(2),
        priceWithDiscount: priceWithDiscount.toFixed(2),
        discount: discount.toFixed(2),
        distance: fixResult.distanciaFinal,
        urgencia: params.urgencia,
        viatura: params.viatura,
        message: 'Preço calculado com sucesso',
        responseTime: getResponseTimeText(new Date()),
        stats,
        // campos internos para validação — remover após regressão OK
        _debug: {
          type: priceResult.type, precedence: priceResult.precedence,
          LX_PT: priceResult.LX_PT, GLX_GPT: priceResult.GLX_GPT,
          milestone: fixResult.milestone,
        },
      },
    });
  }

  // ============================================
  // FASE 2 — lead com contacto
  // ============================================
  const leadId = await insertNewLead(
    db, params,
    priceCalculated, priceWithDiscount, discount,
    fixResult.distanciaFinal, priceResult.LX_PT, priceResult.GLX_GPT,
    routing,
  );

  return Response.json({
    statusCode: 200,
    body: {
      success: true,
      leadId,
      price: priceCalculated.toFixed(2),
      priceWithDiscount: priceWithDiscount.toFixed(2),
      discount: discount.toFixed(2),
      message: 'Lead registada! Receberá email de confirmação em breve.',
      responseTime: getResponseTimeText(new Date()),
      stats,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const url = new URL(request.url);
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  return GET(new NextRequest(url, { method: 'GET' }));
}
