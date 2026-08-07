// Recuperação de conversões históricas para o Google Ads.
//
//   node --experimental-strip-types scripts/export-historico.mjs
//   node --experimental-strip-types scripts/export-historico.mjs --apply
//
// Sem --apply: lê, gera os CSV e escreve um MANIFESTO com os leadIds incluídos.
// Com --apply: lê o manifesto e marca exactamente essas leads. Não recalcula.
//
// O manifesto não é burocracia — é a correcção de um erro real. Na primeira
// utilização o --apply recalculava tudo do zero, e como entretanto tinham entrado
// leads novas, marcou 288 quando o ficheiro carregado tinha 284. Quatro leads
// ficaram dadas como enviadas sem nunca o terem sido, e nunca mais sairiam em
// exportação nenhuma. O que se marca tem de ser exactamente o que se carregou.
//
// Marca como 'uploaded' e não 'exported': este script só corre DEPOIS de o Google
// Ads aceitar o ficheiro, e só 'uploaded' as exclui de exportações futuras. Em
// 'exported' a exportação regular do dashboard apanhava-as outra vez.
//
// --so=gclid limita a marcação a um tipo de identificador, para quando se carrega
// só um dos ficheiros (o normal: o gbraid costuma ter meia dúzia de linhas).
//
// POR QUE EXISTE
//
// O gclid das leads antigas nunca se perdeu. O `yourbox-visit.js` sempre guardou o
// URL de entrada completo em `visits.entryPage`, gclid incluído — só que ninguém o
// lia. Este script faz a ligação que faltava:
//
//   visits.entryPage (gclid)  ->  visits.sessionId
//                                      |
//                      conversations.visitSid  ->  conversations.leadId
//                                                        |
//                                                  messages._id (a lead)
//
// Só apanha leads do quiz, que são as únicas com `visitSid`. As leads criadas pela
// plataforma antiga a partir dos formulários não têm essa ligação e ficam de fora.
//
// A formatação do CSV é a mesma do exportador em produção (lib/conversions/csv.ts),
// importada e não duplicada — é a parte frágil e já tem testes.

import pkg from 'mongodb';
const { MongoClient, ObjectId } = pkg;
import { readFileSync, writeFileSync, existsSync } from 'fs';

import {
  buildConversionsCsv,
  ensureAfterClick,
  formatConversionTime,
  CONVERSION_TIMEZONE,
} from '../lib/conversions/csv.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const APPLY = process.argv.includes('--apply');
const SO = (process.argv.find(a => a.startsWith('--so=')) ?? '').slice(5) || null;
const MANIFESTO = 'conversoes-historico-manifesto.json';
const CONVERSION_NAME = env.GOOGLE_ADS_CONVERSION_NAME ?? 'Lead Yourbox';
const CURRENCY = 'EUR';
const JANELA_DIAS = 89; // margem de 1 dia sobre os 90 do Google

const client = new MongoClient(env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

/**
 * Extrai os identificadores de clique de um URL de entrada.
 * Lê por NOME, não por ordem de aparecimento: o Google manda com frequência
 * `?gad_source=1&gbraid=...&gclid=...` e uma regex ingénua apanharia o gbraid.
 */
function clickIds(entryPage) {
  const qs = String(entryPage ?? '');
  const get = (k) => {
    const m = qs.match(new RegExp('[?&]' + k + '=([^&#]+)', 'i'));
    if (!m) return null;
    try { return decodeURIComponent(m[1]).trim() || null; } catch { return m[1].trim() || null; }
  };
  return { gclid: get('gclid'), wbraid: get('wbraid'), gbraid: get('gbraid') };
}

/** Havendo gclid, é o gclid que manda. Os de iOS só quando não há gclid. */
function escolher(ids) {
  if (ids.gclid) return { kind: 'gclid', id: ids.gclid };
  if (ids.wbraid) return { kind: 'wbraid', id: ids.wbraid };
  if (ids.gbraid) return { kind: 'gbraid', id: ids.gbraid };
  return null;
}

function leadPrice(leadData) {
  // Discriminação explícita por serviceType — os dois campos podem estar
  // preenchidos ao mesmo tempo e o `??` daria o preço errado.
  const raw = leadData?.serviceType === 'arrasto'
    ? leadData?.partnerFinalPrice
    : leadData?.priceWithDiscount;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Marca as leads do manifesto — e só essas. Nada é recalculado aqui: o que se
// marca tem de ser exactamente o que foi carregado no Google Ads.
async function aplicarManifesto(db) {
  if (!existsSync(MANIFESTO)) {
    console.log(`\nNao existe ${MANIFESTO}.`);
    console.log(`Corre primeiro sem --apply para gerar os CSV e o manifesto.\n`);
    return;
  }
  const m = JSON.parse(readFileSync(MANIFESTO, 'utf8'));
  const alvo = SO ? m.leads.filter(l => l.kind === SO) : m.leads;

  console.log(`\nManifesto de ${m.geradoEm} — ${m.leads.length} leads`);
  if (SO) console.log(`Filtrado por --so=${SO}: ${alvo.length} leads`);
  if (!alvo.length) { console.log('Nada a marcar.\n'); return; }

  const r = await db.collection('messages').updateMany(
    { _id: { $in: alvo.map(l => new ObjectId(l.leadId)) }, 'conversionSync.status': { $ne: 'uploaded' } },
    { $set: { 'conversionSync.status': 'uploaded', 'conversionSync.exportedAt': new Date() } },
  );
  const n = r.result?.nModified ?? r.modifiedCount ?? 0;
  console.log(`\nMarcadas como 'uploaded': ${n}   (${alvo.length - n} ja estavam)`);
  console.log(`Nao voltam a sair em nenhuma exportacao futura.\n`);
}

async function main() {
  await client.connect();
  const db = client.db(env.MONGODB_DB ?? 'weby');

  if (APPLY) { await aplicarManifesto(db); await client.close(); return; }

  const limite = new Date(Date.now() - JANELA_DIAS * 24 * 3600 * 1000);

  // ── 1. Visitas que trouxeram identificador de clique ──────────────────────
  const visitas = await db.collection('visits')
    .find({ entryPage: /[?&](gclid|wbraid|gbraid)=/i },
      { projection: { sessionId: 1, entryPage: 1, firstSeen: 1 } })
    .toArray();

  const porSid = new Map();
  for (const v of visitas) {
    const esc = escolher(clickIds(v.entryPage));
    if (esc) porSid.set(v.sessionId, { ...esc, clickedAt: v.firstSeen });
  }

  // ── 2. Conversas de quiz que chegaram a lead ──────────────────────────────
  const convs = await db.collection('conversations')
    .find({ visitSid: { $exists: true }, leadId: { $exists: true } },
      { projection: { visitSid: 1, leadId: 1 } })
    .toArray();

  const porLeadId = new Map();
  for (const c of convs) {
    const a = porSid.get(c.visitSid);
    if (a && !porLeadId.has(c.leadId)) porLeadId.set(c.leadId, a);
  }

  // ── 3. As leads propriamente ditas ────────────────────────────────────────
  const oids = [...porLeadId.keys()]
    .map(id => { try { return new ObjectId(id); } catch { return null; } })
    .filter(Boolean);

  const leads = await db.collection('messages')
    .find({ _id: { $in: oids }, timeStamp: { $gte: limite }, 'conversionSync.status': { $ne: 'uploaded' } },
      { projection: { timeStamp: 1, variante: 1, conversionSync: 1, 'leadData.serviceType': 1,
                      'leadData.partnerFinalPrice': 1, 'leadData.priceWithDiscount': 1 } })
    .toArray();

  // ── 4. Montar as linhas, aplicando as mesmas regras do exportador ─────────
  const candidatas = [];
  let ajustadas = 0;
  for (const l of leads) {
    const a = porLeadId.get(String(l._id));
    if (!a) continue;
    const conversionTime = new Date(l.timeStamp);
    if (isNaN(conversionTime.getTime())) continue;

    const clickedAt = a.clickedAt ? new Date(a.clickedAt) : null;
    const t = ensureAfterClick(conversionTime, clickedAt);
    if (t.getTime() !== conversionTime.getTime()) ajustadas++;

    candidatas.push({
      leadId: String(l._id), kind: a.kind, clickId: a.id,
      conversionTime: t, value: leadPrice(l.leadData), variante: l.variante ?? null,
    });
  }

  // Um clique nunca gera duas conversões: fica a lead mais antiga.
  candidatas.sort((x, y) => x.conversionTime - y.conversionTime);
  const vistos = new Set();
  const finais = candidatas.filter(c => !vistos.has(c.clickId) && vistos.add(c.clickId));

  // ── 5. Relatório ──────────────────────────────────────────────────────────
  console.log(`\nGERACAO — nada e escrito na base de dados\n`);
  console.log(`Visitas com click id no entryPage : ${visitas.length}`);
  console.log(`Conversas de quiz ligadas a lead  : ${porLeadId.size}`);
  console.log(`Leads dentro da janela de ${JANELA_DIAS} dias : ${leads.length}`);
  console.log(`Depois de remover cliques repetidos: ${finais.length}   (${candidatas.length - finais.length} duplicados)`);
  if (ajustadas) console.log(`Horas ajustadas para depois do clique: ${ajustadas}`);

  const porTipo = {};
  const porDia = {};
  let comValor = 0;
  for (const c of finais) {
    porTipo[c.kind] = (porTipo[c.kind] ?? 0) + 1;
    const d = c.conversionTime.toLocaleDateString('sv-SE', { timeZone: CONVERSION_TIMEZONE });
    porDia[d] = (porDia[d] ?? 0) + 1;
    if (c.value > 0) comValor++;
  }
  console.log(`\nPor tipo: ${JSON.stringify(porTipo)}`);
  console.log(`Com valor monetario: ${comValor} de ${finais.length}`);

  console.log('\nPor dia:');
  for (const d of Object.keys(porDia).sort()) {
    console.log(`  ${d}  ${'#'.repeat(Math.min(porDia[d], 40))} ${porDia[d]}`);
  }

  // ── 6. Escrever um CSV por tipo de identificador ──────────────────────────
  const stamp = new Date().toISOString().slice(0, 10);
  const ficheiros = [];
  for (const kind of ['gclid', 'wbraid', 'gbraid']) {
    const rows = finais.filter(c => c.kind === kind);
    if (!rows.length) continue;
    const csv = buildConversionsCsv(
      rows.map(r => ({
        clickId: r.clickId, conversionName: CONVERSION_NAME,
        conversionTime: r.conversionTime, value: r.value, currency: CURRENCY,
      })),
      { kind },
    );
    const nome = `conversoes-historico-${kind}-${stamp}.csv`;
    writeFileSync(nome, csv, 'utf8');
    ficheiros.push({ nome, n: rows.length });
  }

  console.log('\nFicheiros gerados:');
  for (const f of ficheiros) console.log(`  ${f.nome}  (${f.n} conversoes)`);

  if (finais.length) {
    const p = finais[0];
    console.log(`\nPrimeira linha, para conferir o formato:`);
    console.log(`  ${p.clickId.slice(0, 30)}...,${CONVERSION_NAME},${formatConversionTime(p.conversionTime)},${p.value.toFixed(2)},${CURRENCY}`);
  }

  // ── 7. Manifesto: exactamente o que foi para os CSV ───────────────────────
  writeFileSync(MANIFESTO, JSON.stringify({
    geradoEm: new Date().toISOString(),
    ficheiros: ficheiros.map(f => f.nome),
    leads: finais.map(c => ({ leadId: c.leadId, kind: c.kind, clickId: c.clickId })),
  }, null, 2), 'utf8');

  console.log(`\nManifesto: ${MANIFESTO} (${finais.length} leads)`);
  console.log(`\nNada foi escrito na base de dados.`);
  console.log(`Carrega o CSV no Google Ads e SO DEPOIS corre:`);
  console.log(`  node --experimental-strip-types scripts/export-historico.mjs --apply --so=gclid`);

  console.log('');
  await client.close();
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
