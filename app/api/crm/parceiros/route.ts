import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import type { CrmPartner } from '@/types/crm';
import { lerCarteirasEmLote } from '@/lib/crm/carteira';
import { lerConfig } from '@/lib/crm/config';
import { garantirIndices } from '@/lib/crm/indices';
import { limparZona } from '@/lib/crm/zonas';
import { ESTADOS_PARCEIRO } from '@/lib/crm/angariacao';
import { listarParceiros } from '@/lib/crm/listaParceiros';
import { limparDimensao, limparViaturas, ORDENS, type Ordem } from '@/lib/crm/filtros';
import { CATEGORIAS_DECLARAVEIS } from '@/lib/crm/categorias';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Parceiros do CRM (`crm_partners`).
 *
 *   GET  /api/crm/parceiros?estado=ativo
 *   POST /api/crm/parceiros   { nome, nif, contacto, telefone, email, canaisPreferidos, estado,
 *                               zonas, dimensao, viaturas, categorias }
 *
 * Não confundir com /api/parceiros, que é a tabela de tarifas dos parceiros logísticos
 * do serviço 24h. São coisas diferentes: aqui estão as empresas a quem se vendem leads
 * ou se subcontrata; lá estão os preços de tabela do arrasto.
 */

const ESTADOS: readonly string[] = ESTADOS_PARCEIRO;
const CANAIS = ['whatsapp', 'email', 'sms', 'push'];

/** O que um parceiro pode declarar que faz. Ver `declaravel` em lib/crm/categorias.ts. */
const CATEGORIAS_VENDA: readonly string[] = CATEGORIAS_DECLARAVEIS.map((c) => c.id);

/**
 * Lista de parceiros, com filtros, ordenação, paginação e a contagem para o mapa.
 *
 *   GET /api/crm/parceiros?q=&estado=&zona=&categoria=&dimensao=&ordem=&pagina=
 *
 * Os parâmetros de lista aceitam-se repetidos ou separados por vírgula: `?zona=porto&zona=braga`
 * e `?zona=porto,braga` são a mesma coisa. O primeiro é o que um formulário produz, o
 * segundo é o que se escreve à mão — não vale a pena obrigar a escolher.
 *
 * Continua a aceitar `?estado=` sozinho, que é como a interface antiga chamava isto.
 */
export async function GET(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { searchParams } = new URL(request.url);
    const lista = (nome: string): string[] => searchParams.getAll(nome)
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean);
    const sim = (nome: string) => searchParams.get(nome) === '1';

    const db = await getDb();
    const r = await listarParceiros(db, {
      q: searchParams.get('q') ?? undefined,
      estados: lista('estado').filter((e) => ESTADOS.includes(e)),
      zonas: lista('zona'),
      categorias: lista('categoria'),
      dimensoes: lista('dimensao'),
      atribuidoA: searchParams.get('atribuidoA') ?? undefined,
      activos: sim('activos'),
      comSaldo: sim('comSaldo'),
      paradosNaZona: sim('parados'),
      ordem: (ORDENS as readonly string[]).includes(searchParams.get('ordem') ?? '')
        ? (searchParams.get('ordem') as Ordem) : undefined,
      pagina: Number(searchParams.get('pagina')) || 1,
      porPagina: Number(searchParams.get('porPagina')) || undefined,
    });

    return Response.json({ success: true, ...r });
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
      // Escalão e viaturas: o que permite filtrar por quem aguenta o serviço. Ficam por
      // preencher sem estragar nada — "não disse" é diferente de "é pequena".
      dimensao: limparDimensao(body.dimensao),
      viaturas: limparViaturas(body.viaturas) ?? null,
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
    const id = String(res.insertedId);

    // As capacidades na mesma chamada que o parceiro.
    //
    // Antes so se podiam declarar depois, a abrir a ficha do parceiro ja criado — e um
    // parceiro sem capacidades nao aparece em distribuicao nenhuma. Quem se distraisse
    // no passo seguinte ficava com uma ficha que nunca recebia nada e nao dizia porque.
    //
    // `zonas: []` de proposito: herdam as da ficha, e passam a acompanha-las. Activas,
    // porque quem as marca aqui e a operadora e nao a propria empresa — ao contrario do
    // formulario publico, onde nascem adormecidas ate alguem confirmar.
    const categorias: string[] = Array.isArray(body.categorias)
      ? [...new Set<string>(body.categorias.map((c: unknown) => String(c)))]
        .filter((c) => (CATEGORIAS_VENDA as readonly string[]).includes(c))
      : [];

    if (categorias.length) {
      await db.collection('crm_capabilities').insertMany(categorias.map((categoria) => ({
        partnerId: id,
        categoria,
        zonas: [],
        maxWeightKg: null,
        maxDimensionCm: null,
        adr: categoria === 'adr',
        temperatura: categoria === 'temperatura',
        tiposViatura: [],
        prioridade: 0,
        active: true,
        origem: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as any);
    }

    return Response.json({ success: true, id, capacidades: categorias.length }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
