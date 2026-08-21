/**
 * Que domínios estão a usar cada clientId de widget (leitura apenas, todo o histórico).
 *
 *   node scripts/widget-refs.mjs
 *
 * Serve para confirmar onde cada código de embed está realmente instalado antes de
 * mexer em ids — um id usado por mais do que um domínio muda tudo.
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient } = pkg;

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const cli = new MongoClient(env.MONGODB_URI);
await cli.connect();
const db = cli.db(env.MONGODB_DB || 'weby');

const widgets = await db.collection('widgetClients').find({}).toArray();

for (const col of ['conversations', 'messages']) {
  console.log(`\n=== ${col}: dominios por clientId (todo o historico) ===`);
  const rows = await db.collection(col).aggregate([
    { $match: { widgetClientId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: { id: '$widgetClientId', ref: '$widgetRef' },
        n: { $sum: 1 },
        nomeGravado: { $addToSet: '$widgetClientName' },
        primeira: { $min: { $ifNull: ['$createdAt', '$timeStamp'] } },
        ultima: { $max: { $ifNull: ['$createdAt', '$timeStamp'] } },
      },
    },
    { $sort: { n: -1 } },
  ]).toArray();

  if (!rows.length) { console.log('  (nada)'); continue; }
  for (const r of rows) {
    const w = widgets.find((x) => x.clientId === r._id.id);
    console.log(`  id ${r._id.id}  ->  hoje pertence a "${w?.name ?? '???'}"`);
    console.log(`     dominio: ${r._id.ref ?? '(sem ref)'}   ${r.n} registos   nome gravado: ${JSON.stringify(r.nomeGravado)}`);
    console.log(`     de ${r.primeira ? new Date(r.primeira).toLocaleString('pt-PT') : '?'} a ${r.ultima ? new Date(r.ultima).toLocaleString('pt-PT') : '?'}`);
  }
}

// Trafego do modo assistente (bot) — o carimbo vive dentro de data.*
console.log(`\n=== conversas do modo assistente (data.widgetClientId) ===`);
const bot = await db.collection('conversations').aggregate([
  { $match: { 'data.widgetClientId': { $exists: true, $ne: null } } },
  { $group: { _id: { id: '$data.widgetClientId', ref: '$data.widgetRef' }, n: { $sum: 1 } } },
]).toArray();
console.log(bot.length ? bot.map((b) => `  id ${b._id.id} dominio ${b._id.ref ?? '?'} ${b.n} registos`).join('\n') : '  (nada)');

await cli.close();
