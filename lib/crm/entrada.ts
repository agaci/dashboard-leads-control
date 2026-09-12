import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { consultaDeLead } from './consultas';
import { lerConfig } from './config';
import { limitesDeTabela, triar } from './triagem';
import { categoriaDoMaterialBD } from './materiais';

/**
 * A porta de entrada do CRM: uma lead acaba de nascer.
 *
 * Corre dentro do fluxo que cria a lead (app/api/quiz-progress), que é por onde passam
 * TODAS as leads do site — incluindo as das variantes em produção. Daí as três regras
 * que mandam neste ficheiro:
 *
 *   1. **Nunca lançar.** Uma falha aqui não pode fazer perder uma lead. O CRM é
 *      acessório; a lead é o negócio.
 *   2. **Nunca distribuir.** Aqui só se classifica e se abre a consulta. A entrega
 *      depende de autorização do cliente e, quando o envio automático está desligado,
 *      da decisão da operadora.
 *   3. **Só a Linha B.** Uma lead servível segue o caminho de sempre e não gera
 *      consulta nenhuma — não vale a pena encher o CRM com o que a operação já faz.
 *
 * O resultado prático: a operadora abre o dashboard e a lead já lá está classificada,
 * antes de pegar no telefone. Deixa de ter de reparar que aquela é das que não fazemos.
 */

export interface ResultadoEntrada {
  triada: boolean;
  categoria?: string;
  route?: string;
  consultaId?: string;
  motivo?: string;
}

export async function triarLeadNova(db: Db, leadId: string, leadData: any): Promise<ResultadoEntrada> {
  try {
    const cfg = await lerConfig(db);
    if (!cfg.active) return await marcar(db, leadId, { triada: false, motivo: 'CRM inactivo' });

    const limites = await limitesDeTabela(db);
    // A mesma resolucao que a `criarConsulta` faz: a lista de materiais e que sabe a
    // categoria de uma opcao criada pelo CRUD, que as regras de texto nao adivinham.
    const categoriaDeclarada = await categoriaDoMaterialBD(db, leadData?.material);
    const r = triar({
      categoriaDeclarada: categoriaDeclarada ?? undefined,
      origem: leadData?.origem,
      destino: leadData?.destino,
      urgencia: leadData?.urgencia,
      viatura: leadData?.viatura,
      material: leadData?.material,
      weightKg: numero(leadData?.weightKg),
      nVolumes: numero(leadData?.volumes),
      observacoes: leadData?.observacoes,
      naoSei: Array.isArray(leadData?.naoSei) ? leadData.naoSei.map(String) : undefined,
    }, limites);

    // Linha A: a operação própria trata dela como sempre.
    if (r.route !== 'lead_sale') {
      return await marcar(db, leadId, { triada: true, categoria: r.categoria, route: r.route, motivo: r.motivo });
    }

    // `consultaDeLead` volta a triar a partir do documento gravado — é ele a fonte de
    // verdade, não o que passou por aqui. E não duplica: se já houver consulta para
    // esta lead, devolve a que existe.
    const consulta = await consultaDeLead(db, leadId, 'sistema');
    return await marcar(db, leadId, {
      triada: true,
      categoria: consulta.categoria,
      route: consulta.route,
      consultaId: String(consulta._id),
      motivo: consulta.triagem.motivo,
    });
  } catch (err: any) {
    // Engolido de propósito: ver a regra 1. Fica o rasto no log para se perceber que a
    // lead entrou sem ser triada, e a operadora pode triá-la à mão no CRM.
    console.error('[crm/entrada] falha a triar a lead', leadId, err?.message ?? err);
    return await marcar(db, leadId, { triada: false, motivo: err?.message ?? 'erro' });
  }
}

/**
 * Carimba o resultado na própria lead.
 *
 * Sem isto, uma triagem que falhe só deixa rasto na consola do servidor — e uma falha
 * que só se vê na consola é uma falha invisível. Com o carimbo, basta olhar para a lead
 * para saber se a triagem correu, o que decidiu, e porque não criou consulta.
 *
 * Nunca lança nem impede o retorno: é diagnóstico, não é o trabalho.
 */
async function marcar(db: Db, leadId: string, r: ResultadoEntrada): Promise<ResultadoEntrada> {
  try {
    await db.collection('messages').updateOne(
      { _id: new ObjectId(leadId) as any },
      { $set: { crmTriagem: { ...r, at: new Date() } } },
    );
  } catch { /* o carimbo e acessorio */ }
  return r;
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}
