// Testes do score do parceiro.
//
// O score não é um indicador: é a torneira de leads. Ele decide quem entra primeiro na
// fila da próxima lead e, na prática, quem fica com o negócio. Uma parcela trocada aqui
// não dá erro nenhum — apenas passa a mandar as leads para as pessoas erradas, durante
// meses, sem ninguém dar por isso.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calcularScore, SCORE_SEM_HISTORICO, type Metricas, type PesosScore } from './score.ts';

const PESOS: PesosScore = { reporte: 0.35, recusa: 0.25, cliente: 0.25, resposta: 0.15 };

function metricas(over: Partial<Metricas> = {}): Metricas {
  return {
    leadsRecebidas: 10, reportadas: 10, recusas: 0, recusasContraditas: 0, ganhos: 5,
    avaliacaoMedia: null, respostaMediaMinutos: null, ...over,
  };
}

test('sem leads recebidas o parceiro não nasce no fundo da fila', () => {
  const r = calcularScore(metricas({ leadsRecebidas: 0 }), PESOS);
  assert.equal(r.score, SCORE_SEM_HISTORICO);
});

test('reportar tudo e não recusar nada dá o topo', () => {
  const r = calcularScore(metricas({ avaliacaoMedia: 5, respostaMediaMinutos: 10 }), PESOS);
  assert.equal(r.score, 100);
});

test('não reportar nada custa a parcela do reporte', () => {
  const cheio = calcularScore(metricas({ reportadas: 10 }), PESOS);
  const vazio = calcularScore(metricas({ reportadas: 0 }), PESOS);
  assert.ok(vazio.score < cheio.score);
  // O reporte é a parcela mais pesada: é o comportamento que a plataforma compra.
  assert.equal(cheio.score - vazio.score, 35);
});

test('a avaliação do cliente entra mesmo no score', () => {
  // Regressão: até 07/09/2026 a avaliação do cliente nunca chegava aqui, e esta parcela
  // ficava sempre no valor neutro. A fonte principal da spec §6.2 valia zero na prática.
  const cinco = calcularScore(metricas({ avaliacaoMedia: 5 }), PESOS);
  const um = calcularScore(metricas({ avaliacaoMedia: 1 }), PESOS);
  assert.ok(cinco.score > um.score, 'um 5/5 tem de valer mais do que um 1/5');
  assert.equal(cinco.score - um.score, 25);
});

test('sem avaliação nenhuma a parcela fica no meio, não a zero', () => {
  // Não se pune quem ainda não teve oportunidade de ser avaliado.
  const semNota = calcularScore(metricas({ avaliacaoMedia: null }), PESOS);
  const notaMinima = calcularScore(metricas({ avaliacaoMedia: 1 }), PESOS);
  const notaMaxima = calcularScore(metricas({ avaliacaoMedia: 5 }), PESOS);
  assert.ok(semNota.score > notaMinima.score);
  assert.ok(semNota.score < notaMaxima.score);
});

test('recusar leads desce o score', () => {
  const limpo = calcularScore(metricas({ recusas: 0 }), PESOS);
  const metade = calcularScore(metricas({ recusas: 5 }), PESOS);
  assert.ok(metade.score < limpo.score);
});

test('a recusa contradita pelo cliente pesa a dobrar', () => {
  const normal = calcularScore(metricas({ recusas: 2, recusasContraditas: 0 }), PESOS);
  const contradita = calcularScore(metricas({ recusas: 2, recusasContraditas: 2 }), PESOS);
  assert.ok(contradita.score < normal.score);

  // Duas recusas contraditas doem o mesmo que quatro recusas simples: conta a dobrar,
  // nem mais nem menos. Cobrar automaticamente e uma decisao comercial, nao do codigo.
  const quatroSimples = calcularScore(metricas({ recusas: 4, recusasContraditas: 0 }), PESOS);
  assert.equal(contradita.score, quatroSimples.score);
});

test('uma contradição isolada não arrasa o parceiro', () => {
  // A plataforma acredita à primeira e conta as vezes: em 10 leads, uma contradição tem
  // de deixar o parceiro em condições de continuar a receber.
  const r = calcularScore(metricas({ recusas: 1, recusasContraditas: 1, avaliacaoMedia: 4 }), PESOS);
  assert.ok(r.score > SCORE_SEM_HISTORICO, `esperava acima de 50, deu ${r.score}`);
});

test('quem contradiz sempre cai abaixo de quem nunca recusou', () => {
  const honesto = calcularScore(metricas({ recusas: 0, avaliacaoMedia: 3 }), PESOS);
  const reincidente = calcularScore(metricas({ recusas: 5, recusasContraditas: 5, avaliacaoMedia: 3 }), PESOS);
  assert.ok(reincidente.score < honesto.score);
  // A parcela da recusa satura a zero: nao vai a negativo puxar as outras para baixo.
  assert.ok(reincidente.parcelas.recusa >= 0);
});

test('responder depressa vale mais do que responder tarde', () => {
  const rapido = calcularScore(metricas({ respostaMediaMinutos: 10 }), PESOS);
  const lento = calcularScore(metricas({ respostaMediaMinutos: 24 * 60 }), PESOS);
  assert.ok(rapido.score > lento.score);
});

test('o score fica sempre entre 0 e 100', () => {
  const pior = calcularScore(
    metricas({ reportadas: 0, recusas: 10, recusasContraditas: 10, avaliacaoMedia: 1, respostaMediaMinutos: 99999 }),
    PESOS,
  );
  const melhor = calcularScore(metricas({ avaliacaoMedia: 5, respostaMediaMinutos: 1 }), PESOS);
  assert.ok(pior.score >= 0 && pior.score <= 100, `pior = ${pior.score}`);
  assert.ok(melhor.score >= 0 && melhor.score <= 100, `melhor = ${melhor.score}`);
});

test('as parcelas explicam o total — é o que o dashboard mostra', () => {
  const r = calcularScore(metricas({ avaliacaoMedia: 4, respostaMediaMinutos: 30 }), PESOS);
  const soma = r.parcelas.reporte + r.parcelas.recusa + r.parcelas.cliente + r.parcelas.resposta;
  assert.equal(Math.round(soma * 100), r.score);
});
