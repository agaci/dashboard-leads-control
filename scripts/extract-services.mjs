// Script: extrai serviços Yourbox com pontos geo para testar agregação
// Uso: node scripts/extract-services.mjs
import pkg from 'mongodb';
const { MongoClient } = pkg;
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env.local');

// Ler .env.local manualmente
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const MONGODB_URI = env.MONGODB_URI;
const MONGODB_DB  = env.MONGODB_DB ?? 'weby';

if (!MONGODB_URI) {
  console.error('MONGODB_URI não encontrado em .env.local');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

async function main() {
  await client.connect();
  const db = client.db(MONGODB_DB);

  const services = await db.collection('services').find({
    companyProvider: 'Yourbox',
    status: { $in: ['pending', 'assigned', 'accepted'] },
  }).limit(50).toArray();

  console.log(`\n=== Serviços Yourbox (pending/assigned/accepted): ${services.length} ===\n`);

  const valid = [];

  for (const svc of services) {
    const pts = svc.points ?? [];
    const col = pts.find(p => p.collectionOrDelivery === 'collection' && p.data?.lat);
    const del = pts.filter(p => p.collectionOrDelivery === 'delivery' && p.data?.lat).at(-1);

    if (!col || !del) {
      console.log(`[${svc._id}] status=${svc.status} — SEM coordenadas nos points\n`);
      continue;
    }

    const dataHour = svc.parameters?.dataHour
      ? new Date(svc.parameters.dataHour).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })
      : 'N/A';

    const driver = svc.driver?.driver ?? svc.driver ?? null;
    const driverName = driver?.name ?? 'sem motorista';

    const entry = {
      id:         svc._id.toString(),
      status:     svc.status,
      dataHour,
      type:       svc.parameters?.type ?? '?',
      pickup: {
        addr: col.addressLocal ?? '(sem morada)',
        lat:  col.data.lat,
        lng:  col.data.lng,
      },
      delivery: {
        addr: del.addressLocal ?? '(sem morada)',
        lat:  del.data.lat,
        lng:  del.data.lng,
      },
      driver: driverName,
    };
    valid.push(entry);

    console.log(`ID: ${entry.id}`);
    console.log(`  Status:   ${entry.status}  |  Hora: ${entry.dataHour}  |  Tipo: ${entry.type}`);
    console.log(`  Recolha:  ${entry.pickup.addr}`);
    console.log(`            lat=${entry.pickup.lat}, lng=${entry.pickup.lng}`);
    console.log(`  Entrega:  ${entry.delivery.addr}`);
    console.log(`            lat=${entry.delivery.lat}, lng=${entry.delivery.lng}`);
    console.log(`  Motorista: ${entry.driver}`);
    console.log('');
  }

  if (valid.length === 0) {
    console.log('Nenhum serviço com coordenadas encontrado.');
    return;
  }

  // Sugestão de pares de teste (origem/destino para a lead)
  console.log('\n=== SUGESTÕES DE TESTE PARA AGGREGAÇÃO ===\n');
  for (const svc of valid.slice(0, 5)) {
    const { pickup, delivery } = svc;
    // Sentido directo: lead vai no mesmo sentido — usar mesmas moradas
    console.log(`Serviço ${svc.id.slice(-6)} [${svc.dataHour}]`);
    console.log(`  DIRECTO  → origem="${pickup.addr}", destino="${delivery.addr}"`);
    console.log(`  INVERTIDO → origem="${delivery.addr}", destino="${pickup.addr}"`);
    console.log('');
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => client.close());
