import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { lerConsulta } from '@/lib/crm/consultas';
import { registarOutcome } from '@/lib/crm/outcomes';
import { paginaEscolha, paginaHtml } from '@/lib/pagina';
import { validar } from '@/lib/crm/tokens';

/**
 * Resposta do cliente ao follow-up das 48h (spec §6.2).
 *
 *   GET /api/crm/followup?c=<consulta>&r=1|0&t=<token>[&n=1..5]
 *
 * A fonte principal de visibilidade. Uma pergunta, resposta de um toque: quem clica em
 * "Sim" vê logo a segunda pergunta (1 a 5) na mesma página, sem escrever nada.
 *
 * Para o cliente, isto é a YourBox a perguntar como correu. Nada nesta página revela
 * que o serviço foi entregue a outra empresa — é a regra que vale em toda a app, e é
 * também o que faz a pergunta ter sentido do lado de quem responde.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const consultaId = searchParams.get('c') ?? '';
  const token = searchParams.get('t') ?? '';
  const resolveu = searchParams.get('r');
  const nota = searchParams.get('n');

  if (!consultaId || !validar('followup', consultaId, token)) {
    return paginaHtml('Ligação inválida', 'Este link não é válido ou já expirou.', false);
  }

  try {
    const db = await getDb();
    const consulta = await lerConsulta(db, consultaId);
    if (!consulta) return paginaHtml('Ligação inválida', 'Não encontrámos este pedido.', false);

    // Segundo toque: a avaliação de 1 a 5.
    if (nota) {
      const n = Number(nota);
      if (!(n >= 1 && n <= 5)) return paginaHtml('Ligação inválida', 'Avaliação fora do intervalo.', false);
      const r = await registarOutcome(db, {
        consultaId, fonte: 'cliente', tipo: 'avaliacao', avaliacao: n, motivo: 'follow-up 48h',
        chaveUnica: `${consultaId}:cliente:avaliacao`,
      });
      return paginaHtml(
        'Obrigado',
        r.repetido
          ? 'Já tínhamos registado a sua resposta. Obrigado na mesma.'
          : 'A sua resposta ajuda-nos a servir melhor da próxima vez.',
      );
    }

    if (resolveu === '1') {
      await registarOutcome(db, {
        consultaId, fonte: 'cliente', tipo: 'resolveu', motivo: 'follow-up 48h',
        chaveUnica: `${consultaId}:cliente:resposta`,
      });
      // A contradicao da spec §6: duas fontes independentes a dizerem o contrario uma
      // da outra. So se pode detectar aqui, porque a janela de recusa fecha aas 24h e
      // esta resposta so chega aas 48h — quando a recusa foi decidida, a prova ainda
      // nao existia.
      if (consulta.estado === 'recusada' && !consulta.contradicao) {
        await db.collection('crm_consultas').updateOne(
          { _id: paraOid(consultaId) as any },
          {
            $set: {
              contradicao: {
                at: new Date(),
                motivo: 'lead contestada pelo parceiro, mas o cliente diz que ficou resolvida',
              },
              updatedAt: new Date(),
            },
          },
        );
      }

      const base = `/api/crm/followup?c=${encodeURIComponent(consultaId)}&r=1&t=${encodeURIComponent(token)}`;
      return paginaEscolha(
        'Ainda bem',
        'Como correu? De 1 a 5.',
        [1, 2, 3, 4, 5].map((n) => ({ label: String(n), url: `${base}&n=${n}` })),
      );
    }

    if (resolveu === '0') {
      await registarOutcome(db, {
        consultaId, fonte: 'cliente', tipo: 'nao_resolveu', motivo: 'follow-up 48h',
        // Mesma chave do "sim": a pergunta e uma so, e a primeira resposta e a que conta.
        chaveUnica: `${consultaId}:cliente:resposta`,
      });
      // Um "não" é a informação mais accionável que a plataforma recebe: fica registado
      // e a operadora vê-o na consulta, com o contacto ao lado.
      return paginaHtml(
        'Obrigado por nos dizer',
        'Lamentamos que não tenha ficado resolvido. Se quiser, ligue-nos para <strong>214 304 546</strong> e vemos o que podemos fazer.',
      );
    }

    return paginaHtml('Ligação inválida', 'Falta a resposta neste link.', false);
  } catch (err: any) {
    return paginaHtml('Não foi possível registar', String(err.message ?? 'erro'), false);
  }
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
