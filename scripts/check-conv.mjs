import pkg from 'mongodb';
const { MongoClient } = pkg;
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

const client = new MongoClient(env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

async function main() {
  await client.connect();
  const db = client.db(env.MONGODB_DB ?? 'weby');

  // Últimas 5 conversas
  const convs = await db.collection('conversations')
    .find({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(5)
    .toArray();

  console.log(`\n=== Últimas ${convs.length} conversas ===\n`);
  for (const c of convs) {
    console.log(`Tel: ${c.telemovel} | Step: ${c.step} | Closed: ${c.closed}`);
    console.log(`  origem: ${c.data?.origem ?? 'N/A'} | destino: ${c.data?.destino ?? 'N/A'}`);
    console.log(`  aggHints: ${c.aggHints ? c.aggHints.length + ' hints' : 'AUSENTE'}`);
    console.log(`  aggHintsSeen: ${c.aggHintsSeen ?? 'AUSENTE'}`);
    console.log(`  aggHintsAt: ${c.aggHintsAt ?? 'AUSENTE'}`);
    console.log('');
  }

  // Verificar se existe índice ou campo no schema
  const sample = convs[0];
  if (sample) {
    console.log('Campos do documento mais recente:', Object.keys(sample).join(', '));
  }
}

main().catch(console.error).finally(() => client.close());
