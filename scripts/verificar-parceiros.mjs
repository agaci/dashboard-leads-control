import pkg from 'mongodb'; const { MongoClient, ObjectId } = pkg;
import fs from 'fs';

/**
 * A lista de parceiros e o formulario de registo, contra a base de dados a serio.
 *
 *   node --experimental-strip-types --import ./scripts/registar-loader.mjs scripts/verificar-parceiros.mjs
 *
 * **Escreve na base de dados.** Cria fichas com o prefixo `zzFase2` e apaga-as no fim,
 * incluindo capacidades e interaccoes. Nao toca em nada que ja la esteja. Precisa do
 * `.env.local`, que so existe nas maquinas onde ele foi posto a mao.
 *
 * Existe porque os testes de `npm test` cobrem a logica pura mas nao chegam a duas coisas
 * que so falham contra o Mongo: a juncao das capacidades pelo `partnerId` (texto de um
 * lado, ObjectId do outro — se partir, a lista mostra toda a gente sem servicos e sem
 * erro nenhum) e os campos novos sobreviverem a ida e volta.
 */
const env = fs.readFileSync('.env.local', 'utf8');
const c = await MongoClient.connect(env.match(/^MONGODB_URI=(.*)$/m)[1].trim());
const db = c.db('weby');

const falhas = [];
const ok = (n, cond, extra = '') => {
  console.log(`${cond ? ' ok  ' : 'FALHA'} ${n}${extra ? '  ' + extra : ''}`);
  if (!cond) falhas.push(n);
};

const { listarParceiros } = await import('@/lib/crm/listaParceiros.ts');
const { gravarRegisto, validarRespostas } = await import('@/lib/crm/registo.ts');
const { limparDimensao, limparViaturas } = await import('@/lib/crm/filtros.ts');

const MARCA = 'zzFase2';
const criados = [];
async function criar(p, caps = []) {
  const _id = new ObjectId();
  criados.push(_id);
  await db.collection('crm_partners').insertOne({
    _id, canaisPreferidos: [], deviceTokens: [], score: 50, leadsGratisRestantes: 0,
    createdAt: new Date(), updatedAt: new Date(), ...p,
  });
  for (const k of caps) {
    await db.collection('crm_capabilities').insertOne({
      partnerId: String(_id), zonas: [], maxWeightKg: null, maxDimensionCm: null,
      prioridade: 0, active: true, ...k,
    });
  }
  return String(_id);
}

// ── 1. os campos novos gravam e leem-se ──────────────────────────────────────
const grandeId = await criar(
  { nome: `${MARCA} Grande`, estado: 'ativo', zonas: ['porto'], dimensao: 'grande', viaturas: 42 },
  [{ categoria: 'mudancas' }],
);
await criar({ nome: `${MARCA} Sem resposta`, estado: 'ativo', zonas: ['porto'] }, [{ categoria: 'mudancas' }]);

const so = (r) => r.parceiros.filter((p) => p.nome.startsWith(MARCA));
const nomes = (r) => so(r).map((p) => p.nome.replace(MARCA + ' ', '')).sort();

let r = await listarParceiros(db, { q: MARCA });
const grande = so(r).find((p) => p.nome.endsWith('Grande'));
ok('dimensao e viaturas chegam a lista', grande?.dimensao === 'grande' && grande?.viaturas === 42,
   `dimensao=${grande?.dimensao} viaturas=${grande?.viaturas}`);

r = await listarParceiros(db, { q: MARCA, dimensoes: ['grande'] });
ok('o filtro por dimensao exclui quem nao respondeu', nomes(r).join() === 'Grande', nomes(r).join(' · '));

// ── 2. o formulario publico ──────────────────────────────────────────────────
ok('sem dimensao o formulario recusa', validarRespostas({
  nif: '501234567', responsavel: 'Ana', telefone: '912345678', emailLeads: 'a@b.pt',
  categorias: ['mudancas'], nacional: true,
}).ok === false);

ok('com dimensao o formulario aceita', validarRespostas({
  nif: '501234567', responsavel: 'Ana', telefone: '912345678', emailLeads: 'a@b.pt',
  categorias: ['mudancas'], nacional: true, dimensao: 'micro',
}).ok === true);

ok('um escalao inventado nao passa', validarRespostas({
  nif: '501234567', responsavel: 'Ana', telefone: '912345678', emailLeads: 'a@b.pt',
  categorias: ['mudancas'], nacional: true, dimensao: 'enorme',
}).ok === false);

const novoId = await criar({ nome: `${MARCA} Registo`, estado: 'prospect' });
const res = await gravarRegisto(db, novoId, {
  nif: '501234567', alvara: '', responsavel: 'Ana Silva', cargo: 'sócia',
  telefone: '912345678', emailLeads: 'ana@exemplo.pt',
  categorias: ['mudancas'], zonas: ['braga'], nacional: false,
  dimensao: 'pequena', viaturas: '6', notas: '',
});
ok('o registo grava', res.ok === true, res.erro ?? '');

const doc = await db.collection('crm_partners').findOne({ _id: new ObjectId(novoId) });
ok('o escalao do formulario fica na ficha', doc?.dimensao === 'pequena', String(doc?.dimensao));
ok('as viaturas vem como numero e nao texto', doc?.viaturas === 6, `${typeof doc?.viaturas} ${doc?.viaturas}`);
ok('o estado avancou para registado', doc?.estado === 'registado', String(doc?.estado));

const inter = await db.collection('crm_interaccoes')
  .find({ partnerId: String(novoId) }).toArray();
ok('a interaccao conta a dimensao', inter.some((i) => String(i.resumo ?? '').includes('6 a 20')),
   inter.map((i) => i.resumo).join(' | ').slice(0, 160));

// ── 3. o mapa nao encolhe com o filtro de zona ───────────────────────────────
const semFiltro = await listarParceiros(db, { q: MARCA });
const comZona = await listarParceiros(db, { q: MARCA, zonas: ['porto'] });
ok('o mapa ignora o filtro de zona', comZona.mapa.faro === semFiltro.mapa.faro,
   `faro ${comZona.mapa.faro} vs ${semFiltro.mapa.faro}`);
ok('mas a lista nao ignora', so(comZona).length < so(semFiltro).length,
   `${so(comZona).length} vs ${so(semFiltro).length}`);

// ── 4. o mapa cobre todos os distritos que o desenho conhece ─────────────────
const { DISTRITOS_MAPA } = await import('@/lib/crm/mapa-distritos.ts');
const semChave = DISTRITOS_MAPA.filter((d) => !(d.id in semFiltro.mapa));
ok('todo o distrito desenhado tem contagem', semChave.length === 0,
   semChave.map((d) => d.id).join(', '));
ok('as ilhas tambem', 'acores' in semFiltro.mapa && 'madeira' in semFiltro.mapa);

// ── 5. limpeza de valores de fora ────────────────────────────────────────────
ok('texto vazio nao vira zero viaturas', limparViaturas('') === undefined);
ok('um escalao em maiusculas normaliza', limparDimensao('GRANDE') === 'grande');

await db.collection('crm_partners').deleteMany({ _id: { $in: criados } });
await db.collection('crm_capabilities').deleteMany({ partnerId: { $in: criados.map(String) } });
await db.collection('crm_interaccoes').deleteMany({ partnerId: { $in: criados.map(String) } });
console.log(`\n${falhas.length ? 'FALHARAM: ' + falhas.join(' | ') : 'todos passaram'}`);
await c.close();
process.exit(falhas.length ? 1 : 0);
