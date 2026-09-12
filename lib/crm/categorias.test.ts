// Testes da triagem automática.
//
// É aqui que se decide se uma lead vai para a operação própria ou para venda a um
// terceiro. Um falso positivo manda para fora uma lead que a YourBox sabia servir; um
// falso negativo prende na operação uma carga que ela não consegue transportar. Nenhum
// dos dois se vê no dia, e ambos se pagam.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  triar, normalizar, LIMITES_FALLBACK, respostasVagas, LIMIAR_VAGAS,
} from './categorias.ts';

test('sem sinal nenhum a lead fica na operação própria', () => {
  const r = triar({ origem: 'Lisboa', destino: 'Porto', urgencia: '1 Hora' });
  assert.equal(r.route, 'subcontract');
  assert.equal(r.categoria, 'expresso');
});

test('urgência de 24h separa o arrasto do expresso', () => {
  const r = triar({ urgencia: '24 Horas' });
  assert.equal(r.categoria, 'arrasto');
  assert.equal(r.route, 'subcontract');
});

test('acentos e maiúsculas não escapam à triagem', () => {
  assert.equal(normalizar('MUDANÇAS'), 'mudancas');
  const comAcento = triar({ observacoes: 'preciso de MUDANÇAS de casa' });
  const semAcento = triar({ observacoes: 'preciso de mudancas de casa' });
  assert.equal(comAcento.categoria, 'mudancas');
  assert.equal(semAcento.categoria, 'mudancas');
});

test('mercadoria perigosa vai para venda de lead', () => {
  const r = triar({ observacoes: 'transporte de mercadorias perigosas, classe 3' });
  assert.equal(r.categoria, 'adr');
  assert.equal(r.route, 'lead_sale');
  assert.equal(r.confianca, 'alta');
});

test('cadeia de frio é reconhecida', () => {
  const r = triar({ observacoes: 'material que tem de ir refrigerado' });
  assert.equal(r.categoria, 'temperatura');
  assert.equal(r.route, 'lead_sale');
});

test('transporte de viatura avariada é lead de viaturas', () => {
  const r = triar({ observacoes: 'tenho um carro avariado que preciso de levar para a oficina' });
  assert.equal(r.categoria, 'viaturas');
  assert.equal(r.route, 'lead_sale');
});

test('peso acima do limite de tabela é sobrepeso, sem precisar de palavras', () => {
  const r = triar({ weightKg: 400 }, LIMITES_FALLBACK);
  assert.equal(r.categoria, 'sobrepeso');
  assert.equal(r.route, 'lead_sale');
  assert.match(r.motivo, /400 kg/);
});

test('peso dentro do limite não desvia nada', () => {
  const r = triar({ weightKg: 120 }, LIMITES_FALLBACK);
  assert.equal(r.route, 'subcontract');
});

test('dimensão acima do limite é fora de gabarito', () => {
  const r = triar({ totalCm: 420 }, LIMITES_FALLBACK);
  assert.equal(r.categoria, 'fora_gabarito');
});

test('os limites vêm de fora — uma tabela mais generosa muda a decisão', () => {
  const generosa = triar({ weightKg: 400 }, { maxKg: 1000, maxCm: 600 });
  assert.equal(generosa.route, 'subcontract');
});

test('duas categorias fortes e diferentes baixam a confiança em vez de escolher às cegas', () => {
  // Uma mudança que leva material inflamável não vai para o mesmo parceiro que uma
  // mudança normal. Quem decide isto é uma pessoa.
  const r = triar({ observacoes: 'mudancas de casa, incluindo material inflamavel' });
  assert.equal(r.confianca, 'baixa');
  assert.ok(r.candidatas.length >= 2);
});

test('sinal fraco classifica mas assume que pode estar errado', () => {
  const r = triar({ observacoes: 'levar umas paletes' });
  assert.equal(r.categoria, 'sobrepeso');
  assert.equal(r.confianca, 'media');
});

test('a categoria mais especializada ganha à menos especializada', () => {
  // ADR antes de sobrepeso: quem transporta perigoso é um universo mais pequeno.
  const r = triar({ observacoes: 'material radioativo', weightKg: 900 }, LIMITES_FALLBACK);
  assert.equal(r.categoria, 'adr');
});

test('o motivo explica sempre a decisão — é o que fica no histórico', () => {
  for (const sinais of [{}, { weightKg: 900 }, { observacoes: 'adr' }, { urgencia: '24 Horas' }]) {
    const r = triar(sinais, LIMITES_FALLBACK);
    assert.ok(r.motivo.trim().length > 0, `sem motivo para ${JSON.stringify(sinais)}`);
  }
});

test('peso a zero ou ausente não conta como carga leve nem pesada', () => {
  assert.equal(triar({ weightKg: 0 }).route, 'subcontract');
  assert.equal(triar({ weightKg: null }).route, 'subcontract');
});

// ── escolher da lista dos serviveis e a resposta ─────────────────────────────

test('pecas de automovel sao carga normal, nao transporte de viatura', () => {
  // A regressao: uma regra de texto puxava "pecas automoveis" para `viaturas` e a lead
  // saia da operacao propria — vendida a um parceiro de reboques. O menu tem "Viatura
  // (carro, mota, atrelado)" como opcao a parte: quem escolhe pecas ja recusou essa.
  const r = triar({ material: 'Pecas automoveis' });
  assert.equal(r.categoria, 'expresso');
  assert.equal(r.route, 'subcontract');
  assert.equal(r.confianca, 'alta');
});

test('produtos pereciveis tambem ficam na operacao propria', () => {
  const r = triar({ material: 'Produtos alimentares (pereciveis / refrigerados)' });
  assert.equal(r.route, 'subcontract');
  assert.equal(r.confianca, 'alta');
});

test('quem quer mesmo declarar a categoria tem a opcao no menu', () => {
  // O que distingue os dois casos e a escolha da pessoa, nao um padrao de texto.
  const r = triar({ material: 'Viatura (carro, mota, atrelado)' });
  assert.equal(r.categoria, 'viaturas');
  assert.equal(r.route, 'lead_sale');
});

// ── a duvida vem das respostas por dar ───────────────────────────────────────

test('uma resposta vaga nao chega para pedir revisao', () => {
  // Muita gente nao sabe quanto pesa um movel e sabe muito bem o que e e para onde vai.
  const r = triar({ material: 'Eletrodomesticos', naoSei: ['peso'] });
  assert.equal(r.confianca, 'alta');
});

test('duas respostas vagas mandam a lead a revisao', () => {
  const r = triar({ material: 'Eletrodomesticos', naoSei: ['peso', 'dimensoes'] });
  assert.equal(r.confianca, 'baixa');
  assert.match(r.motivo, /por confirmar/);
  assert.match(r.motivo, /o peso/);
});

test('a revisao nao mexe na categoria nem na rota', () => {
  // So trava a distribuicao automatica. Uma mudanca continua a ser uma mudanca.
  const certa = triar({ categoriaDeclarada: 'mudancas' });
  const vaga = triar({ categoriaDeclarada: 'mudancas', naoSei: ['peso', 'dimensoes'] });
  assert.equal(vaga.categoria, certa.categoria);
  assert.equal(vaga.route, certa.route);
  assert.equal(certa.confianca, 'alta');
  assert.equal(vaga.confianca, 'baixa');
});

test('"Outro" no material conta como resposta vaga', () => {
  // Nao e um "nao sei" escrito, mas diz-nos tao pouco como um.
  assert.deepEqual(respostasVagas({ material: 'Outro' }), ['material']);
  const r = triar({ material: 'Outro', naoSei: ['peso'] });
  assert.equal(r.confianca, 'baixa');
});

test('as vagas nao se contam a dobrar', () => {
  const v = respostasVagas({ material: 'Outro', naoSei: ['material', 'peso'] });
  assert.equal(v.length, 2);
});

test('vazios e lixo nao contam como resposta vaga', () => {
  assert.deepEqual(respostasVagas({ naoSei: ['', '  '] }), []);
  assert.deepEqual(respostasVagas({}), []);
});

test('um sinal forte nao apaga o pedido de revisao', () => {
  // Saber que e ADR nao diz quanto pesa: continua a valer a pena olhar antes de vender.
  const r = triar({ material: 'Mercadorias perigosas (ADR)', naoSei: ['peso', 'dimensoes'] });
  assert.equal(r.categoria, 'adr');
  assert.equal(r.confianca, 'baixa');
});
