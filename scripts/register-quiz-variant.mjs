// Regista a variante "quiz" no routing A/B (routingConfig.yourbox_main.variants).
// Idempotente: se já existir, actualiza o ficheiro/label e MANTÉM o peso configurado.
// Adiciona com peso 0 (não desvia tráfego) — o peso define-se depois no dashboard.
//
// Correr no servidor (onde existe .env.local):
//   node scripts/register-quiz-variant.mjs

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

const COLLECTION = 'routingConfig';
const DOC_ID = 'yourbox_main';

// Espelha DEFAULT_VARIANTS de app/api/variant-config/route.ts
const DEFAULT_VARIANTS = [
  { key: 'a',    label: 'Variante A',          desc: 'Formulário clássico',           file: 'index-a.html',      weight: 0 },
  { key: 'b',    label: 'Variante B',          desc: 'Formulário com chat integrado', file: 'index-b.html',      weight: 100 },
  { key: 'c',    label: 'Variante C',          desc: '',                              file: 'index-c.html',      weight: 0 },
  { key: 'd',    label: 'Variante D',          desc: '',                              file: 'index-d.html',      weight: 0 },
  { key: 'chat', label: 'Chat puro',           desc: 'Widget de chat',                file: 'index-chat-b.html', weight: 0 },
];

const QUIZ = { key: 'quiz', label: 'Quiz passo-a-passo', desc: 'Funil em formato quiz', file: 'index-quiz-3.html', weight: 0 };

const client = new MongoClient(env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

async function main() {
  await client.connect();
  const db = client.db(env.MONGODB_DB ?? 'weby');
  const col = db.collection(COLLECTION);
  const doc = await col.findOne({ _id: DOC_ID });

  const variants = (Array.isArray(doc?.variants) && doc.variants.length)
    ? doc.variants.map(v => ({ ...v }))
    : DEFAULT_VARIANTS.map(v => ({ ...v }));

  const i = variants.findIndex(v => v.key === 'quiz');
  if (i >= 0) {
    variants[i] = { ...variants[i], label: QUIZ.label, desc: QUIZ.desc, file: QUIZ.file };
    console.log(`Variante "quiz" já existia — actualizada (peso mantido: ${variants[i].weight ?? 0}%).`);
  } else {
    variants.push({ ...QUIZ });
    console.log('Variante "quiz" adicionada com peso 0%.');
  }

  const total = variants.reduce((s, v) => s + (Number(v.weight) || 0), 0);
  if (total !== 100) console.warn(`AVISO: soma dos pesos = ${total}% (esperado 100). Ajuste no dashboard.`);

  await col.updateOne({ _id: DOC_ID }, { $set: { variants, updatedAt: new Date() } }, { upsert: true });

  console.log('\nVariantes registadas:');
  for (const v of variants) console.log(`  ${String(v.key).padEnd(6)} ${String(v.weight).padStart(3)}%  -> ${v.file}`);
  console.log('\nOK. Defina o peso da variante "quiz" no dashboard (Distribuição de Variantes) para lhe dar tráfego.');
}

main().catch(console.error).finally(() => client.close());
