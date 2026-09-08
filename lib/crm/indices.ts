import type { Db } from 'mongodb';

/**
 * Índices das colecções `crm_*`.
 *
 * Dois deles carregam a regra inviolável nº2 da spec §7 — "um retry de webhook nunca
 * pode gerar duas mensagens nem dois débitos". Com dois processos a escrever ao mesmo
 * tempo, a única coisa que garante isso é um índice único. Os restantes são de
 * desempenho.
 *
 * ── A restrição que manda no desenho: o servidor é MongoDB 3.0 ──────────────
 *
 * E no 3.0 **não há índices parciais** (chegaram no 3.2). Pior do que não haver: o 3.0
 * ACEITA `partialFilterExpression` e guarda-o na definição do índice, mas ignora-o. Um
 * índice que parece filtrado e não filtra nada.
 *
 * O `sparse` também não serve para o que aqui era preciso: num índice COMPOSTO, só
 * ignora o documento quando faltam TODOS os campos indexados.
 *
 * O que resta, e funciona: **único + sparse sobre UM SÓ campo**. Um documento sem esse
 * campo não entra no índice e pode repetir-se; com o campo, a unicidade é imposta; e um
 * `$unset` liberta a chave. Daí os campos `chaveViva` (envios) e `chaveDebito`
 * (movimentos) existirem — não são redundância, são o único mecanismo disponível.
 *
 * Corre-se uma vez por processo, na primeira operação de escrita. `createIndex` é
 * idempotente no Mongo; o que se evita com a memória em módulo é a ida à rede.
 */

let feito = false;

export async function garantirIndices(db: Db): Promise<void> {
  if (feito) return;
  feito = true;

  const tarefas: Promise<unknown>[] = [
    // Idempotência dos envios — a regra inviolável nº2 da spec.
    indiceDeEnvios(db),
    db.collection('crm_dispatches').createIndex({ partnerId: 1, createdAt: -1 }),
    db.collection('crm_dispatches').createIndex({ estado: 1, expiresAt: 1 }),

    // "Quem pode fazer isto?" tem de responder em milissegundos (spec §7).
    db.collection('crm_capabilities').createIndex({ categoria: 1, active: 1 }),
    db.collection('crm_capabilities').createIndex({ partnerId: 1 }),

    db.collection('crm_partners').createIndex({ estado: 1, score: -1 }),
    db.collection('crm_partners').createIndex({ nome: 1 }),

    db.collection('crm_consultas').createIndex({ estado: 1, createdAt: -1 }),
    db.collection('crm_consultas').createIndex({ route: 1, categoria: 1, createdAt: -1 }),
    db.collection('crm_consultas').createIndex({ 'origem.leadId': 1 }),
    // Varridos dos crons: janela de recusa e follow-up a 48h.
    db.collection('crm_consultas').createIndex({ entregueAt: 1, followUpEnviadoAt: 1 }),

    // Um débito por envio: impede o dobro de cobrança mesmo com dois pedidos em paralelo.
    indicePorEnvio(db),
    db.collection('crm_transactions').createIndex({ partnerId: 1, createdAt: -1 }),

    db.collection('crm_outcomes').createIndex({ consultaId: 1 }),
    // Uma resposta por pergunta: o segundo clique no link nao conta outra vez.
    db.collection('crm_outcomes').createIndex(
      { chaveUnica: 1 },
      { unique: true, sparse: true, name: 'crm_outcome_unico' },
    ),
    db.collection('crm_outcomes').createIndex({ partnerId: 1, createdAt: -1 }),
  ];

  const resultados = await Promise.allSettled(tarefas);
  for (const r of resultados) {
    // Um índice que falha não pode derrubar o pedido: fica o aviso no log e a
    // aplicação segue. O único que importa mesmo já falha na escrita seguinte, com
    // erro de chave duplicada — que é exactamente o que se quer.
    if (r.status === 'rejected') console.error('[crm/indices]', r.reason?.message ?? r.reason);
  }
}

/**
 * A chave única que trava a entrega em duplicado.
 *
 * Só conta os envios vivos — os que ainda têm `chaveViva`. A distinção não é um
 * detalhe: a chave existe para que um retry de webhook não entregue a mesma lead duas
 * vezes, não para impedir a segunda tentativa depois de a primeira não ter chegado a
 * lado nenhum. Ao falhar, o envio perde a `chaveViva`, liberta o canal, e fica no
 * registo a dizer que aquele canal falhou.
 */
async function indiceDeEnvios(db: Db): Promise<void> {
  await largarIndices(db, 'crm_dispatches', ['crm_dispatch_idempotencia', 'crm_dispatch_idempotencia_v2']);
  await db.collection('crm_dispatches').createIndex(
    { chaveViva: 1 },
    { unique: true, sparse: true, name: 'crm_dispatch_vivo' },
  );
}

/**
 * O índice único que trava o duplo débito.
 *
 * Só entram no índice os movimentos com `chaveDebito`, isto é, os que nasceram de um
 * envio. Carregamentos e ajustes não a têm e podem repetir-se à vontade — que é o que
 * um carregamento de saldo faz por natureza.
 *
 * As duas versões anteriores deste índice estavam erradas e ficam aqui nomeadas para
 * serem largadas: a primeira era um composto `sparse` (que não ignora nada quando um
 * dos campos está sempre preenchido) e a segunda era parcial (que o Mongo 3.0 aceita e
 * ignora). Ambas rejeitavam o segundo carregamento de saldo de cada parceiro.
 */
async function indicePorEnvio(db: Db): Promise<void> {
  await largarIndices(db, 'crm_transactions', ['crm_transacao_por_envio', 'crm_transacao_por_envio_v2']);
  await db.collection('crm_transactions').createIndex(
    { chaveDebito: 1 },
    { unique: true, sparse: true, name: 'crm_transacao_por_envio_v3' },
  );
}

/** Larga índices antigos, ignorando os que já não existem (instalação de raiz). */
async function largarIndices(db: Db, coleccao: string, nomes: string[]): Promise<void> {
  for (const nome of nomes) {
    try {
      await db.collection(coleccao).dropIndex(nome);
    } catch {
      // Não existia. É o caminho normal.
    }
  }
}
