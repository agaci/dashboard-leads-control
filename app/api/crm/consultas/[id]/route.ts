import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { lerConsulta, mudarEstado } from '@/lib/crm/consultas';
import { enviosDaConsulta } from '@/lib/crm/dispatch';
import { outcomesDaConsulta } from '@/lib/crm/outcomes';
import { proximosEstados } from '@/lib/crm/estados';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Uma consulta.
 *
 *   GET   /api/crm/consultas/<id>   consulta + envios + resultados + próximos estados
 *   PATCH /api/crm/consultas/<id>   { estado, motivo }
 *
 * O PATCH só muda estado, e só por transições legítimas. Os dados do pedido não se
 * editam: a consulta é o retrato do que o cliente pediu, e reescrevê-lo depois de a
 * lead ter sido vendida faria o parceiro pagar por uma coisa e receber outra.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const db = await getDb();
    const consulta = await lerConsulta(db, id);
    if (!consulta) return Response.json({ error: 'Não encontrada' }, { status: 404 });

    const [envios, resultados] = await Promise.all([
      enviosDaConsulta(db, id),
      outcomesDaConsulta(db, id),
    ]);

    // Os nomes dos parceiros: o dashboard mostra "MRW", não um ObjectId.
    //
    // Vão daqui os dos envios E os que aparecem no `history` como `parceiro:<id>` —
    // um histórico que diz "parceiro:6a9e904b..." é tecnicamente exacto e humanamente
    // inútil. O id continua a ser o que fica gravado, porque é o que não muda quando o
    // parceiro trocar de nome; a tradução é só para leitura.
    const nomes = new Map<string, string>();
    const doHistorico = consulta.history
      .map((h) => /^parceiro:(.+)$/.exec(h.actor)?.[1])
      .filter((v): v is string => !!v);
    const ids = [...new Set([...envios.map((e) => e.partnerId), ...doHistorico])];

    if (ids.length) {
      const oids = ids.map(paraOid).filter(Boolean);
      const docs: any[] = await db.collection('crm_partners').find({ _id: { $in: oids as any[] } }).toArray();
      for (const d of docs) nomes.set(String(d._id), d.nome);
    }

    return Response.json({
      success: true,
      consulta,
      envios: envios.map((e) => ({ ...e, nomeParceiro: nomes.get(e.partnerId) ?? e.partnerId })),
      resultados,
      parceiros: Object.fromEntries(nomes),
      proximosEstados: proximosEstados(consulta.route, consulta.estado),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const { id } = await params;
    const body = await request.json();
    const estado = body.estado;
    const motivo = String(body.motivo ?? '').trim();

    if (!estado) return Response.json({ error: 'estado em falta' }, { status: 400 });
    if (!motivo) return Response.json({ error: 'motivo obrigatório — nada muda de estado sem registo' }, { status: 400 });

    const db = await getDb();
    const r = await mudarEstado(db, id, estado, operador.nome, motivo);
    if (!r.ok) return Response.json({ error: r.erro }, { status: 400 });
    return Response.json({ success: true, consulta: r.consulta });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
