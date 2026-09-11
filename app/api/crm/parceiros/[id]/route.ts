import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { lerCarteira, extracto } from '@/lib/crm/carteira';
import { metricasDoParceiro, actualizarScore } from '@/lib/crm/outcomes';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';
import { limparZona } from '@/lib/crm/zonas';
import { ESTADOS_PARCEIRO } from '@/lib/crm/angariacao';
import { limparDimensao, limparViaturas } from '@/lib/crm/filtros';

/**
 * Um parceiro do CRM.
 *
 *   GET    /api/crm/parceiros/<id>     perfil + carteira + capacidades + métricas
 *   PUT    /api/crm/parceiros/<id>     actualizar campos do perfil
 *   DELETE /api/crm/parceiros/<id>     só quem nunca recebeu nada
 */

const ESTADOS: readonly string[] = ESTADOS_PARCEIRO;
const CANAIS = ['whatsapp', 'email', 'sms', 'push'];

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const oid = paraOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

    const db = await getDb();
    const doc: any = await db.collection('crm_partners').findOne({ _id: oid });
    if (!doc) return Response.json({ error: 'Não encontrado' }, { status: 404 });

    const [carteira, movimentos, capacidades, metricas] = await Promise.all([
      lerCarteira(db, id),
      extracto(db, id, 30),
      db.collection('crm_capabilities').find({ partnerId: id }).toArray() as Promise<any[]>,
      metricasDoParceiro(db, id),
    ]);

    return Response.json({
      success: true,
      parceiro: { ...doc, _id: String(doc._id) },
      carteira,
      movimentos,
      capacidades: capacidades.map((c) => ({ ...c, _id: String(c._id) })),
      metricas,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const oid = paraOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

    const body = await request.json();
    const db = await getDb();

    const actual: any = await db.collection('crm_partners').findOne({ _id: oid });
    if (!actual) return Response.json({ error: 'Não encontrado' }, { status: 404 });

    const $set: Record<string, unknown> = { updatedAt: new Date() };

    if (Array.isArray(body.zonas)) {
      $set.zonas = body.zonas.map((z: string) => limparZona(String(z))).filter(Boolean);
    }
    for (const campo of ['nome', 'nif', 'contacto', 'telefone', 'email', 'morada', 'notas'] as const) {
      if (typeof body[campo] === 'string') $set[campo] = body[campo].trim();
    }

    // As duas invariantes do parceiro, validadas contra o que fica gravado e não contra
    // o que veio no corpo: uma edição parcial pode apagar o único contacto que existia.
    const nome = ($set.nome as string) ?? actual.nome;
    if (!String(nome ?? '').trim()) {
      return Response.json({ error: 'nome é obrigatório' }, { status: 400 });
    }
    const telefone = ($set.telefone as string) ?? actual.telefone;
    const email = ($set.email as string) ?? actual.email;
    if (!String(telefone ?? '').trim() && !String(email ?? '').trim()) {
      return Response.json(
        { error: 'tem de ficar com telefone ou email — sem contacto não há canal de entrega' },
        { status: 400 },
      );
    }
    // Presente no corpo mas vazio = apagar. E como se desmarca um escalao que ficou errado.
    if ('dimensao' in body) $set.dimensao = limparDimensao(body.dimensao) ?? null;
    if ('viaturas' in body) $set.viaturas = limparViaturas(body.viaturas) ?? null;

    if (ESTADOS.includes(body.estado)) $set.estado = body.estado;
    if (Array.isArray(body.canaisPreferidos)) {
      $set.canaisPreferidos = body.canaisPreferidos.filter((c: string) => CANAIS.includes(c));
    }
    if (typeof body.leadsGratisRestantes === 'number' && body.leadsGratisRestantes >= 0) {
      $set.leadsGratisRestantes = Math.floor(body.leadsGratisRestantes);
    }
    // O score não se edita à mão: sai das três fontes (lib/crm/outcomes.ts). Deixá-lo
    // editável tornaria a torneira de leads uma questão de simpatia.

    await db.collection('crm_partners').updateOne({ _id: oid }, { $set });

    // Recalcula: o estado mudou, e o score é o que ordena a fila de distribuição.
    await actualizarScore(db, id).catch(() => {});

    const doc: any = await db.collection('crm_partners').findOne({ _id: oid });
    return Response.json({ success: true, parceiro: doc ? { ...doc, _id: String(doc._id) } : null });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { id } = await params;
    const oid = paraOid(id);
    if (!oid) return Response.json({ error: 'ID inválido' }, { status: 400 });

    const db = await getDb();

    // Apagar um parceiro que já recebeu leads deixava débitos a apontar para o vazio e
    // envios órfãos. Quem já trabalhou suspende-se; não se apaga.
    const envios = await db.collection('crm_dispatches').countDocuments({ partnerId: id });
    if (envios > 0) {
      return Response.json(
        { error: `parceiro tem ${envios} envio(s) no histórico — suspenda em vez de apagar` },
        { status: 409 },
      );
    }

    await db.collection('crm_capabilities').deleteMany({ partnerId: id });
    await db.collection('crm_wallet').deleteOne({ _id: id as any });
    await db.collection('crm_partners').deleteOne({ _id: oid });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
