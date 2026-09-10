import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { normalizeAttribution, newConversionSync } from '@/lib/attribution';
import { explainWidgetAttribution } from '@/lib/widget/attribution';
import { triarLeadNova } from '@/lib/crm/entrada';
import { enviarConfirmacaoDoPedido } from '@/lib/email/confirmacao';
import { esc } from '@/lib/html';

// Recebe o progresso do quiz (site_YB/index-quiz*.html) e materializa-o como uma
// "conversa" na colecção conversations, para aparecer na vista de Conversas do
// dashboard — uma timeline de passos em vez de bolhas de chat.
//
// Chamado cross-origin (yourbox.com.pt -> leads.comgo.pt) via navigator.sendBeacon
// com Content-Type text/plain (pedido simples, sem preflight). Fire-and-forget.

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Início do dia de HOJE em Lisboa, como instante UTC (independente do fuso do servidor).
function lisbonStartOfTodayUtc(): Date {
  const now = new Date();
  const lisbonNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const diff = now.getTime() - lisbonNow.getTime(); // ajuste fuso Lisboa -> UTC
  const midnightWall = new Date(lisbonNow.getFullYear(), lisbonNow.getMonth(), lisbonNow.getDate(), 0, 0, 0, 0);
  return new Date(midnightWall.getTime() + diff);
}

function json(obj: unknown, status = 200) {
  return Response.json(obj, { status, headers: CORS });
}

// Valor introduzido pelo visitante no passo `step` (para mostrar na timeline do dashboard)
function stepValue(step: string | undefined, data: Record<string, any> | undefined): string | null {
  if (!step || !data) return null;
  const v = (x: any) => (x === undefined || x === null || x === '' ? null : String(x));
  switch (step) {
    case 'nome':      return v(data.nome);
    case 'telefone':  return v(data.telefone);
    case 'email':     return v(data.email);
    case 'origem':    return v(data.origem);
    case 'destino':   return v(data.destino);
    case 'volumes':   return data.volumes ? `${data.volumes} volumes` : null;
    case 'peso':      return data.peso ? `${data.peso} kg/volume` : null;
    case 'dimensoes': return (data.comprimento && data.largura && data.altura) ? `${data.comprimento} x ${data.largura} x ${data.altura} cm` : null;
    case 'urgencia':  return v(data.urgencia);
    case 'material':  return v(data.material);
    case 'embalado':  return v(data.embalado);
    default:          return null;
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Prova social REAL para o quiz (site_YB): quantas pessoas INICIARAM um orçamento hoje.
// Conta as conversas do quiz (canal web-quiz) criadas hoje — mais representativo da
// actividade do que só as que chegaram a lead. Cache de 60s em memória para não varrer
// a colecção a cada carregamento de página.
let _startsTodayCache: { at: number; value: number } | null = null;

export async function GET() {
  try {
    if (_startsTodayCache && Date.now() - _startsTodayCache.at < 60_000) {
      return json({ startsToday: _startsTodayCache.value });
    }
    const db = await getDb();
    const startsToday = await db.collection('conversations').countDocuments({
      canal: 'web-quiz',
      createdAt: { $gte: lisbonStartOfTodayUtc() },
    });
    _startsTodayCache = { at: Date.now(), value: startsToday };
    return json({ startsToday });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const { sessionId, visitSid, event, step, stepIndex, total, label, data, variante, geo, attr, widgetClientId, widgetRef } = body as {
      sessionId?: string;
      visitSid?: string;
      event?: 'progress' | 'submit' | 'geo';
      step?: string;
      stepIndex?: number;
      total?: number;
      label?: string;
      data?: Record<string, any>;
      variante?: string;
      geo?: { lat?: number; lng?: number; address?: string; field?: string; source?: string; city?: string; region?: string; country?: string };
      attr?: unknown;
      widgetClientId?: string;
      widgetRef?: string;
    };

    if (!sessionId || typeof sessionId !== 'string') {
      return json({ error: 'sessionId em falta' }, 400);
    }

    const db = await getDb();
    const col = db.collection('conversations');
    const now = new Date();
    const isSubmit = event === 'submit';

    // Evento de localizacao PRECISA (GPS) — o user clicou no botao das moradas (consentido).
    // Actualiza so a geo (substitui a aproximada por IP), sem mexer no passo/timeline.
    if (event === 'geo') {
      if (geo && geo.lat != null && geo.lng != null) {
        await col.updateOne(
          { quizSessionId: sessionId },
          { $set: { 'data.geo': { source: 'gps', lat: Number(geo.lat), lng: Number(geo.lng), address: geo.address ?? null, field: geo.field ?? null, at: now }, updatedAt: now } },
        );
      }
      return json({ success: true, geo: 'gps' });
    }

    // Telemóvel real assim que conhecido; caso contrário identificador anónimo
    const telDigits = String(data?.telefone ?? '').replace(/\D/g, '');
    const realPhone = /^[0-9]{9}$/.test(telDigits) ? telDigits : null;
    const tel = realPhone ?? ('web_quiz_' + sessionId.slice(0, 8));

    const stepMsg = {
      role: 'step' as const,
      text: label || step || 'Passo',
      step: step ?? null,
      stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
      total: typeof total === 'number' ? total : null,
      value: stepValue(step, data), // valor introduzido neste passo (para mostrar na timeline)
      timestamp: now,
    };

    // Espalhar os dados recolhidos em data.* (sem apagar o que já existe)
    const dataSet: Record<string, unknown> = {};
    if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
          dataSet['data.' + k] = data[k];
        }
      }
    }

    // Atribuição de campanha do cookie `yb_attr`. Vem em todos os eventos de progresso,
    // por isso continua presente mesmo que o visitante recarregue a página a meio.
    const attribution = normalizeAttribution(attr);

    // Atribuicao ao cliente de widget white-label (para comissoes). Validada no servidor
    // contra a coleccao widgetClients; se nao for valida, a lead regista-se na mesma sem
    // atribuicao. Vem em todos os eventos, por isso resiste a recarregamentos da pagina.
    const widgetResult = await explainWidgetAttribution(db, widgetClientId, widgetRef);
    const widget = widgetResult.ok ? widgetResult.attribution : null;
    // Recusa com id presente fica registada: sem isto, uma lead que devia ser de um
    // parceiro aparece sem parceiro nenhum e nao ha como saber porque.
    const widgetRejected = !widgetResult.ok && widgetResult.reason !== 'sem-id'
      ? { reason: widgetResult.reason, clientId: widgetResult.clientId, ref: widgetResult.ref, at: now }
      : null;

    await col.updateOne(
      { quizSessionId: sessionId },
      {
        $setOnInsert: { canal: 'web-quiz', quizSessionId: sessionId, createdAt: now },
        $set: {
          telemovel: tel,
          step: isSubmit ? 'LEAD_REGISTERED' : 'QUIZ_IN_PROGRESS',
          quizStep: step ?? null,
          ...(variante ? { quizVariante: variante } : {}),
          ...(visitSid ? { visitSid } : {}),
          ...(attribution ? { attribution } : {}),
          ...(widget ? widget : {}),
          ...(widgetRejected ? { widgetRejected } : {}),
          ...dataSet,
          updatedAt: now,
          ...(isSubmit ? { closedAt: now } : {}),
        },
        $push: { history: stepMsg },
      },
      { upsert: true },
    );

    // Geo APROXIMADA por IP — vem do BROWSER no payload (o browser pergunta a um serviço
    // que vê o IP REAL do visitante; contorna o IP mascarado pelo Docker no servidor).
    // Só preenche se ainda não houver geo GPS (a GPS é mais precisa e tem prioridade).
    if (geo && (geo.city || geo.lat != null) && geo.source !== 'gps') {
      await col.updateOne(
        { quizSessionId: sessionId, 'data.geo.source': { $ne: 'gps' } },
        { $set: { 'data.geo': {
          source: 'ip',
          city: geo.city ?? null, region: geo.region ?? null, country: geo.country ?? null,
          lat: geo.lat != null ? Number(geo.lat) : null, lng: geo.lng != null ? Number(geo.lng) : null,
          at: now,
        } } },
      ).catch(() => {});
    }

    // No envio final, registar a lead na coleccao `messages` (newLead) para aparecer na
    // lista de Leads deste dashboard e tocar o som de nova lead. A coleccao e partilhada
    // com a plataforma YourBox antiga, por isso marcamos a entrada com `appSource:
    // 'leads-control'` — a YourBox filtra por esse campo para nao mostrar esta linha
    // (a lead "oficial" e enviada pela API antiga; ver YOURBOX_FILTER_PROMPT.md).
    // O email de confirmacao ao cliente e enviado por nos (ver lib/email/confirmacao.ts).
    // Era da plataforma antiga, mas la a classificacao da lead ainda nao existe quando o
    // email sai — e e ela que decide se a mensagem leva o pedido de autorizacao. O envio
    // do nodechef fica como redundancia para quando este servidor estiver em baixo.
    if (isSubmit) {
      const guard: any = await col.findOneAndUpdate(
        { quizSessionId: sessionId, leadRegisteredAt: { $exists: false } },
        { $set: { leadRegisteredAt: now } },
      );
      const convDoc = guard?.value ?? null; // driver v3: devolve { value, ok }
      if (convDoc) {
        const d = { ...(convDoc.data ?? {}), ...(data ?? {}) };
        const urMap: Record<string, string> = { 'Imediata': '1 Hora', 'Proprio dia': '4 Horas', 'Próprio dia': '4 Horas', '24H': '24 Horas' };
        const urg = urMap[d.urgencia] ?? d.urgencia ?? null;
        const serviceType = d.urgencia === '24H' ? 'arrasto' : 'direto';
        const totalKg = (Number(d.volumes) || 0) * (Number(d.peso) || 0) || null;
        const maxDim = Math.max(Number(d.comprimento) || 0, Number(d.largura) || 0, Number(d.altura) || 0);
        const viatura = totalKg && totalKg <= 2 && maxDim <= 60 ? 'Moto'
          : totalKg && totalKg <= 150 ? 'Furgão Classe 1'
          : totalKg ? 'Furgão Classe 2' : null;
        // Descricao da carga com o mesmo detalhe que a plataforma YourBox mostra em
        // "Observacoes do cliente" — dimensoes e peso por volume incluidos, que e o que
        // permite dimensionar a viatura sem ter de telefonar a perguntar.
        const dimensoes = d.comprimento && d.largura && d.altura
          ? `${d.comprimento}x${d.largura}x${d.altura} cm (por volume)` : null;
        const partesCarga = [
          `${d.volumes ?? '?'} volumes`,
          dimensoes,
          totalKg ? `${totalKg} kg (total)` : null,
          d.peso ? `Peso médio: ${d.peso} kg/volume` : null,
          d.material ? `Material: ${d.material}` : null,
          d.embalado || null,
        ].filter(Boolean);
        const cargaHtml = partesCarga.length > 1 ? `<p><b>Carga:</b> ${esc(partesCarga.join(' · '))}</p>` : '';

        // Atribuição publicitária: a do submit, ou a que já ficou na conversa nos
        // passos anteriores. Sem gclid a lead cria-se na mesma — só não é exportável.
        const leadAttr = attribution ?? convDoc.attribution ?? null;

        // Cliente de widget: o do submit, ou o que ja ficou na conversa nos passos
        // anteriores. Fica na raiz do doc (para o apuramento de comissoes) e em
        // leadData (para as vistas que so leem leadData).
        const leadWidget = widget ?? (convDoc.widgetClientId
          ? { widgetClientId: convDoc.widgetClientId, widgetClientName: convDoc.widgetClientName ?? null, widgetRef: convDoc.widgetRef ?? null }
          : null);

        const leadDoc = {
          company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
          appSource: 'leads-control', // marcador para a YourBox antiga filtrar esta entrada
          presentationMessage: 'stick', deletedAfter: 0,
          // Tudo o que veio do visitante passa por esc(): este HTML e mostrado no
          // dashboard com dangerouslySetInnerHTML e vai tambem para o leadsBoard do
          // Meteor. Sem escape, um nome com <img src=x onerror=...> corria no browser
          // da operadora, com a sessao dela. A marcacao e nossa e nao se escapa.
          message: `<div style="line-height:1.4;"><p><b>LEAD QUIZ</b> <small>(${now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })})</small></p><p>${esc(realPhone)}</p><p>${esc(d.nome)}</p>${d.email ? `<p>${esc(d.email)}</p>` : ''}<p>${esc(d.origem)} → ${esc(d.destino)}</p><p><b>Urgência:</b> ${esc(urg) || '—'}</p>${cargaHtml}<p style="color:green;"><b>CONTACTAR AGORA [canal: QUIZ]</b></p></div>`,
          companyProvider: 'Yourbox', senderName: 'Quiz Web', variante: variante ?? 'QUIZ',
          timeStamp: now, closed: false, closedAt: null, reply: [],
          ...(leadAttr ? { attribution: leadAttr, conversionSync: newConversionSync() } : {}),
          ...(leadWidget ? leadWidget : {}),
          leadData: {
            origem: d.origem, destino: d.destino,
            urgencia: urg, serviceType, viatura, weightKg: totalKg,
            nome: d.nome, email: d.email, telefone: realPhone ?? d.telefone,
            volumes: d.volumes, material: d.material, embalado: d.embalado,
            // O que a pessoa escreveu por palavras dela. E a unica parte destas
            // observacoes que nao foi a aplicacao que compos — e por isso a unica
            // que a triagem pode mesmo ler (lib/crm/categorias.ts).
            observacoes: d.observacoes ?? null,
            // Dimensoes e peso por volume: existiam na conversa mas nao passavam para a
            // lead, e faziam falta a quem trata dela.
            comprimento: d.comprimento ?? null, largura: d.largura ?? null, altura: d.altura ?? null,
            dimensoes, pesoPorVolume: d.peso ?? null,
            geo: d.geo ?? null,
            ...(leadWidget ? leadWidget : {}),
            timeStamp: now, converted: true, convertedAt: now, source: 'quiz',
          },
        };
        const ins = await db.collection('messages').insertOne(leadDoc as any);
        // Vincular a conversa à lead criada (link simétrico p/ o fluxo de apagar).
        await col.updateOne({ quizSessionId: sessionId }, { $set: { leadId: ins.insertedId.toString() } });

        // CRM de Parceiros: classificar a lead a chegada. So abre consulta se a triagem
        // a der como nao servivel (Linha B) — e nunca distribui: isso depende da
        // autorizacao do cliente e da decisao da operadora.
        //
        // Esperado, nao lancado em segundo plano: o Next nao garante que uma promessa
        // solta sobreviva ao fim do pedido, e a triagem simplesmente nao acontecia. A
        // espera nao custa nada a ninguem — o quiz manda isto por `sendBeacon` e nunca
        // espera pela resposta. E `triarLeadNova` nao lanca, portanto nao pode fazer
        // perder a lead.
        const triagem = await triarLeadNova(db, ins.insertedId.toString(), leadDoc.leadData);

        // Um so email para o cliente: confirmacao do pedido, ja com a pergunta da
        // autorizacao la dentro quando a lead sai do ambito. Nao lanca.
        await enviarConfirmacaoDoPedido(db, {
          nome: d.nome, email: d.email,
          origem: d.origem, destino: d.destino, urgencia: urg ?? undefined,
          viatura, material: d.material, volumes: d.volumes, weightKg: totalKg,
          embalado: d.embalado, multiMorada: !!d.multiMorada,
        }, triagem);
      } else {
        // Já havia lead para esta conversa — tipicamente criada a partir da inbox, quando
        // a operadora a marcou como registada com os dados parciais. Não se cria uma
        // segunda: actualiza-se a existente com o que o visitante preencheu até ao fim.
        const existente = await col.findOne(
          { quizSessionId: sessionId },
          { projection: { leadId: 1, data: 1 } },
        );
        if (existente?.leadId) {
          const d = { ...(existente.data ?? {}), ...(data ?? {}) };
          const urMap: Record<string, string> = { 'Imediata': '1 Hora', 'Proprio dia': '4 Horas', 'Próprio dia': '4 Horas', '24H': '24 Horas' };
          const totalKg = (Number(d.volumes) || 0) * (Number(d.peso) || 0) || null;
          const maxDim = Math.max(Number(d.comprimento) || 0, Number(d.largura) || 0, Number(d.altura) || 0);
          const viatura = totalKg && totalKg <= 2 && maxDim <= 60 ? 'Moto'
            : totalKg && totalKg <= 150 ? 'Furgão Classe 1'
            : totalKg ? 'Furgão Classe 2' : null;

          // Só sobrepõe o que tem valor: o que o visitante não preencheu fica como estava.
          const set: Record<string, unknown> = { 'leadData.updatedAt': now };
          const por = (campo: string, valor: unknown) => {
            if (valor !== undefined && valor !== null && valor !== '') set[`leadData.${campo}`] = valor;
          };
          por('nome', d.nome);
          por('email', d.email);
          por('telefone', String(d.telefone ?? '').replace(/\D/g, '') || null);
          por('origem', d.origem);
          por('destino', d.destino);
          por('urgencia', urMap[d.urgencia] ?? d.urgencia);
          por('serviceType', d.urgencia === '24H' ? 'arrasto' : 'direto');
          por('volumes', d.volumes);
          por('material', d.material);
          por('observacoes', d.observacoes);
          por('embalado', d.embalado);
          por('weightKg', totalKg);
          por('viatura', viatura);
          por('geo', d.geo);

          try {
            await db.collection('messages').updateOne({ _id: new ObjectId(String(existente.leadId)) }, { $set: set });

            // Triar tambem aqui. Esta lead ja existia — foi criada a partir da inbox,
            // quando a operadora registou o contacto antes de a pessoa terminar — e so
            // AGORA ganhou o material e o peso, que e o que a triagem precisa. Sem isto,
            // uma lead de mudancas registada a meio do quiz nunca chegava ao CRM.
            //
            // A `consultaDeLead` nao duplica: se ja houver consulta para esta lead,
            // devolve a que existe.
            const triagem = await triarLeadNova(db, String(existente.leadId), {
              origem: d.origem, destino: d.destino,
              urgencia: urMap[d.urgencia] ?? d.urgencia,
              viatura, material: d.material, weightKg: totalKg, volumes: d.volumes,
              observacoes: d.observacoes,
            });

            // Tambem aqui: a pessoa acabou de terminar o quiz, e do ponto de vista dela
            // nada distingue este ramo do outro. So o registo da lead e que e diferente.
            await enviarConfirmacaoDoPedido(db, {
              nome: d.nome, email: d.email,
              origem: d.origem, destino: d.destino,
              urgencia: urMap[d.urgencia] ?? d.urgencia,
              viatura, material: d.material, volumes: d.volumes, weightKg: totalKg,
              embalado: d.embalado, multiMorada: !!d.multiMorada,
            }, triagem);
          } catch { /* leadId inválido ou lead apagada: nada a actualizar */ }
        }
      }
    }

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}
