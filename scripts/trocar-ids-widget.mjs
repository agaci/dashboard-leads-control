/**
 * Troca os clientId entre dois widgets, para acertar o registo com o código de embed
 * que já está instalado no site do parceiro — quando é mais fácil mudar de nosso lado
 * do que pedir ao cliente para editar o site.
 *
 *   node scripts/trocar-ids-widget.mjs <idA> <idB>            # simulacao (nao escreve)
 *   node scripts/trocar-ids-widget.mjs <idA> <idB> --aplicar  # executa
 *
 * A troca é feita em três passos (id temporário pelo meio) para nunca haver dois
 * registos com o mesmo clientId. Depois acerta o `widgetClientName` gravado no
 * histórico — conversas, leads e fichas de cliente — para o nome ficar coerente com o
 * widget a que o id passa a pertencer.
 *
 * Fica registo em `widgetIdSwapLog`. Para reverter, correr de novo com os ids trocados.
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient } = pkg;

const [idA, idB] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const aplicar = process.argv.includes('--aplicar');

if (!idA || !idB) {
  console.error('Uso: node scripts/trocar-ids-widget.mjs <idA> <idB> [--aplicar]');
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const cli = new MongoClient(env.MONGODB_URI);
await cli.connect();
const db = cli.db(env.MONGODB_DB || 'weby');
const W = db.collection('widgetClients');

const a = await W.findOne({ clientId: idA });
const b = await W.findOne({ clientId: idB });
if (!a) { console.error(`Widget com clientId ${idA} nao existe.`); process.exit(1); }
if (!b) { console.error(`Widget com clientId ${idB} nao existe.`); process.exit(1); }

const contar = async (col, id) => db.collection(col).countDocuments({ widgetClientId: id });

console.log('\n=== TROCA DE IDS ENTRE WIDGETS ===\n');
console.log(`  "${a.name}"  ${idA}  ->  ${idB}`);
console.log(`  "${b.name}"  ${idB}  ->  ${idA}`);

console.log('\n  Historico afectado (o id fica, o nome gravado passa a ser o do novo dono):');
for (const [id, novoDono] of [[idA, b.name], [idB, a.name]]) {
  const convs = await contar('conversations', id);
  const leads = await contar('messages', id);
  const clientes = await contar('clients', id);
  console.log(`    id ${id}  ->  "${novoDono}"   ${convs} conversas, ${leads} leads, ${clientes} clientes`);
}

if (!aplicar) {
  console.log('\n  SIMULACAO — nada foi escrito. Repetir com --aplicar para executar.\n');
  await cli.close();
  process.exit(0);
}

const now = new Date();
const tmp = '__tmp_' + Math.random().toString(36).slice(2, 10);

// 1) Trocar os ids nos registos dos widgets (id temporario pelo meio)
await W.updateOne({ _id: a._id }, { $set: { clientId: tmp, updatedAt: now } });
await W.updateOne({ _id: b._id }, { $set: { clientId: idA, updatedAt: now } });
await W.updateOne({ _id: a._id }, { $set: { clientId: idB, updatedAt: now } });
console.log('\n  ids trocados nos widgets.');

// 2) Acertar o nome gravado no historico: quem tem idA passa a ser o widget b, e vice-versa
for (const [id, nome] of [[idA, b.name], [idB, a.name]]) {
  for (const col of ['conversations', 'messages', 'clients']) {
    const r = await db.collection(col).updateMany(
      { widgetClientId: id },
      { $set: { widgetClientName: nome } },
    );
    if (r.matchedCount) console.log(`  ${col}: ${r.modifiedCount}/${r.matchedCount} com id ${id} passam a "${nome}"`);
  }
  // modo assistente guarda o carimbo dentro de data.*
  const rBot = await db.collection('conversations').updateMany(
    { 'data.widgetClientId': id },
    { $set: { 'data.widgetClientName': nome } },
  );
  if (rBot.matchedCount) console.log(`  conversations(data.*): ${rBot.modifiedCount} com id ${id} passam a "${nome}"`);
}

// 3) Auditoria
await db.collection('widgetIdSwapLog').insertOne({
  at: now,
  action: 'swap-client-ids',
  from: { name: a.name, clientId: idA },
  to: { name: b.name, clientId: idB },
  motivo: 'acertar o registo com o codigo de embed ja instalado no site do parceiro',
});

console.log('\n  Feito. Registo em widgetIdSwapLog.');
console.log('  Nota: a cache de widgets do servidor tem 60s — pode demorar ate um minuto a reflectir.\n');

await cli.close();
