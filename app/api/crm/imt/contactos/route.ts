import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { procurarContactos } from '@/lib/crm/contactos';
import { operadorDaSessao, semSessao } from '@/lib/crm/sessao';

/**
 * Procurar por onde falar com uma empresa da reserva do IMT.
 *
 *   POST /api/crm/imt/contactos   { alvara, site?, forcar? }
 *
 * **Sugere, não grava na ficha.** Devolve o que encontrou para a operadora olhar antes de
 * criar o parceiro: o Google acerta na empresa errada quando há nomes parecidos, e um
 * telefone errado numa ficha é um telefonema a quem não devia.
 *
 * **Guarda o resultado na linha do IMT.** Reabrir a mesma empresa não volta a perguntar
 * ao Google — nem a pagar. `forcar` obriga a perguntar outra vez, para quando o que ficou
 * guardado estava errado.
 */
export async function POST(request: NextRequest) {
  const operador = await operadorDaSessao();
  if (!operador) return semSessao();

  try {
    const body = await request.json();
    const alvara = String(body.alvara ?? '').trim();
    if (!alvara) return Response.json({ error: 'falta o alvará' }, { status: 400 });

    const db = await getDb();
    const col = db.collection('imt_transportadoras');
    const linha: any = await col.findOne({ alvara });
    if (!linha) return Response.json({ error: 'empresa não encontrada na reserva' }, { status: 404 });

    const site = String(body.site ?? '').trim();

    // Só se guarda — e só se repete — o que serviu para alguma coisa.
    //
    // A primeira versão guardava tudo, falhas incluídas. Enquanto a Places API esteve por
    // activar, a mensagem de erro ficou congelada na linha e era devolvida sem sequer se
    // perguntar ao Google: a API voltou, e o ecrã continuou a dizer que não. Uma falha é
    // quase sempre passageira — a chave que falta, a quota do dia, o site em baixo — e
    // guardá-la é transformar um problema de um minuto num problema para sempre.
    const util = (c: any) => !!(c?.telefone || c?.site || c?.emails?.length);

    if (util(linha.contactos) && !body.forcar && !site) {
      return Response.json({ success: true, contactos: linha.contactos, deCache: true });
    }

    const morada = [linha.morada, linha.codigoPostal, linha.localidade].filter(Boolean).join(', ');
    const contactos = await procurarContactos(linha.nome, morada, site || undefined);

    if (util(contactos)) {
      await col.updateOne(
        { alvara },
        { $set: { contactos, contactosEm: new Date(), contactosPor: operador.nome } },
      );
    } else {
      // Limpa o que lá estivesse: uma falha guardada antes não pode sobreviver a esta.
      await col.updateOne({ alvara }, { $unset: { contactos: '', contactosEm: '', contactosPor: '' } });
    }

    return Response.json({ success: true, contactos, deCache: false });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
