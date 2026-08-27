/**
 * Copia dimensoes e peso por volume das conversas para as leads que ficaram sem eles.
 *
 *   node scripts/recuperar-dimensoes.mjs [dias]            # simulacao (default 30 dias)
 *   node scripts/recuperar-dimensoes.mjs 30 --aplicar      # executa
 *
 * O quiz recolhe comprimento/largura/altura e o peso por volume, mas ate 26/08/2026 esses
 * campos nao passavam da conversa para a lead: a "Mensagem sistema" mostrava so volumes,
 * peso total, material e embalagem. Os dados nunca se perderam — ficaram na conversa.
 *
 * So preenche o que estiver em falta na lead; nao sobrepoe nada.
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient, ObjectId } = pkg;
const aplicar = process.argv.includes('--aplicar');
const dias = Number(process.argv.find((a) => /^\d+$/.test(a)) || 30);

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const cli = new MongoClient(env.MONGODB_URI);
await cli.connect();
const db = cli.db(env.MONGODB_DB || 'weby');

const desde = new Date(Date.now() - dias * 864e5);
const convs = await db.collection('conversations')
  .find(
    { leadId: { $exists: true, $ne: null }, createdAt: { $gte: desde } },
    { projection: { leadId: 1, 'data.comprimento': 1, 'data.largura': 1, 'data.altura': 1, 'data.peso': 1, 'data.volumes': 1, 'data.nome': 1 } },
  ).toArray();

console.log(`conversas com lead nos ultimos ${dias} dias: ${convs.length}\n`);

let acertadas = 0;
for (const c of convs) {
  const d = c.data ?? {};
  if (!d.comprimento || !d.largura || !d.altura) continue;   // nada a copiar

  let lead;
  try { lead = await db.collection('messages').findOne({ _id: new ObjectId(String(c.leadId)) }, { projection: { leadData: 1 } }); }
  catch { continue; }
  if (!lead) continue;

  const ld = lead.leadData ?? {};
  if (ld.dimensoes) continue;   // ja tem

  const dimensoes = `${d.comprimento}x${d.largura}x${d.altura} cm (por volume)`;
  const set = {
    'leadData.comprimento': d.comprimento,
    'leadData.largura': d.largura,
    'leadData.altura': d.altura,
    'leadData.dimensoes': dimensoes,
  };
  if (d.peso && ld.pesoPorVolume == null) set['leadData.pesoPorVolume'] = d.peso;

  acertadas++;
  console.log(`  ${String(d.nome ?? '—').padEnd(26)} ${dimensoes}${d.peso ? ` · ${d.peso} kg/volume` : ''}`);

  if (aplicar) await db.collection('messages').updateOne({ _id: new ObjectId(String(c.leadId)) }, { $set: set });
}

console.log(`\n${acertadas} leads a recuperar.`);
console.log(aplicar ? 'Aplicado.\n' : 'SIMULACAO — nada foi escrito. Repetir com --aplicar.\n');

await cli.close();
