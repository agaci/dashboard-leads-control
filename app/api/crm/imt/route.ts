import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { DISTRITOS } from '@/lib/crm/zonas';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * A reserva do IMT — o registo nacional de transportadoras licenciadas.
 *
 *   GET  /api/crm/imt?distrito=&q=&internacional=&porPromover=&pagina=
 *   POST /api/crm/imt   { alvara, telefone?, email?, contacto? }   promove a parceiro
 *
 * **Não são parceiros.** São 7858 empresas que existem e têm alvará; nenhuma foi
 * contactada. Ficam numa colecção à parte porque metê-las em `crm_partners` saturava o
 * mapa, tornava a lista densa impossível de navegar e fazia "parceiro" deixar de querer
 * dizer alguma coisa.
 *
 * O caminho é o inverso do habitual: não se importa tudo e depois se filtra — vai-se lá
 * buscar uma empresa quando o quadro "Por servir" diz que falta alguém naquele distrito.
 */

const POR_PAGINA = 50;

export async function GET(request: NextRequest) {
  if (!(await operadorDaSessao())) return semSessao();

  try {
    const { searchParams } = new URL(request.url);
    const db = await getDb();
    const col = db.collection('imt_transportadoras');

    const filtro: Record<string, unknown> = {};

    const distrito = searchParams.get('distrito');
    if (distrito && (DISTRITOS as readonly string[]).includes(distrito)) filtro.distrito = distrito;
    if (distrito === 'sem') filtro.distrito = null;

    if (searchParams.get('internacional') === '1') filtro.internacional = true;

    // Quem ainda não foi promovido a parceiro. É a lista de trabalho: as outras já estão
    // no funil e trabalham-se lá.
    if (searchParams.get('porPromover') === '1') filtro.partnerId = null;

    const q = (searchParams.get('q') ?? '').trim();
    if (q) {
      // Sem índice de texto: a procura faz-se por prefixo do nome ou pelo alvará exacto,
      // que é o que uma pessoa tem à mão. Um `$regex` livre sobre 7858 documentos a cada
      // tecla não vale o que custa.
      const escapado = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filtro.$or = [
        { nome: { $regex: `^${escapado}`, $options: 'i' } },
        { alvara: q },
        { localidade: { $regex: `^${escapado}`, $options: 'i' } },
      ];
    }

    const pagina = Math.max(Number(searchParams.get('pagina')) || 1, 1);

    const [linhas, total] = await Promise.all([
      col.find(filtro).sort({ nome: 1 }).skip((pagina - 1) * POR_PAGINA).limit(POR_PAGINA).toArray(),
      col.countDocuments(filtro),
    ]);

    // A contagem por distrito não leva o filtro de distrito, pela mesma razão do mapa dos
    // parceiros: escolher um distrito não pode apagar os outros da vista de conjunto.
    const semDistrito = { ...filtro };
    delete semDistrito.distrito;
    const porDistrito: Record<string, number> = {};
    for (const d of await col.aggregate([
      { $match: semDistrito },
      { $group: { _id: '$distrito', n: { $sum: 1 } } },
    ]).toArray() as any[]) {
      porDistrito[d._id ?? 'sem'] = d.n;
    }

    return Response.json({
      success: true,
      linhas: linhas.map((l: any) => ({ ...l, _id: String(l._id) })),
      total,
      pagina,
      porPagina: POR_PAGINA,
      porDistrito,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Promove uma empresa da reserva a parceiro, no estado `prospect`.
 *
 * Exige telefone ou email, que a lista do IMT não tem: é a operadora que os traz, do site
 * da empresa ou de uma chamada. É de propósito que o sistema os peça aqui — um parceiro
 * sem contacto nenhum nunca poderia receber uma lead, e criá-lo era só adiar a descoberta.
 */
export async function POST(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const body = await request.json();
    const alvara = String(body.alvara ?? '').trim();
    if (!alvara) return Response.json({ error: 'falta o alvará' }, { status: 400 });

    const telefone = String(body.telefone ?? '').trim();
    const email = String(body.email ?? '').trim();
    if (!telefone && !email) {
      return Response.json(
        { error: 'é preciso telefone ou email — sem contacto não há como falar com eles' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const col = db.collection('imt_transportadoras');
    const linha: any = await col.findOne({ alvara });
    if (!linha) return Response.json({ error: 'empresa não encontrada na reserva' }, { status: 404 });
    if (linha.partnerId) {
      return Response.json({ error: 'esta empresa já foi promovida a parceiro' }, { status: 409 });
    }

    const agora = new Date();
    const morada = [linha.morada, `${linha.codigoPostal} ${linha.localidade}`.trim()]
      .filter(Boolean).join(', ');

    const doc = {
      nome: linha.nome,
      morada,
      alvara: linha.alvara,
      telefone: telefone || undefined,
      email: email || undefined,
      contacto: String(body.contacto ?? '').trim() || undefined,
      // O distrito da sede. É um ponto de partida: a empresa dirá depois o que cobre mesmo.
      zonas: linha.distrito ? [linha.distrito] : [],
      canaisPreferidos: ['email'],
      deviceTokens: [],
      estado: 'prospect',
      score: 50,
      leadsGratisRestantes: 0,
      origem: 'lista do IMT',
      // O que se sabe já escrito, para quem pegar nisto não ter de ir procurar outra vez.
      notas: [
        `Alvará IMT ${linha.alvara}.`,
        linha.internacional ? 'Âmbito nacional e internacional.' : 'Âmbito só nacional.',
        `Sede em ${linha.localidade}.`,
      ].join(' '),
      createdAt: agora,
      updatedAt: agora,
    };

    const res: any = await db.collection('crm_partners').insertOne(doc as any);
    const partnerId = String(res.insertedId);

    // A marca fica dos dois lados: a reserva deixa de o oferecer, e a ficha sabe de onde
    // veio. Sem isto, a mesma empresa era promovida duas vezes por duas pessoas.
    await col.updateOne({ alvara }, { $set: { partnerId, promovidoEm: agora, promovidoPor: operador.nome } });

    return Response.json({ success: true, partnerId }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
