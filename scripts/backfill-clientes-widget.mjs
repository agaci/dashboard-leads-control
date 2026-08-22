/**
 * Carimba nas fichas de cliente o parceiro que angariou a lead de origem.
 *
 *   node scripts/backfill-clientes-widget.mjs            # simulacao
 *   node scripts/backfill-clientes-widget.mjs --aplicar  # executa
 *
 * Necessário porque o botão "Converter para Cliente" (POST /api/clients) não copiava o
 * widgetClientId da lead — só o fluxo da Inbox o fazia. Os clientes criados por esse
 * caminho ficaram sem parceiro, e o contador "Clientes angariados" do portal não os via.
 *
 * Percorre cada ficha sem parceiro, olha as leads em `leadIds` e usa a MAIS ANTIGA que
 * tenha carimbo: a angariação pertence a quem trouxe o cliente primeiro.
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient } = pkg;
const aplicar = process.argv.includes('--aplicar');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const cli = new MongoClient(env.MONGODB_URI);
await cli.connect();
const db = cli.db(env.MONGODB_DB || 'weby');

const clientes = await db.collection('clients')
  .find({ companyProvider: 'Yourbox', widgetClientId: { $exists: false }, leadIds: { $exists: true, $ne: [] } })
  .toArray();

console.log(`\n${clientes.length} fichas de cliente sem parceiro, com leads associadas.\n`);

let encontrados = 0;
for (const c of clientes) {
  const leads = await db.collection('messages')
    .find({ _id: { $in: c.leadIds }, widgetClientId: { $exists: true, $ne: null } },
          { projection: { widgetClientId: 1, widgetClientName: 1, widgetRef: 1, timeStamp: 1 } })
    .sort({ timeStamp: 1 })
    .toArray();

  if (!leads.length) continue;
  const origem = leads[0];
  encontrados++;
  console.log(`  ${String(c.nome ?? '—').padEnd(28)} ${c.telefone ?? ''}  ->  ${origem.widgetClientName ?? origem.widgetClientId}`);

  if (aplicar) {
    await db.collection('clients').updateOne(
      { _id: c._id },
      {
        $set: {
          widgetClientId:   origem.widgetClientId,
          widgetClientName: origem.widgetClientName ?? null,
          widgetRef:        origem.widgetRef ?? null,
          updatedAt:        new Date(),
        },
      },
    );
  }
}

console.log(`\n${encontrados} fichas com parceiro identificado.`);
console.log(aplicar ? 'Aplicado.\n' : 'SIMULACAO — nada foi escrito. Repetir com --aplicar.\n');

await cli.close();
