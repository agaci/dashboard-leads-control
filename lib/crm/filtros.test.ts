import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarFiltros, categoriasDoParceiro, cobreZona, contarPorDistrito,
  ordenar, temComQueTrabalhar, zonasDoParceiro, type ParceiroListado,
  DIMENSOES, DIMENSAO_IDS, limparDimensao, limparViaturas,
} from './filtros.ts';

const parceiro = (extra: Record<string, unknown> = {}) => ({
  _id: String(Math.random()), nome: 'Empresa', estado: 'ativo',
  canaisPreferidos: [], deviceTokens: [], score: 50, leadsGratisRestantes: 0,
  createdAt: new Date(), updatedAt: new Date(), saldo: 100, ...extra,
}) as ParceiroListado['parceiro'];

const cap = (categoria: string, zonas: string[] = [], active = true) => ({
  _id: String(Math.random()), partnerId: 'x', categoria, zonas,
  maxWeightKg: null, maxDimensionCm: null, prioridade: 0, active,
}) as any;

const item = (p: Record<string, unknown>, caps: any[] = []): ParceiroListado =>
  ({ parceiro: parceiro(p), capacidades: caps });

// ── zonas, e a herança ───────────────────────────────────────────────────────

test('a capacidade sem zonas herda as do parceiro', () => {
  const z = zonasDoParceiro({ zonas: ['porto', 'braga'] }, [cap('mudancas')]);
  assert.deepEqual(z.sort(), ['braga', 'porto']);
});

test('a capacidade com zonas próprias ganha', () => {
  // Mudanças no país todo mas ADR só no Porto — o caso que justifica a herança ser
  // só um valor por omissão.
  const z = zonasDoParceiro({ zonas: ['lisboa'] }, [cap('adr', ['porto'])]);
  assert.deepEqual(z, ['porto']);
});

test('sem zonas em lado nenhum é nacional', () => {
  assert.deepEqual(zonasDoParceiro({ zonas: [] }, [cap('mudancas')]), ['nacional']);
  assert.deepEqual(zonasDoParceiro({}, []), ['nacional']);
});

test('sem capacidades activas vale o que a ficha declara', () => {
  // E o caso normal na angariacao: a ficha tem zonas muito antes de haver capacidades.
  const z = zonasDoParceiro({ zonas: ['faro'] }, [cap('mudancas', ['porto'], false)]);
  assert.deepEqual(z, ['faro']);
});

test('capacidade inactiva não conta para nada', () => {
  assert.deepEqual(categoriasDoParceiro([cap('adr', [], false), cap('mudancas')]), ['mudancas']);
});

test('nacional cobre qualquer distrito', () => {
  assert.equal(cobreZona(['nacional'], 'beja'), true);
  assert.equal(cobreZona(['porto'], 'beja'), false);
  assert.equal(cobreZona(['porto', 'beja'], 'beja'), true);
});

// ── filtros ──────────────────────────────────────────────────────────────────

test('a procura por texto ignora acentos e maiúsculas', () => {
  const itens = [item({ nome: 'Transportes Évora' }), item({ nome: 'Silva & Filhos' })];
  assert.equal(aplicarFiltros(itens, { q: 'evora' }).length, 1);
  assert.equal(aplicarFiltros(itens, { q: 'SILVA' }).length, 1);
});

test('a procura também apanha o NIF', () => {
  const itens = [item({ nome: 'A', nif: '501234567' }), item({ nome: 'B' })];
  assert.equal(aplicarFiltros(itens, { q: '5012' }).length, 1);
});

test('filtrar por zona conta com a herança', () => {
  const itens = [
    item({ nome: 'Regional', zonas: ['porto'] }, [cap('mudancas')]),
    item({ nome: 'Nacional', zonas: [] }, [cap('mudancas')]),
    item({ nome: 'Fora', zonas: ['faro'] }, [cap('mudancas')]),
  ];
  const r = aplicarFiltros(itens, { zonas: ['porto'] }).map((x) => x.parceiro.nome);
  // O nacional entra porque uma lead do Porto pode mesmo ir para ele.
  assert.deepEqual(r.sort(), ['Nacional', 'Regional']);
});

test('filtrar por serviço só vê capacidades activas', () => {
  const itens = [
    item({ nome: 'Faz' }, [cap('mudancas')]),
    item({ nome: 'Declarou mas está por activar' }, [cap('mudancas', [], false)]),
  ];
  assert.deepEqual(aplicarFiltros(itens, { categorias: ['mudancas'] }).map((x) => x.parceiro.nome), ['Faz']);
});

test('só activos deixa de fora quem não recebe leads', () => {
  const itens = [
    item({ nome: 'Activo', estado: 'ativo' }),
    item({ nome: 'Trial', estado: 'trial' }),
    item({ nome: 'Por contactar', estado: 'prospect' }),
    item({ nome: 'Suspenso', estado: 'suspenso' }),
  ];
  assert.deepEqual(aplicarFiltros(itens, { activos: true }).map((x) => x.parceiro.nome).sort(),
    ['Activo', 'Trial']);
});

test('as leads de trial contam como ter com que trabalhar', () => {
  assert.equal(temComQueTrabalhar(parceiro({ saldo: 0, leadsGratisRestantes: 5 })), true);
  assert.equal(temComQueTrabalhar(parceiro({ saldo: 0, leadsGratisRestantes: 0 })), false);
  assert.equal(temComQueTrabalhar(parceiro({ saldo: 12.5, leadsGratisRestantes: 0 })), true);
});

test('"parados na zona" devolve quem cobre mas não recebe', () => {
  // A lista de telefonemas que desbloqueia receita sem angariar ninguem.
  const itens = [
    item({ nome: 'A trabalhar', estado: 'ativo', saldo: 100, zonas: ['setubal'] }, [cap('mudancas')]),
    item({ nome: 'Sem saldo', estado: 'ativo', saldo: 0, zonas: ['setubal'] }, [cap('mudancas')]),
    item({ nome: 'Suspenso', estado: 'suspenso', saldo: 100, zonas: ['setubal'] }, [cap('mudancas')]),
    item({ nome: 'Noutra zona', estado: 'ativo', saldo: 0, zonas: ['faro'] }, [cap('mudancas')]),
  ];
  const r = aplicarFiltros(itens, { zonas: ['setubal'], paradosNaZona: true }).map((x) => x.parceiro.nome);
  assert.deepEqual(r.sort(), ['Sem saldo', 'Suspenso']);
});

test('os filtros somam-se, não se substituem', () => {
  const itens = [
    item({ nome: 'Certo', estado: 'ativo', dimensao: 'media', zonas: ['porto'] }, [cap('mudancas')]),
    item({ nome: 'Zona errada', estado: 'ativo', dimensao: 'media', zonas: ['faro'] }, [cap('mudancas')]),
    item({ nome: 'Pequeno', estado: 'ativo', dimensao: 'micro', zonas: ['porto'] }, [cap('mudancas')]),
    item({ nome: 'Outro serviço', estado: 'ativo', dimensao: 'media', zonas: ['porto'] }, [cap('adr')]),
  ];
  const r = aplicarFiltros(itens, { zonas: ['porto'], dimensoes: ['media'], categorias: ['mudancas'] });
  assert.deepEqual(r.map((x) => x.parceiro.nome), ['Certo']);
});

// ── ordenação ────────────────────────────────────────────────────────────────

test('por contacto, o mais esquecido vem primeiro', () => {
  // A fila de trabalho e de quem esta parado ha mais tempo, nao de quem se falou ontem.
  const itens = [
    item({ nome: 'Ontem', ultimoContactoEm: new Date() }),
    item({ nome: 'Nunca' }),
    item({ nome: 'Ha um mes', ultimoContactoEm: new Date(Date.now() - 30 * 864e5) }),
  ];
  assert.deepEqual(ordenar(itens, 'contacto').map((x) => x.parceiro.nome),
    ['Nunca', 'Ha um mes', 'Ontem']);
});

test('por nome respeita os acentos do português', () => {
  const itens = [item({ nome: 'Zeta' }), item({ nome: 'Água' }), item({ nome: 'Beta' })];
  assert.deepEqual(ordenar(itens, 'nome').map((x) => x.parceiro.nome), ['Água', 'Beta', 'Zeta']);
});

test('ordenar não mexe no original', () => {
  const itens = [item({ nome: 'B' }), item({ nome: 'A' })];
  ordenar(itens, 'nome');
  assert.equal(itens[0].parceiro.nome, 'B');
});

// ── o mapa ───────────────────────────────────────────────────────────────────

test('o nacional conta para todos os distritos', () => {
  const conta = contarPorDistrito(
    [item({ zonas: [] }, [cap('mudancas')])],
    ['porto', 'lisboa', 'faro'],
  );
  assert.deepEqual(conta, { porto: 1, lisboa: 1, faro: 1 });
});

test('o regional conta só onde cobre', () => {
  const conta = contarPorDistrito(
    [item({ zonas: ['porto', 'braga'] }, [cap('mudancas')])],
    ['porto', 'lisboa', 'braga'],
  );
  assert.deepEqual(conta, { porto: 1, lisboa: 0, braga: 1 });
});

test('todos os distritos aparecem, mesmo a zero', () => {
  // Um distrito ausente do resultado desapareceria do mapa; a zero, pinta-se de vazio —
  // que e precisamente a informacao que interessa.
  const conta = contarPorDistrito([], ['porto', 'beja']);
  assert.deepEqual(conta, { porto: 0, beja: 0 });
});

test('uma zona que não é distrito não estraga a contagem', () => {
  // As zonas aceitam concelhos escritos a mao; o mapa so conhece distritos.
  const conta = contarPorDistrito(
    [item({ zonas: ['amora', 'setubal'] }, [cap('mudancas')])],
    ['setubal', 'porto'],
  );
  assert.deepEqual(conta, { setubal: 1, porto: 0 });
});

// ── os campos novos, vindos de fora ──────────────────────────────────────────

test('a dimensao so aceita os escaloes conhecidos', () => {
  assert.equal(limparDimensao('media'), 'media');
  assert.equal(limparDimensao('MEDIA'), 'media');
  assert.equal(limparDimensao(' grande '), 'grande');
  assert.equal(limparDimensao('enorme'), undefined);
  assert.equal(limparDimensao(''), undefined);
  assert.equal(limparDimensao(null), undefined);
});

test('"nao disse" e diferente de "e pequena"', () => {
  // Devolver um valor por omissao punha toda a gente sem resposta no mesmo escalao, e
  // o filtro por dimensao passava a mentir sobre quem se sabe alguma coisa.
  assert.equal(limparDimensao(undefined), undefined);
  const itens = [item({ nome: 'Sem resposta' }), item({ nome: 'Media', dimensao: 'media' })];
  assert.deepEqual(aplicarFiltros(itens, { dimensoes: ['media'] }).map((x) => x.parceiro.nome), ['Media']);
});

test('as viaturas aceitam um inteiro nao negativo', () => {
  assert.equal(limparViaturas('7'), 7);
  assert.equal(limparViaturas(7.9), 7);
  assert.equal(limparViaturas(0), 0);
  assert.equal(limparViaturas(''), undefined);
  assert.equal(limparViaturas('nove'), undefined);
  assert.equal(limparViaturas(-3), undefined);
  // Um numero absurdo e erro de digitacao, nao uma frota.
  assert.equal(limparViaturas(100000), undefined);
});

test('os escaloes estao ordenados do menor para o maior', () => {
  // A ordenacao por dimensao depende desta ordem, e o formulario publico desenha-os
  // por ela: um escalao fora de sitio faz a lista "maior primeiro" mentir.
  assert.deepEqual(DIMENSOES.map((d) => d.id),
    ['individual', 'micro', 'pequena', 'media', 'grande']);
  assert.deepEqual(DIMENSAO_IDS, DIMENSOES.map((d) => d.id));
});

// ── as notas na procura ──────────────────────────────────────────────────────

test('a procura por texto olha para as notas', () => {
  // E o campo onde cabe o que nao tem coluna. Sem isto so se podia procurar por nome e
  // NIF — que e o que ja se sabe antes de procurar.
  const itens = [
    item({ nome: 'Silva', notas: 'duas carrinhas com plataforma elevatória, armazém em Alverca' }),
    item({ nome: 'Costa', notas: 'só carga seca' }),
  ];
  assert.deepEqual(aplicarFiltros(itens, { q: 'plataforma' }).map((x) => x.parceiro.nome), ['Silva']);
  assert.deepEqual(aplicarFiltros(itens, { q: 'alverca' }).map((x) => x.parceiro.nome), ['Silva']);
});

test('procurar nas notas ignora acentos, como no resto', () => {
  const itens = [item({ nome: 'A', notas: 'faz Lisboa–Porto e Évora' })];
  assert.equal(aplicarFiltros(itens, { q: 'evora' }).length, 1);
});

test('um parceiro sem notas nao rebenta a procura', () => {
  const itens = [item({ nome: 'Sem notas' })];
  assert.equal(aplicarFiltros(itens, { q: 'sem' }).length, 1);
  assert.equal(aplicarFiltros(itens, { q: 'plataforma' }).length, 0);
});
