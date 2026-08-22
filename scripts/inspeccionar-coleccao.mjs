/**
 * Estrutura de uma colecção (leitura apenas).
 *
 *   node scripts/inspeccionar-coleccao.mjs leadsMetadata
 *   node scripts/inspeccionar-coleccao.mjs leadsMetadata 5
 *
 * Mostra a contagem, os campos encontrados numa amostra e um documento de exemplo com
 * os valores mascarados nos campos de contacto. Útil para perceber colecções da
 * plataforma YourBox antes de lhes tocar.
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient } = pkg;

const nome = process.argv[2];
const n = Number(process.argv[3] || 3);
if (!nome) { console.error('Uso: node scripts/inspeccionar-coleccao.mjs <coleccao> [amostra]'); process.exit(1); }

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const cli = new MongoClient(env.MONGODB_URI);
await cli.connect();
const db = cli.db(env.MONGODB_DB || 'weby');
const col = db.collection(nome);

const SENSIVEL = /email|mail|telefone|telemovel|phone|nome|name|morada|address/i;
const mascarar = (k, v) => {
  if (typeof v !== 'string' || !SENSIVEL.test(k)) return v;
  if (v.includes('@')) return v.replace(/^(.).*(@.*)$/, '$1***$2');
  return v.length > 3 ? v.slice(0, 2) + '***' : '***';
};

const chaves = (o, p = '', out = new Set()) => {
  for (const [k, v] of Object.entries(o ?? {})) {
    const path = p + k;
    out.add(`${path}: ${v === null ? 'null' : Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : typeof v}`);
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !v._bsontype) chaves(v, path + '.', out);
  }
  return out;
};

console.log(`\n=== ${nome} ===`);
console.log('documentos:', await col.estimatedDocumentCount());

const docs = await col.find({}).sort({ _id: -1 }).limit(n).toArray();
if (!docs.length) { console.log('(vazia)'); await cli.close(); process.exit(0); }

const todas = new Set();
for (const d of docs) for (const c of chaves(d)) todas.add(c);
console.log('\ncampos na amostra:');
for (const c of [...todas].sort()) console.log('  ', c);

console.log('\ndocumento mais recente (campos de contacto mascarados):');
const exemplo = JSON.parse(JSON.stringify(docs[0], (k, v) => mascarar(k, v)));
console.log(JSON.stringify(exemplo, null, 2).slice(0, 2500));

await cli.close();
