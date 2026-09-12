import pkg from 'mongodb'; const { MongoClient } = pkg;
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const c = await MongoClient.connect(env.match(/^MONGODB_URI=(.*)$/m)[1].trim());
const db = c.db('weby');
const { zonasDoParceiro } = await import('@/lib/crm/filtros.ts');
const APLICAR = process.argv.includes('--aplicar');

/**
 * Capacidades presas a ['nacional'] de quando vazio queria dizer nacional.
 * So mexe onde a ficha do parceiro tem zonas: se a ficha nao tem, nacional e o que
 * sai na mesma e nao ha nada a corrigir.
 */
const presas = await db.collection('crm_capabilities')
  .find({ zonas: ['nacional'] }).toArray();

console.log(`${presas.length} capacidade(s) com zonas=['nacional']\n`);
let mexer = 0;
for (const k of presas) {
  const p = await db.collection('crm_partners').findOne({ _id: new (await import('mongodb')).ObjectId(k.partnerId) }).catch(() => null);
  const fichaTem = (p?.zonas ?? []).length > 0;
  const antes = p ? zonasDoParceiro(p, [k]) : [];
  const depois = p ? zonasDoParceiro(p, [{ ...k, zonas: [] }]) : [];
  console.log(`${p?.nome ?? '(sem parceiro)'} · ${k.categoria}`);
  console.log(`   ficha: ${JSON.stringify(p?.zonas ?? [])}`);
  console.log(`   efectivas agora: ${JSON.stringify(antes)}  ->  depois: ${JSON.stringify(depois)}`);
  if (!fichaTem) { console.log('   sem zonas na ficha: nao muda nada, deixa-se como esta\n'); continue; }
  mexer++;
  if (APLICAR) {
    await db.collection('crm_capabilities').updateOne({ _id: k._id },
      { $set: { zonas: [], updatedAt: new Date() } });
    console.log('   CORRIGIDA\n');
  } else {
    console.log('   a corrigir (corra com --aplicar)\n');
  }
}
console.log(APLICAR ? `${mexer} corrigida(s)` : `${mexer} por corrigir`);
await c.close();
