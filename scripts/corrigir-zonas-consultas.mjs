import pkg from 'mongodb'; const { MongoClient } = pkg;
import fs from 'fs';

/**
 * Recalcula a zona das consultas antigas com a tabela dos códigos postais.
 *
 *   node --experimental-strip-types --import ./scripts/registar-loader.mjs \
 *        scripts/corrigir-zonas-consultas.mjs [--aplicar]
 *
 * Sem `--aplicar` só mostra. **Escreve na base de dados** quando se aplica.
 *
 * A zona de uma consulta foi calculada quando ela entrou, e as antigas ficaram com o que
 * `zonaDeMorada` sabia na altura: "amora", "cascais", "odivelas" — nomes que nenhum
 * parceiro declara. A correcção do código só vale para as que entram a partir de agora;
 * estas ficam para trás se ninguém lhes tocar.
 *
 * **Só mexe onde melhora.** Se a zona gravada já é um distrito, não se toca — mesmo que a
 * tabela diga outra coisa, porque pode ter sido uma operadora a corrigir à mão e isso vale
 * mais do que qualquer tabela.
 */
const APLICAR = process.argv.includes('--aplicar');

const env = fs.readFileSync('.env.local', 'utf8');
const c = await MongoClient.connect(env.match(/^MONGODB_URI=(.*)$/m)[1].trim());
const db = c.db('weby');

const { zonaDaMorada, DISTRITOS, ZONA_NACIONAL } = await import('@/lib/crm/zonas.ts');
const { distritoDaMorada } = await import('@/lib/crm/codigosPostais.ts');

const conhecida = (z) => DISTRITOS.includes(String(z ?? '')) || z === ZONA_NACIONAL;

const consultas = await db.collection('crm_consultas').find({}).toArray();
console.log(`${consultas.length} consultas\n`);

let porCorrigir = 0;
let jaBoas = 0;
let semRemedio = 0;

for (const d of consultas) {
  const origem = d.pedido?.origem ?? '';
  const actual = d.pedido?.zona ?? '';

  if (conhecida(actual)) { jaBoas++; continue; }

  const nova = zonaDaMorada(origem, distritoDaMorada);
  if (!nova || !conhecida(nova)) {
    semRemedio++;
    console.log(`  sem remédio  ${String(d._id).slice(-6)}  "${actual}"`);
    console.log(`               morada: ${JSON.stringify(origem)}\n`);
    continue;
  }

  porCorrigir++;
  console.log(`  ${APLICAR ? 'CORRIGIDA  ' : 'a corrigir '}  ${String(d._id).slice(-6)}  "${actual}"  ->  "${nova}"`);
  console.log(`               morada: ${JSON.stringify(origem)}\n`);

  if (APLICAR) {
    await db.collection('crm_consultas').updateOne(
      { _id: d._id },
      {
        $set: { 'pedido.zona': nova, updatedAt: new Date() },
        // Fica escrito no histórico: uma zona que muda sozinha, sem rasto, é uma zona em
        // que ninguém pode confiar daqui a três meses.
        $push: {
          history: {
            estado: d.estado,
            timestamp: new Date(),
            actor: 'sistema',
            motivo: `zona recalculada com a tabela de códigos postais: "${actual}" -> "${nova}"`,
          },
        },
      },
    );
  }
}

console.log(`já com distrito     ${jaBoas}`);
console.log(`${APLICAR ? 'corrigidas          ' : 'por corrigir        '}${porCorrigir}`);
console.log(`sem remédio         ${semRemedio}  (moradas sem terra nenhuma)`);
if (!APLICAR && porCorrigir) console.log('\ncorra com --aplicar para gravar');

await c.close();
