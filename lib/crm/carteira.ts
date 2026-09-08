import type { Db } from 'mongodb';
import type { CrmTransaction, CrmWallet, TipoTransacao } from '@/types/crm';
import { garantirIndices } from './indices';

/**
 * Carteira pré-paga (spec §5.4).
 *
 * O parceiro carrega saldo e cada lead debita. Elimina risco de crédito e cobranças, e
 * cria compromisso com a plataforma.
 *
 * Duas coisas têm de ser verdade mesmo com pedidos em paralelo e retries de webhook:
 *
 *   1. Nunca debitar abaixo de zero. Garantido pelo `$gte` no filtro do
 *      `findOneAndUpdate`: ou o saldo chega no momento da escrita, ou não há débito.
 *      Ler-o-saldo-e-depois-escrever teria uma janela entre as duas coisas.
 *
 *   2. Nunca debitar duas vezes o mesmo envio. Garantido pelo índice único sobre
 *      `chaveDebito` — regra inviolável nº2 da spec §7. Chave duplicada quer dizer
 *      "já foi", não "erro". A chave só existe em débitos e estornos: um carregamento
 *      de saldo não a tem, e por isso pode repetir-se. Ver lib/crm/indices.ts para a
 *      razão de ser um campo próprio e não um índice composto.
 *
 * Não há transações Mongo aqui de propósito: o servidor pode ser um standalone, onde
 * não existem. A ordem das operações é escolhida para que a falha entre elas deixe a
 * carteira certa — debita-se primeiro, regista-se a seguir, e um registo perdido é um
 * problema de auditoria, não de dinheiro.
 */

const ERRO_DUPLICADO = 11000;

export interface ResultadoMovimento {
  ok: boolean;
  /** true quando a operação já tinha sido feita antes — não é erro, é idempotência. */
  repetido?: boolean;
  erro?: string;
  saldo?: number;
  transacaoId?: string;
}

/**
 * O `limiteAviso` que interessa e o da configuracao, passado por quem chama.
 *
 * O que estiver gravado na carteira e so um resquicio: chegou a ser escrito a 25 na
 * criacao, o que fazia o campo "Aviso de saldo" da Configuracao nao ter efeito nenhum
 * nas carteiras ja existentes. Nao se escreve mais, e quem decide e o chamador.
 */
export async function lerCarteira(db: Db, partnerId: string, limiteAviso = 25): Promise<CrmWallet> {
  const doc: any = await db.collection('crm_wallet').findOne({ _id: partnerId as any });
  if (!doc) return { _id: partnerId, saldo: 0, limiteAviso, avisoEnviadoAt: null, updatedAt: new Date() };
  return {
    _id: partnerId,
    saldo: Number(doc.saldo) || 0,
    limiteAviso: Number(doc.limiteAviso) || limiteAviso,
    avisoEnviadoAt: doc.avisoEnviadoAt ?? null,
    updatedAt: doc.updatedAt ?? new Date(),
  };
}

export async function lerCarteirasEmLote(db: Db, partnerIds: string[]): Promise<Map<string, CrmWallet>> {
  const out = new Map<string, CrmWallet>();
  if (!partnerIds.length) return out;
  const docs: any[] = await db.collection('crm_wallet').find({ _id: { $in: partnerIds as any[] } }).toArray();
  for (const d of docs) {
    out.set(String(d._id), {
      _id: String(d._id),
      saldo: Number(d.saldo) || 0,
      limiteAviso: Number(d.limiteAviso) || 25,
      avisoEnviadoAt: d.avisoEnviadoAt ?? null,
      updatedAt: d.updatedAt ?? new Date(),
    });
  }
  for (const id of partnerIds) {
    if (!out.has(id)) out.set(id, { _id: id, saldo: 0, limiteAviso: 25, avisoEnviadoAt: null, updatedAt: new Date() });
  }
  return out;
}

/** Carregamento de saldo. Sempre positivo; quem tira dinheiro é `debitar`. */
export async function carregar(
  db: Db,
  partnerId: string,
  valor: number,
  actor: string,
  motivo = 'carregamento de saldo',
): Promise<ResultadoMovimento> {
  if (!(valor > 0)) return { ok: false, erro: 'valor tem de ser positivo' };
  await garantirIndices(db);

  const res: any = await db.collection('crm_wallet').findOneAndUpdate(
    { _id: partnerId as any },
    {
      $inc: { saldo: arredondar(valor) },
      // O carregamento limpa o aviso: a carteira volta a poder avisar quando descer.
      $set: { updatedAt: new Date(), avisoEnviadoAt: null },
    },
    { upsert: true, returnDocument: 'after' } as any,
  );

  const saldo = arredondar(Number(res?.value?.saldo) || 0);
  const tid = await registar(db, {
    partnerId, tipo: 'carregamento', valor: arredondar(valor), saldoApos: saldo,
    dispatchId: null, consultaId: null, motivo, actor,
  });
  return { ok: true, saldo, transacaoId: tid ?? undefined };
}

/**
 * Débito de uma lead entregue.
 *
 * O `dispatchId` é obrigatório: a spec quer que cada débito aponte para o envio que o
 * originou, para tornar facturação e recusas triviais de reconciliar (§7). É também o
 * que dá a idempotência — o mesmo envio nunca debita duas vezes.
 */
export async function debitar(
  db: Db,
  partnerId: string,
  valor: number,
  opts: { dispatchId: string; consultaId: string; actor: string; motivo?: string },
): Promise<ResultadoMovimento> {
  if (!(valor > 0)) return { ok: false, erro: 'valor tem de ser positivo' };
  if (!opts.dispatchId) return { ok: false, erro: 'dispatchId obrigatório — sem ele o débito não é reconciliável' };
  await garantirIndices(db);

  const montante = arredondar(valor);

  // Já debitado? Pergunta-se antes por causa da mensagem: sem isto, o caminho repetido
  // dava "saldo insuficiente" quando o problema era outro.
  const jaFeito: any = await db.collection('crm_transactions').findOne({ dispatchId: opts.dispatchId, tipo: 'debito' });
  if (jaFeito) {
    return { ok: true, repetido: true, saldo: Number(jaFeito.saldoApos) || 0, transacaoId: String(jaFeito._id) };
  }

  // O $gte no filtro é a defesa: sem saldo, não há documento para actualizar.
  const res: any = await db.collection('crm_wallet').findOneAndUpdate(
    { _id: partnerId as any, saldo: { $gte: montante } },
    { $inc: { saldo: -montante }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' } as any,
  );

  if (!res?.value) {
    const carteira = await lerCarteira(db, partnerId);
    return { ok: false, erro: `saldo insuficiente: tem ${carteira.saldo.toFixed(2)} EUR, precisa de ${montante.toFixed(2)} EUR`, saldo: carteira.saldo };
  }

  const saldo = arredondar(Number(res.value.saldo) || 0);
  const tid = await registar(db, {
    partnerId, tipo: 'debito', valor: montante, saldoApos: saldo,
    dispatchId: opts.dispatchId, consultaId: opts.consultaId,
    motivo: opts.motivo ?? 'lead entregue', actor: opts.actor,
  });

  // Chave duplicada: outro pedido ganhou a corrida e já tinha debitado. Devolve-se o
  // dinheiro deste, para o saldo ficar certo.
  if (tid === null) {
    await db.collection('crm_wallet').updateOne(
      { _id: partnerId as any },
      { $inc: { saldo: montante }, $set: { updatedAt: new Date() } },
    );
    const anterior: any = await db.collection('crm_transactions').findOne({ dispatchId: opts.dispatchId, tipo: 'debito' });
    return { ok: true, repetido: true, saldo: Number(anterior?.saldoApos) || saldo + montante };
  }

  return { ok: true, saldo, transacaoId: tid };
}

/**
 * Estorno de um débito — recusa aceite dentro da janela de 24h (spec §6.3).
 *
 * Idempotente pelo mesmo mecanismo do débito: um estorno por envio.
 */
export async function estornar(
  db: Db,
  partnerId: string,
  opts: { dispatchId: string; consultaId: string; actor: string; motivo: string },
): Promise<ResultadoMovimento> {
  await garantirIndices(db);

  const debito: any = await db.collection('crm_transactions').findOne({ dispatchId: opts.dispatchId, tipo: 'debito' });
  if (!debito) return { ok: false, erro: 'não há débito para estornar neste envio' };

  const jaEstornado: any = await db.collection('crm_transactions').findOne({ dispatchId: opts.dispatchId, tipo: 'estorno' });
  if (jaEstornado) {
    return { ok: true, repetido: true, saldo: Number(jaEstornado.saldoApos) || 0, transacaoId: String(jaEstornado._id) };
  }

  const montante = arredondar(Number(debito.valor) || 0);
  const res: any = await db.collection('crm_wallet').findOneAndUpdate(
    { _id: partnerId as any },
    { $inc: { saldo: montante }, $set: { updatedAt: new Date() } },
    { upsert: true, returnDocument: 'after' } as any,
  );

  const saldo = arredondar(Number(res?.value?.saldo) || montante);
  const tid = await registar(db, {
    partnerId, tipo: 'estorno', valor: montante, saldoApos: saldo,
    dispatchId: opts.dispatchId, consultaId: opts.consultaId, motivo: opts.motivo, actor: opts.actor,
  });

  if (tid === null) {
    await db.collection('crm_wallet').updateOne(
      { _id: partnerId as any },
      { $inc: { saldo: -montante }, $set: { updatedAt: new Date() } },
    );
    return { ok: true, repetido: true, saldo: saldo - montante };
  }

  return { ok: true, saldo, transacaoId: tid };
}

/** Correcção manual da operação. Aceita valor negativo — é para isso que serve. */
export async function ajustar(
  db: Db,
  partnerId: string,
  valor: number,
  actor: string,
  motivo: string,
): Promise<ResultadoMovimento> {
  if (!isFinite(valor) || valor === 0) return { ok: false, erro: 'valor inválido' };
  if (!motivo?.trim()) return { ok: false, erro: 'ajuste manual exige motivo' };
  await garantirIndices(db);

  const montante = arredondar(valor);
  const filtro: Record<string, unknown> = { _id: partnerId };
  if (montante < 0) filtro.saldo = { $gte: -montante };

  const res: any = await db.collection('crm_wallet').findOneAndUpdate(
    filtro as any,
    { $inc: { saldo: montante }, $set: { updatedAt: new Date() } },
    { upsert: montante > 0, returnDocument: 'after' } as any,
  );

  if (!res?.value) return { ok: false, erro: 'saldo insuficiente para o ajuste' };

  const saldo = arredondar(Number(res.value.saldo) || 0);
  const tid = await registar(db, {
    partnerId, tipo: 'ajuste', valor: Math.abs(montante), saldoApos: saldo,
    dispatchId: null, consultaId: null, motivo: `${montante > 0 ? '+' : '-'}${Math.abs(montante).toFixed(2)} EUR: ${motivo.trim()}`, actor,
  });
  return { ok: true, saldo, transacaoId: tid ?? undefined };
}

export async function extracto(db: Db, partnerId: string, limite = 50): Promise<CrmTransaction[]> {
  const docs: any[] = await db
    .collection('crm_transactions')
    .find({ partnerId })
    .sort({ createdAt: -1 })
    .limit(Math.min(limite, 200))
    .toArray();
  return docs.map((d) => ({ ...d, _id: String(d._id) })) as CrmTransaction[];
}

/**
 * Devolve o id da transacção, ou `null` quando a chave única a rejeitou por repetida.
 *
 * O `dispatchId` e o `consultaId` são omitidos quando não há — nunca gravados a `null`.
 * A distinção é tudo: o índice único (dispatchId, tipo) é `sparse`, e um índice sparse
 * ignora o documento onde o campo NÃO EXISTE, não o documento onde o campo é `null`.
 * Com `dispatchId: null` escrito, todos os carregamentos partilhavam a mesma chave e o
 * segundo era rejeitado — o saldo subia e o movimento desaparecia do extracto.
 */
async function registar(db: Db, t: Omit<CrmTransaction, '_id' | 'createdAt'> & { tipo: TipoTransacao }): Promise<string | null> {
  const doc: Record<string, unknown> = { ...t, createdAt: new Date() };
  if (doc.dispatchId == null) delete doc.dispatchId;
  if (doc.consultaId == null) delete doc.consultaId;
  // A chave so existe quando ha envio. Sem ela, o indice sparse ignora o documento e o
  // movimento pode repetir-se — que e o caso dos carregamentos e dos ajustes.
  if (doc.dispatchId) doc.chaveDebito = `${doc.dispatchId}:${t.tipo}`;

  try {
    const res: any = await db.collection('crm_transactions').insertOne(doc as any);
    return String(res.insertedId);
  } catch (err: any) {
    if (err?.code === ERRO_DUPLICADO) {
      // Repetido é normal em débito e estorno: é a idempotência a funcionar. Em
      // carregamento e ajuste não há chave para repetir, portanto é anomalia — e uma
      // que tira dinheiro do extracto sem tirar do saldo. Fica ruidosa.
      if (t.tipo !== 'debito' && t.tipo !== 'estorno') {
        console.error('[crm/carteira] movimento perdido por chave duplicada:', t.tipo, t.partnerId, t.valor);
      }
      return null;
    }
    throw err;
  }
}

/** Cêntimos. Somar floats em euros sem arredondar deixa 0.30000000000000004 na carteira. */
function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}
