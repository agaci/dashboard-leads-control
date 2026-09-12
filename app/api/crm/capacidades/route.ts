import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import type { CrmCapability } from '@/types/crm';
import { eCategoriaValida, normalizar } from '@/lib/crm/categorias';
import { requisitosDoPedido } from '@/lib/crm/capacidades';
import { procurarParceiros } from '@/lib/crm/procura';
import { garantirIndices } from '@/lib/crm/indices';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';
import { zonasDeCapacidade } from '@/lib/crm/zonas';

/**
 * Capacidades (`crm_capabilities`) — a peça mais crítica do sistema (spec §7).
 *
 *   GET  /api/crm/capacidades?partnerId=<id>            linhas de um parceiro
 *   GET  /api/crm/capacidades?categoria=adr&zona=porto  simulação: quem pode fazer isto?
 *   POST /api/crm/capacidades   { partnerId, categoria, zonas[], maxWeightKg, ... }
 *
 * A simulação existe para a operadora poder responder à pergunta antes de haver uma
 * consulta — e para se ver, quando não há ninguém, exactamente quem foi excluído e
 * porquê.
 */

export async function GET(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partnerId');
    const categoria = searchParams.get('categoria');
    const db = await getDb();

    if (categoria) {
      if (!eCategoriaValida(categoria)) return Response.json({ error: 'categoria desconhecida' }, { status: 400 });
      const requisitos = requisitosDoPedido(categoria, {
        zona: searchParams.get('zona') ?? undefined,
        weightKg: numero(searchParams.get('weightKg')),
        totalCm: numero(searchParams.get('totalCm')),
        viatura: searchParams.get('viatura') ?? undefined,
      });
      const { elegiveis, excluidos } = await procurarParceiros(db, requisitos);
      return Response.json({
        success: true,
        requisitos,
        elegiveis: elegiveis.map((e) => ({
          partnerId: String(e.parceiro._id),
          nome: e.parceiro.nome,
          estado: e.parceiro.estado,
          score: e.parceiro.score,
          rank: e.rank,
        })),
        excluidos,
      });
    }

    const filtro: Record<string, unknown> = {};
    if (partnerId) filtro.partnerId = partnerId;
    const docs: any[] = await db.collection('crm_capabilities').find(filtro).sort({ categoria: 1, prioridade: 1 }).toArray();
    return Response.json({ success: true, capacidades: docs.map((d) => ({ ...d, _id: String(d._id) })) });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const body = await request.json();
    const partnerId = String(body.partnerId ?? '').trim();
    if (!partnerId) return Response.json({ error: 'partnerId é obrigatório' }, { status: 400 });
    if (!eCategoriaValida(body.categoria)) return Response.json({ error: 'categoria desconhecida' }, { status: 400 });

    const db = await getDb();
    await garantirIndices(db);

    const oid = paraOid(partnerId);
    if (!oid || !(await db.collection('crm_partners').countDocuments({ _id: oid as any }))) {
      return Response.json({ error: 'parceiro não encontrado' }, { status: 404 });
    }

    // Vazio quer dizer "as da ficha do parceiro" e nao "todo o pais". A regra vive em
    // lib/crm/zonas.ts, escrita uma vez: era estar em dois sitios que punha esta rota e
    // o PUT a discordar uma da outra.
    const zonas = zonasDeCapacidade(body.zonas);

    const doc: Omit<CrmCapability, '_id'> = {
      partnerId,
      categoria: body.categoria,
      zonas,
      maxWeightKg: numero(body.maxWeightKg),
      maxDimensionCm: numero(body.maxDimensionCm),
      adr: !!body.adr,
      temperatura: !!body.temperatura,
      tiposViatura: Array.isArray(body.tiposViatura) ? body.tiposViatura.map(String) : [],
      prioridade: Number.isFinite(Number(body.prioridade)) ? Number(body.prioridade) : 0,
      active: body.active !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res: any = await db.collection('crm_capabilities').insertOne(doc as any);
    return Response.json({ success: true, id: String(res.insertedId) }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}

function paraOid(id: string): ObjectId | null {
  try { return new ObjectId(id); } catch { return null; }
}
