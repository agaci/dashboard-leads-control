/**
 * Teste local do alarme "Pede contacto".
 * Cria uma conversa de TESTE, calcula o token (mesmo segredo do .env.local) e dispara
 * o endpoint em localhost:3000 — para veres o banner + som + cartão + filtro a acender.
 *
 *   node scripts/test-contact.js            (canal: email)
 *   node scripts/test-contact.js whatsapp   (canal: whatsapp)
 *
 * Requisitos: `npm run dev` a correr (localhost:3000). Node 20 (o mesmo do dev).
 * Limpar depois:  node scripts/test-contact.js --clean
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

// ── ler .env.local ────────────────────────────────────────────────────────────
const env = {};
try {
  fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch { console.error('!! Não encontrei .env.local'); process.exit(1); }

const URI = env.MONGODB_URI;
const DB = env.MONGODB_DB || 'weby';
const SECRET = env.CONTACT_SECRET || env.CRON_SECRET || 'yb_contact_fallback';
const BASE = 'http://localhost:3000';

if (!URI) { console.error('!! MONGODB_URI em falta no .env.local'); process.exit(1); }

const arg = process.argv[2] || 'email';
const clean = arg === '--clean';
const ch = arg === 'whatsapp' ? 'whatsapp' : 'email';

function token(id) {
  return crypto.createHmac('sha256', SECRET).update(String(id)).digest('hex').slice(0, 16);
}
function hit(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res({ status: r.statusCode })); }).on('error', rej);
  });
}

(async () => {
  const client = await MongoClient.connect(URI, { useUnifiedTopology: true, useNewUrlParser: true });
  const col = client.db(DB).collection('conversations');

  if (clean) {
    const r = await col.deleteMany({ _test: true });
    console.log(`Limpo: ${r.deletedCount} conversa(s) de teste removida(s).`);
    await client.close();
    return;
  }

  const now = new Date();
  const ins = await col.insertOne({
    _test: true,
    canal: 'web-quiz',
    step: 'QUIZ_IN_PROGRESS',
    quizSessionId: 'test_' + Date.now(),
    telemovel: '914000000',
    createdAt: now,
    updatedAt: now,
    nudgeSentAt: now, // evita que o cron de reengajamento apanhe esta conversa de teste
    data: {
      nome: 'TESTE — Pede Contacto',
      telefone: '914000000',
      email: 'teste@exemplo.pt',
      origem: 'Lisboa, Portugal',
      destino: 'Porto, Portugal',
    },
  });

  const id = ins.insertedId.toString();
  const url = `${BASE}/api/contact-request?c=${id}&t=${token(id)}&ch=${ch}`;

  console.log('\nConversa de teste criada:', id, `(canal: ${ch})`);
  console.log('A disparar o pedido de contacto...');
  try {
    const r = await hit(url);
    console.log('Endpoint respondeu:', r.status);
    console.log('\n>> Vê o dashboard (localhost:3000): banner vermelho a pulsar + som,');
    console.log('   cartão realçado no inbox e o chip "Pede contacto" a piscar.');
    console.log('   Carrega em "Atendido" para desligar.');
  } catch (e) {
    console.error('Falha ao chamar o endpoint (o `npm run dev` está a correr?):', e.message);
    console.log('Podes abrir manualmente no browser:\n', url);
  }
  console.log('\nLimpar no fim:  node scripts/test-contact.js --clean\n');
  await client.close();
})().catch((e) => { console.error(e); process.exit(1); });
