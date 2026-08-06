// Migração da captura de gclid / conversões offline.
//
//   node scripts/migrate-attribution.mjs          (só mostra o que faria)
//   node scripts/migrate-attribution.mjs --apply  (cria os índices)
//
// DELIBERADAMENTE não escreve `attribution: null` nem `conversionSync: null` nos
// documentos existentes, ao contrário do que seria uma migração típica:
//
//   A colecção `messages` é PARTILHADA com a plataforma YourBox antiga, que não
//   está sob o nosso controlo. Um updateMany sobre centenas de milhares de
//   documentos vivos, para acrescentar campos que ninguém lê, é risco sem
//   retorno. As queries do exportador tratam o campo ausente como 'pending'
//   ({ 'conversionSync.status': { $ne: 'uploaded' } } corresponde a documentos
//   sem o campo), por isso as leads antigas comportam-se correctamente sem
//   lhes tocar.
//
// O que esta migração faz é o que é mesmo preciso: os índices.

import pkg from 'mongodb';
const { MongoClient } = pkg;
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const APPLY = process.argv.includes('--apply');

const INDEXES = [
  {
    col: 'messages',
    spec: { 'attribution.gclid': 1 },
    opts: { sparse: true, background: true, name: 'attribution_gclid' },
    porque: 'procurar leads por identificador de clique',
  },
  {
    col: 'messages',
    spec: { 'conversionSync.status': 1, timeStamp: -1 },
    opts: { sparse: true, background: true, name: 'conversionSync_status_ts' },
    porque: 'listar o que falta exportar, por data',
  },
  {
    col: 'attributions',
    spec: { phone: 1, createdAt: -1 },
    opts: { background: true, name: 'phone_createdAt' },
    porque: 'reconciliar leads da plataforma antiga por telemóvel',
  },
  {
    col: 'attributions',
    spec: { createdAt: 1 },
    opts: { expireAfterSeconds: 120 * 24 * 3600, background: true, name: 'ttl_120d' },
    porque: 'expirar atribuições órfãs (120d > janela de 90d do Google)',
  },
  {
    col: 'visits',
    spec: { 'attribution.gclid': 1 },
    opts: { sparse: true, background: true, name: 'attribution_gclid' },
    porque: 'medir cobertura de captura no painel',
  },
];

const client = new MongoClient(env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

async function main() {
  await client.connect();
  const db = client.db(env.MONGODB_DB ?? 'weby');

  console.log(APPLY ? '\nA APLICAR\n' : '\nSIMULACAO (usar --apply para criar)\n');

  for (const ix of INDEXES) {
    const alvo = `${ix.col}.${ix.opts.name}`;
    if (!APPLY) {
      console.log(`  criaria  ${alvo.padEnd(42)} ${ix.porque}`);
      continue;
    }
    try {
      await db.collection(ix.col).createIndex(ix.spec, ix.opts);
      console.log(`  ok       ${alvo.padEnd(42)} ${ix.porque}`);
    } catch (e) {
      console.log(`  FALHOU   ${alvo.padEnd(42)} ${e.message}`);
    }
  }

  // Fotografia do estado, para saber onde estamos antes e depois.
  const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [leads, comAttr, attrs] = await Promise.all([
    db.collection('messages').countDocuments({ companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: desde } }),
    db.collection('messages').countDocuments({ companyProvider: 'Yourbox', messageType: 'newLead', timeStamp: { $gte: desde }, 'attribution.gclid': { $exists: true } }),
    db.collection('attributions').countDocuments({}).catch(() => 0),
  ]);

  console.log(`\nUltimos 30 dias: ${leads} leads, ${comAttr} com gclid proprio.`);
  console.log(`Coleccao attributions: ${attrs} registos para reconciliacao.\n`);

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
