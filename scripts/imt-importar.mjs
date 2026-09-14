import pkg from 'mongodb'; const { MongoClient } = pkg;
import fs from 'fs';

/**
 * Importa a lista do IMT para `imt_transportadoras`.
 *
 *   node --experimental-strip-types --import ./scripts/registar-loader.mjs \
 *        scripts/imt-importar.mjs imt.csv [--aplicar]
 *
 * Sem `--aplicar` só mostra o que faria. **Escreve na base de dados** quando se aplica.
 *
 * **Colecção à parte, e não `crm_partners`.** São 7858 empresas. Metê-las na lista de
 * parceiros saturava o mapa a cinzento em todos os distritos, tornava a lista densa
 * impossível de navegar, e fazia "parceiro" deixar de querer dizer alguma coisa. Isto é
 * uma pedreira: a angariação vai lá buscar uma empresa quando decide contactá-la, e é
 * nesse momento que ela passa a `crm_partners` como `prospect`.
 *
 * Repetível: a chave é o número de alvará, que é único e estável. Correr outra vez com um
 * PDF mais recente actualiza o que mudou e acrescenta o que é novo, sem duplicar nem
 * perder o que a angariação já anotou.
 */
const APLICAR = process.argv.includes('--aplicar');
const ficheiro = process.argv[2];
if (!ficheiro || ficheiro.startsWith('--')) {
  console.error('uso: node scripts/imt-importar.mjs <imt.csv> [--aplicar]');
  process.exit(1);
}

const env = fs.readFileSync('.env.local', 'utf8');
const c = await MongoClient.connect(env.match(/^MONGODB_URI=(.*)$/m)[1].trim());
const db = c.db('weby');

const { distritoDaMorada, distritoDoCodigoPostal } = await import('@/lib/crm/codigosPostais.ts');
const { DISTRITOS } = await import('@/lib/crm/zonas.ts');

// ── ler o CSV ────────────────────────────────────────────────────────────────
function campos(linha) {
  const out = [];
  let actual = '';
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (dentro && linha[i + 1] === '"') { actual += '"'; i++; }
      else dentro = !dentro;
    } else if (ch === ',' && !dentro) { out.push(actual); actual = ''; }
    else actual += ch;
  }
  out.push(actual);
  return out;
}

const linhas = fs.readFileSync(ficheiro, 'utf8').trim().split(/\r?\n/);
const cab = campos(linhas[0]);
const idx = Object.fromEntries(cab.map((n, i) => [n, i]));

const registos = [];
const conta = { comCP: 0, comLocalidade: 0, semDistrito: 0 };

for (const l of linhas.slice(1)) {
  const f = campos(l);
  const cp = f[idx.codigoPostal];
  const localidade = f[idx.localidade];

  // O código postal primeiro, que é exacto. Dos 7858, resolve 96,7% sozinho; os que
  // sobram caem em códigos que atravessam fronteiras de distrito, e aí vale a terra.
  let distrito = distritoDoCodigoPostal(cp);
  if (distrito) conta.comCP++;
  else {
    distrito = distritoDaMorada(`${localidade}`);
    if (distrito) conta.comLocalidade++;
    else conta.semDistrito++;
  }

  registos.push({
    alvara: f[idx.alvara],
    nome: f[idx.nome],
    morada: f[idx.morada],
    codigoPostal: cp,
    localidade,
    distrito: distrito ?? null,
    // Sinal grátis de dimensão: quem tem âmbito internacional é, em geral, maior. Não
    // decide nada — serve de ponto de partida para a ficha.
    internacional: f[idx.ambito] === 'NACIONAL/INTERNACIONAL',
    fonte: 'IMT',
  });
}

// ── o que se vai fazer ───────────────────────────────────────────────────────
const porDistrito = {};
for (const r of registos) {
  const d = r.distrito ?? '(sem distrito)';
  porDistrito[d] = (porDistrito[d] ?? 0) + 1;
}

console.log(`${registos.length} empresas no CSV`);
console.log(`  distrito pelo código postal   ${conta.comCP}`);
console.log(`  distrito pela localidade      ${conta.comLocalidade}`);
console.log(`  sem distrito                  ${conta.semDistrito}`);

const desconhecidos = new Set(
  registos.map((r) => r.distrito).filter((d) => d && !DISTRITOS.includes(d)),
);
if (desconhecidos.size) {
  console.error(`\nDISTRITOS QUE zonas.ts NAO CONHECE: ${[...desconhecidos].join(', ')}`);
  console.error('parado — importar assim punha empresas numa zona que ninguem declara');
  await c.close();
  process.exit(1);
}

console.log('\npor distrito:');
for (const [d, n] of Object.entries(porDistrito).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d.padEnd(18)} ${String(n).padStart(5)}`);
}

const alvaras = new Set(registos.map((r) => r.alvara));
if (alvaras.size !== registos.length) {
  console.error(`\nALVARAS REPETIDOS: ${registos.length - alvaras.size}`);
  console.error('parado — o alvara e a chave, e repetido faz um apagar o outro');
  await c.close();
  process.exit(1);
}

if (!APLICAR) {
  const jaLa = await db.collection('imt_transportadoras').countDocuments({}).catch(() => 0);
  console.log(`\nna base agora: ${jaLa}`);
  console.log('corra com --aplicar para gravar');
  await c.close();
  process.exit(0);
}

// ── gravar ───────────────────────────────────────────────────────────────────
const col = db.collection('imt_transportadoras');
await col.createIndex({ alvara: 1 }, { unique: true }).catch(() => {});
await col.createIndex({ distrito: 1 }).catch(() => {});
await col.createIndex({ nome: 1 }).catch(() => {});
// Para saber, de relance, quem ja foi promovido a parceiro.
await col.createIndex({ partnerId: 1 }, { sparse: true }).catch(() => {});

let novos = 0;
let mexidos = 0;
const agora = new Date();

for (const r of registos) {
  // `$set` no que vem do IMT e `$setOnInsert` no resto: uma segunda importacao actualiza
  // a morada e o ambito, e nao apaga o que a angariacao anotou entretanto.
  const res = await col.updateOne(
    { alvara: r.alvara },
    {
      $set: { ...r, actualizadoEm: agora },
      $setOnInsert: { criadoEm: agora, partnerId: null, notas: '' },
    },
    { upsert: true },
  );
  if (res.upsertedCount) novos++;
  else if (res.modifiedCount) mexidos++;
}

console.log(`\nnovos      ${novos}`);
console.log(`mexidos    ${mexidos}`);
console.log(`total      ${await col.countDocuments({})}`);

await c.close();
