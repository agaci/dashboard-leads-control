import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transicao, proximosEstados, podeReceberLeads, podeReceberAngariacao,
  emailParaLeads, emailsConhecidos, ESTADOS_PARCEIRO,
} from './angariacao.ts';

test('só trial e ativo recebem leads', () => {
  // A regressão que isto trava: antes de existirem estados de funil, o
  // `procurarParceiros()` só excluía `suspenso` — e um prospecto com capacidades
  // declaradas podia receber uma lead paga antes de alguém falar com ele.
  assert.equal(podeReceberLeads('trial'), true);
  assert.equal(podeReceberLeads('ativo'), true);
  for (const e of ['prospect', 'contactado', 'registado', 'em_avaliacao', 'suspenso', 'descartado', 'opos_se']) {
    assert.equal(podeReceberLeads(e), false, e);
  }
  assert.equal(podeReceberLeads(undefined), false);
});

test('a angariação pára em opos_se e só aí', () => {
  assert.equal(podeReceberAngariacao({ estado: 'opos_se' }), false);
  assert.equal(podeReceberAngariacao({ estado: 'descartado' }), true);
  assert.equal(podeReceberAngariacao({ estado: 'prospect' }), true);
});

test('o caminho normal do funil anda todo', () => {
  const passos: [string, string][] = [
    ['prospect', 'contactado'], ['contactado', 'registado'],
    ['registado', 'em_avaliacao'], ['em_avaliacao', 'trial'], ['trial', 'ativo'],
  ];
  for (const [de, para] of passos) {
    assert.equal(transicao(de, para, 'Ana', 'motivo suficiente').ok, true, `${de} -> ${para}`);
  }
});

test('salta-se para a frente quando a empresa se regista sozinha', () => {
  // Formulário público preenchido sem ninguém ter ligado. Obrigar a passar por
  // "contactado" seria obrigar a mentir no histórico.
  assert.equal(transicao('prospect', 'registado', 'sistema', 'preencheu o formulário').ok, true);
});

test('não se salta para trial sem avaliação', () => {
  const r = transicao('prospect', 'trial', 'Ana', 'parece boa gente');
  assert.equal(r.ok, false);
  assert.match(r.erro!, /não se passa/);
});

test('opos_se não tem saída', () => {
  assert.deepEqual(proximosEstados('opos_se'), []);
  assert.equal(transicao('opos_se', 'prospect', 'Ana', 'mudaram de ideias').ok, false);
});

test('descartado volta atrás — o contexto muda', () => {
  // Descartado por não cobrir uma zona onde agora há procura, por exemplo.
  assert.equal(transicao('descartado', 'contactado', 'Ana', 'abriu delegação em Faro').ok, true);
});

test('nada muda de estado sem motivo', () => {
  assert.equal(transicao('prospect', 'contactado', 'Ana', '').ok, false);
  assert.equal(transicao('prospect', 'contactado', 'Ana', 'ok').ok, false);
  assert.equal(transicao('prospect', 'contactado', 'Ana', 'liguei').ok, true);
});

test('sair do funil exige um motivo explícito', () => {
  // Um "não" de cinco letras é indistinguível de um engano daqui a seis meses.
  assert.equal(transicao('prospect', 'descartado', 'Ana', 'nao').ok, false);
  assert.equal(transicao('prospect', 'descartado', 'Ana', 'nada').ok, false);
  assert.equal(transicao('prospect', 'descartado', 'Ana', 'nao serve').ok, true);
  // Um motivo curto continua a chegar para as transições normais do funil.
  assert.equal(transicao('prospect', 'contactado', 'Ana', 'liguei').ok, true);
});

test('a transição devolve o estado e o histórico juntos', () => {
  // Juntos de propósito: não há caminho em que um se grave sem o outro.
  const r = transicao('prospect', 'contactado', 'Ana', 'primeira chamada, ficou de ver');
  assert.equal(r.estado, 'contactado');
  assert.equal(r.entrada?.actor, 'Ana');
  assert.equal(r.entrada?.estado, 'contactado');
  assert.equal(r.entrada?.motivo, 'primeira chamada, ficou de ver');
});

test('estado desconhecido não passa', () => {
  assert.equal(transicao('prospect', 'inventado', 'Ana', 'motivo suficiente').ok, false);
  assert.equal(transicao('lixo', 'contactado', 'Ana', 'motivo suficiente').ok, true); // cai em prospect
});

test('todos os estados sabem para onde podem ir', () => {
  for (const e of ESTADOS_PARCEIRO) assert.ok(Array.isArray(proximosEstados(e)), e);
});

test('as leads vão para quem foi marcado, não para o primeiro email', () => {
  // O caso real: geral@ para angariação, operacoes@ para leads. Sem a marca, tudo caía
  // no primeiro, onde ninguém age.
  assert.equal(emailParaLeads({
    email: 'geral@empresa.pt',
    contactos: [
      { nome: 'Rita', email: 'rita@empresa.pt' },
      { nome: 'Operações', email: 'operacoes@empresa.pt', recebeLeads: true },
    ],
  }), 'operacoes@empresa.pt');
});

test('sem contacto marcado vale o email da ficha', () => {
  assert.equal(emailParaLeads({ email: 'geral@empresa.pt', contactos: [] }), 'geral@empresa.pt');
  assert.equal(emailParaLeads({ email: 'geral@empresa.pt' }), 'geral@empresa.pt');
  assert.equal(emailParaLeads({ contactos: [{ nome: 'Rita' }] }), undefined);
});

test('um contacto marcado sem email não rouba o lugar ao que existe', () => {
  assert.equal(emailParaLeads({
    email: 'geral@empresa.pt',
    contactos: [{ nome: 'Rita', recebeLeads: true }],
  }), 'geral@empresa.pt');
});

test('os endereços conhecidos servem o reenvio, sem repetidos', () => {
  assert.deepEqual(emailsConhecidos({
    email: 'Geral@Empresa.pt',
    contactos: [
      { nome: 'Rita', email: 'rita@empresa.pt' },
      { nome: 'Rita outra vez', email: 'RITA@empresa.pt' },
      { nome: 'Sem email' },
    ],
  }), ['rita@empresa.pt', 'geral@empresa.pt']);
});
