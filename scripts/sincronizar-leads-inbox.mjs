/**
 * Actualiza leads criadas a partir da inbox com os dados que o visitante preencheu
 * depois — quando a lead foi criada com o pedido a meio e o quiz só terminou a seguir.
 *
 *   node scripts/sincronizar-leads-inbox.mjs            # simulacao
 *   node scripts/sincronizar-leads-inbox.mjs --aplicar  # executa
 *
 * A partir do deploy de 22/08/2026 isto passa a acontecer sozinho no quiz-progress; o
 * script serve para o historico anterior, e como rede de seguranca.
 *
 * So preenche campos VAZIOS na lead: nunca sobrepoe o que a operadora ja la tenha posto.
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient, ObjectId } = pkg;
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

// Conversas que deram origem a uma lead
const convs = await db.collection('conversations')
  .find({ leadId: { $exists: true, $ne: null } }, { projection: { data: 1, leadId: 1, createdAt: 1 } })
  .toArray();

const urMap = { 'Imediata': '1 Hora', 'Proprio dia': '4 Horas', 'Próprio dia': '4 Horas', '24H': '24 Horas' };
let acertadas = 0;

for (const c of convs) {
  let lead;
  try { lead = await db.collection('messages').findOne({ _id: new ObjectId(String(c.leadId)) }); }
  catch { continue; }
  if (!lead) continue;

  const d = c.data ?? {};
  const ld = lead.leadData ?? {};
  const totalKg = (Number(d.volumes) || 0) * (Number(d.peso) || 0) || null;
  const maxDim = Math.max(Number(d.comprimento) || 0, Number(d.largura) || 0, Number(d.altura) || 0);
  const viatura = totalKg && totalKg <= 2 && maxDim <= 60 ? 'Moto'
    : totalKg && totalKg <= 150 ? 'Furgão Classe 1'
    : totalKg ? 'Furgão Classe 2' : null;

  const candidatos = {
    nome:     d.nome,
    email:    d.email,
    telefone: String(d.telefone ?? '').replace(/\D/g, '') || null,
    origem:   d.origem,
    destino:  d.destino,
    urgencia: urMap[d.urgencia] ?? d.urgencia,
    volumes:  d.volumes,
    material: d.material,
    embalado: d.embalado,
    weightKg: totalKg,
    viatura,
  };

  const set = {};
  for (const [k, v] of Object.entries(candidatos)) {
    const actual = ld[k];
    const vazio = actual === undefined || actual === null || actual === '';
    if (vazio && v !== undefined && v !== null && v !== '') set[`leadData.${k}`] = v;
  }
  if (!Object.keys(set).length) continue;

  acertadas++;
  console.log(`  ${String(ld.nome ?? d.nome ?? '—').padEnd(22)} lead ${c.leadId}`);
  console.log(`     a preencher: ${Object.keys(set).map((k) => k.replace('leadData.', '')).join(', ')}`);

  if (aplicar) {
    set['leadData.updatedAt'] = new Date();
    await db.collection('messages').updateOne({ _id: new ObjectId(String(c.leadId)) }, { $set: set });
  }
}

console.log(`\n${acertadas} leads com campos por preencher.`);
console.log(aplicar ? 'Aplicado.\n' : 'SIMULACAO — nada foi escrito. Repetir com --aplicar.\n');

await cli.close();
