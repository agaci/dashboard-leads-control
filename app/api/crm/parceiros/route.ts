import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import type { CrmPartner } from '@/types/crm';
import { lerCarteirasEmLote } from '@/lib/crm/carteira';
import { lerConfig } from '@/lib/crm/config';
import { garantirIndices } from '@/lib/crm/indices';
import { limparZona } from '@/lib/crm/zonas';
import { ESTADOS_PARCEIRO } from '@/lib/crm/angariacao';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Parceiros do CRM (`crm_partners`).
 *
 *   GET  /api/crm/parceiros?estado=ativo
 *   POST /api/crm/parceiros   { nome, nif, contacto, telefone, email, canaisPreferidos, estado }
 *
 * Não confundir com /api/parceiros, que é a tabela de tarifas dos parceiros logísticos
 * do serviço 24h. São coisas diferentes: aqui estão as empresas a quem se vendem leads
 * ou se subcontrata; lá estão os preços de tabela do arrasto.
 */

const ESTADOS: readonly string[] = ESTADOS_PARCEIRO;
const CANAIS = ['whatsapp', 'email', 'sms', 'push'];

export async function GET(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');

    const db = await getDb();
    const filtro: Record<string, unknown> = {};
    if (estado && ESTADOS.includes(estado)) filtro.estado = estado;

    const docs: any[] = await db.collection('crm_partners').find(filtro).sort({ estado: 1, score: -1, nome: 1 }).toArray();
    const parceiros = docs.map((d) => ({ ...d, _id: String(d._id) }));

    // O saldo vem junto: sem ele a lista não diz quem está em condições de receber leads,
    // que é a primeira coisa que a operadora quer saber.
    const carteiras = await lerCarteirasEmLote(db, parceiros.map((p) => p._id));

    return Response.json({
      success: true,
      parceiros: parceiros.map((p) => ({ ...p, saldo: carteiras.get(p._id)?.saldo ?? 0 })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const body = await request.json();
    const nome = String(body.nome ?? '').trim();
    if (!nome) return Response.json({ error: 'nome é obrigatório' }, { status: 400 });

    const telefone = String(body.telefone ?? '').trim();
    const email = String(body.email ?? '').trim();
    if (!telefone && !email) {
      // Um parceiro sem contacto nenhum nunca poderia receber uma lead. Melhor recusar
      // já do que descobrir na distribuição.
      return Response.json({ error: 'é preciso telefone ou email — sem contacto não há canal de entrega' }, { status: 400 });
    }

    const db = await getDb();
    await garantirIndices(db);
    const cfg = await lerConfig(db);

    const estado = ESTADOS.includes(body.estado) ? body.estado : 'prospect';
    const doc: Omit<CrmPartner, '_id'> = {
      nome,
      nif: String(body.nif ?? '').trim() || undefined,
      contacto: String(body.contacto ?? '').trim() || undefined,
      telefone: telefone || undefined,
      email: email || undefined,
      morada: String(body.morada ?? '').trim() || undefined,
      // Vazio = nacional. As capacidades herdam daqui quando nao declaram as suas.
      zonas: Array.isArray(body.zonas) ? body.zonas.map((z: string) => limparZona(String(z))).filter(Boolean) : [],
      canaisPreferidos: Array.isArray(body.canaisPreferidos)
        ? body.canaisPreferidos.filter((c: string) => CANAIS.includes(c))
        : [],
      deviceTokens: [],
      estado,
      score: 50,   // ver lib/crm/outcomes.ts: sem histórico, nem prémio nem castigo
      // As 5 leads grátis da angariação não são grátis: são pagas em reporte (spec §6.1).
      leadsGratisRestantes: estado === 'trial' ? cfg.leadsGratisTrial : 0,
      notas: String(body.notas ?? '').trim() || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res: any = await db.collection('crm_partners').insertOne(doc as any);
    return Response.json({ success: true, id: String(res.insertedId) }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
