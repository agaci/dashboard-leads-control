import type { Db } from 'mongodb';

/**
 * Quem envia o email de confirmação ao cliente.
 *
 * Há duas plataformas a receber a mesma lead: esta e a YourBox antiga, no nodechef. O
 * quiz chama as duas de propósito — se este servidor estiver em baixo, a lead entra na
 * mesma pela outra porta. Mas as duas sabem enviar o email de confirmação, e o cliente
 * não pode receber dois.
 *
 * **Um interruptor manual seria a solução errada**, e vale a pena dizer porquê: a altura
 * em que é preciso ligar o email do nodechef é exactamente a altura em que este servidor
 * está em baixo — e aí ninguém consegue abrir este dashboard para carregar no botão. Um
 * failsafe que depende de alguém o accionar durante a avaria não é um failsafe.
 *
 * Por isso o normal é `auto`, e a decisão é tomada por um pulso:
 *
 *   - esta aplicação escreve `pulsoEm` de minuto a minuto (cron) e a cada lead;
 *   - o nodechef, antes de enviar, olha para a idade desse pulso;
 *   - pulso fresco  -> esta aplicação está viva e já enviou. O nodechef cala-se.
 *   - pulso velho   -> ninguém enviou. O nodechef envia, e o cliente não fica sem nada.
 *
 * Nada disto precisa de intervenção humana, e recupera sozinho quando o servidor volta.
 * Os outros dois modos existem só para forçar a mão durante uma manutenção ou um teste.
 *
 * O documento vive na base de dados partilhada, que é o único sítio a que as duas
 * plataformas chegam.
 */

export const ESTADO_ID = 'emailConfirmacaoCliente';
const COLECCAO = 'platformStatus';

/** Minutos a partir dos quais o pulso se considera morto. */
export const PULSO_VALIDADE_MIN = 5;

export type ModoEmail = 'auto' | 'nodechef' | 'leads';

export interface EstadoEmail {
  modo: ModoEmail;
  pulsoEm: Date | null;
  /** Segundos desde o último pulso. `null` quando nunca houve nenhum. */
  idadeSegundos: number | null;
  /** O que o nodechef decidiria agora. Serve para o dashboard mostrar a verdade. */
  nodechefEnvia: boolean;
  actor?: string;
  updatedAt?: Date;
}

const MODOS: ModoEmail[] = ['auto', 'nodechef', 'leads'];

/**
 * O pulso.
 *
 * Escrito por um cron de minuto a minuto e também a cada lead registada. O cron é o que
 * conta: sem ele, uma madrugada sem leads deixava o pulso envelhecer e o nodechef
 * começava a enviar emails a dobrar por não haver movimento — que não é a mesma coisa
 * que estar em baixo.
 */
export async function registarPulso(db: Db): Promise<void> {
  try {
    await db.collection(COLECCAO).updateOne(
      { _id: ESTADO_ID as any },
      { $set: { pulsoEm: new Date() }, $setOnInsert: { modo: 'auto' } },
      { upsert: true },
    );
  } catch (err: any) {
    // Nunca lança: isto corre dentro do registo da lead, e a lead vale mais do que o pulso.
    console.error('[email/redundancia] falha a registar o pulso', err?.message ?? err);
  }
}

export async function lerEstado(db: Db): Promise<EstadoEmail> {
  const doc: any = await db.collection(COLECCAO).findOne({ _id: ESTADO_ID as any });
  const modo: ModoEmail = MODOS.includes(doc?.modo) ? doc.modo : 'auto';
  const pulsoEm: Date | null = doc?.pulsoEm ? new Date(doc.pulsoEm) : null;
  const idadeSegundos = pulsoEm ? Math.round((Date.now() - pulsoEm.getTime()) / 1000) : null;

  return {
    modo,
    pulsoEm,
    idadeSegundos,
    nodechefEnvia: decidir(modo, idadeSegundos),
    actor: doc?.actor,
    updatedAt: doc?.updatedAt,
  };
}

/**
 * A mesma decisão que o nodechef vai tomar, escrita deste lado.
 *
 * Duplicada de propósito: o dashboard tem de conseguir mostrar o que está a acontecer
 * sem perguntar à outra plataforma. Se as duas divergirem, é aqui que se compara.
 */
export function decidir(modo: ModoEmail, idadeSegundos: number | null): boolean {
  if (modo === 'nodechef') return true;
  if (modo === 'leads') return false;
  return idadeSegundos === null || idadeSegundos > PULSO_VALIDADE_MIN * 60;
}

export async function gravarModo(db: Db, modo: string, actor: string): Promise<EstadoEmail> {
  if (!MODOS.includes(modo as ModoEmail)) throw new Error('modo inválido');
  await db.collection(COLECCAO).updateOne(
    { _id: ESTADO_ID as any },
    { $set: { modo, actor, updatedAt: new Date() } },
    { upsert: true },
  );
  return lerEstado(db);
}
