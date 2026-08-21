/**
 * Diagnóstico da atribuição de leads a widgets (leitura apenas).
 *
 *   node scripts/diagnostico-widget.mjs            # últimos 7 dias
 *   node scripts/diagnostico-widget.mjs 30         # últimos 30 dias
 *
 * Mostra, para cada widget configurado, o que está gravado nas conversas e nas leads:
 * que id chegou, de que domínio (widgetRef) e, quando houve recusa, o motivo. É a forma
 * de perceber porque é que uma lead aparece sem parceiro ou com o parceiro errado.
 *
 * Requer .env.local com MONGODB_URI (existe no servidor; localmente se estiver configurado).
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient } = pkg;

const dias = Number(process.argv[2] || 7);
const desde = new Date(Date.now() - dias * 864e5);

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const cli = new MongoClient(env.MONGODB_URI);
await cli.connect();
const db = cli.db(env.MONGODB_DB || 'weby');

const d = (v) => (v ? new Date(v).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : '—');

console.log(`\n=== WIDGETS CONFIGURADOS ===`);
const widgets = await db.collection('widgetClients').find({}).toArray();
for (const w of widgets) {
  console.log(`\n  ${w.name}`);
  console.log(`    clientId .......... ${w.clientId}`);
  console.log(`    activo ............ ${w.active !== false}`);
  console.log(`    modo .............. ${w.mode ?? 'bot'} ${w.variante ?? ''}`);
  console.log(`    origens ........... ${JSON.stringify(w.allowedOrigins ?? ['*'])}`);
  console.log(`    comissionista ..... ${w.commissionUserName ?? '(nao definido)'}`);
}

console.log(`\n\n=== CONVERSAS DOS ULTIMOS ${dias} DIAS (canal web-quiz) ===`);
const convs = await db.collection('conversations')
  .find({ canal: 'web-quiz', createdAt: { $gte: desde } },
        { projection: { quizSessionId: 1, createdAt: 1, updatedAt: 1, widgetClientId: 1, widgetClientName: 1, widgetRef: 1, widgetRejected: 1, quizVariante: 1, leadId: 1, leadRegisteredAt: 1, 'data.nome': 1 } })
  .sort({ createdAt: -1 }).limit(40).toArray();

if (!convs.length) console.log('  (nenhuma)');
for (const c of convs) {
  const carimbo = c.widgetClientName ? `WIDGET: ${c.widgetClientName} (ref: ${c.widgetRef ?? '?'})` : 'sem widget';
  const rej = c.widgetRejected ? `  RECUSADO: ${c.widgetRejected.reason} id=${c.widgetRejected.clientId} ref=${c.widgetRejected.ref}` : '';
  console.log(`  ${d(c.createdAt)}  ${String(c.data?.nome ?? '—').padEnd(18)} ${String(c.quizVariante ?? '').padEnd(8)} ${carimbo}${rej}`);
  console.log(`      sessao ${c.quizSessionId}  lead ${c.leadId ?? '—'}  registada ${d(c.leadRegisteredAt)}`);
}

console.log(`\n\n=== LEADS DOS ULTIMOS ${dias} DIAS (messages/newLead) ===`);
const leads = await db.collection('messages')
  .find({ companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: desde } },
        { projection: { timeStamp: 1, variante: 1, widgetClientId: 1, widgetClientName: 1, widgetRef: 1, 'leadData.nome': 1, 'leadData.source': 1 } })
  .sort({ timeStamp: -1 }).limit(40).toArray();

if (!leads.length) console.log('  (nenhuma)');
for (const l of leads) {
  const carimbo = l.widgetClientName ? `WIDGET: ${l.widgetClientName} (id ${l.widgetClientId}, ref ${l.widgetRef ?? '?'})` : 'sem widget';
  console.log(`  ${d(l.timeStamp)}  ${String(l.leadData?.nome ?? '—').padEnd(18)} ${String(l.variante ?? '').padEnd(8)} ${carimbo}`);
}

console.log(`\n\n=== RESUMO POR WIDGET (${dias} dias) ===`);
for (const w of widgets) {
  const nConv = await db.collection('conversations').countDocuments({ widgetClientId: w.clientId, createdAt: { $gte: desde } });
  const nLead = await db.collection('messages').countDocuments({ widgetClientId: w.clientId, timeStamp: { $gte: desde } });
  console.log(`  ${String(w.name).padEnd(20)} conversas ${String(nConv).padStart(3)}   leads ${String(nLead).padStart(3)}`);
}
const semCarimbo = await db.collection('conversations').countDocuments({ canal: 'web-quiz', createdAt: { $gte: desde }, widgetClientId: { $exists: false } });
console.log(`  ${'(sem widget)'.padEnd(20)} conversas ${String(semCarimbo).padStart(3)}   <- trafego proprio, ou atribuicao falhada`);

await cli.close();
