/**
 * Estado do replica set do MongoDB (leitura apenas).
 *
 *   node scripts/mongo-topologia.mjs
 *
 * Útil quando aparece "not master and slaveOk=false": significa que a ligação está a
 * falar com um nó secundário. Isto mostra quem é o primário e que nós existem, para
 * corrigir o MONGODB_URI.
 */
import pkg from 'mongodb';
import fs from 'fs';

const { MongoClient } = pkg;

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

console.log('URI configurada:', String(env.MONGODB_URI || '').replace(/\/\/[^@]*@/, '//***@'));

const cli = new MongoClient(env.MONGODB_URI, { useUnifiedTopology: true });
await cli.connect();

// isMaster responde mesmo num secundario
const im = await cli.db('admin').command({ isMaster: 1 });

console.log('\n=== estado do no a que estamos ligados ===');
console.log('  e primario ......', im.ismaster === true);
console.log('  e secundario ....', im.secondary === true);
console.log('  nome do no ......', im.me ?? '(nao reportado)');
console.log('  replica set .....', im.setName ?? '(sem replica set)');
console.log('  PRIMARIO actual .', im.primary ?? '(desconhecido)');
console.log('  nos do conjunto .', Array.isArray(im.hosts) ? im.hosts.join(', ') : '(nao reportado)');

if (im.setName && !String(env.MONGODB_URI).includes('replicaSet=')) {
  console.log('\n  AVISO: ha replica set mas a URI nao tem replicaSet=' + im.setName);
  console.log('  Com ligacao directa a um no, se esse no deixar de ser primario tudo falha.');
  console.log('  A URI devia listar os nos e incluir ?replicaSet=' + im.setName);
}

await cli.close();
