/**
 * Criar utilizador administrador inicial
 * Uso: node scripts/create-admin.mjs
 */
import pkg from 'mongodb';
const { MongoClient } = pkg;
import { createHash } from 'crypto';

// bcryptjs não funciona em scripts ES module simples — usar hash manual para seed
// Em produção o login usa bcryptjs correctamente
// Para este script usar uma password temporária que o admin deve mudar

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB ?? 'weby';

if (!MONGODB_URI) {
  console.error('❌  Defina MONGODB_URI no ambiente');
  process.exit(1);
}

// Importar bcryptjs dinamicamente
const { hash } = await import('bcryptjs');

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);

const email    = 'admin@yourbox.pt';
const password = 'YourBox2024!';
const hashed   = await hash(password, 12);

const exists = await db.collection('dashboardUsers').findOne({ email });
if (exists) {
  console.log('ℹ️  Utilizador já existe:', email);
} else {
  await db.collection('dashboardUsers').insertOne({
    name:      'Administrator',
    email,
    password:  hashed,
    role:      'administrator',
    active:    true,
    createdAt: new Date(),
  });
  console.log('✅  Admin criado:');
  console.log('    Email:   ', email);
  console.log('    Password:', password);
  console.log('    ⚠️  Mude a password após o primeiro login!');
}

await client.close();
