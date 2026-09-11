import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import {
  categoriasOferecidas, dimensoesOferecidas, gravarRegisto, zonasOferecidas,
  type RespostasRegisto,
} from '@/lib/crm/registo';
import { COR } from '@/lib/email/layout';
import { esc } from '@/lib/html';
import { paginaConteudo, paginaHtml } from '@/lib/pagina';
import { validar } from '@/lib/crm/tokens';

/**
 * O formulário de registo de um parceiro.
 *
 *   GET  /api/crm/registo?p=<parceiro>&t=<token>   mostra o formulário
 *   POST /api/crm/registo?p=<parceiro>&t=<token>   grava
 *
 * É o botão da carta de apresentação. Público de propósito: quem o preenche é uma empresa
 * que nunca terá sessão no dashboard.
 *
 * **HTML servido, sem JavaScript.** Quem o abre fá-lo do telemóvel, muitas vezes com rede
 * fraca, e uma página que precisa de descarregar um framework para mostrar sete campos é
 * uma página que uma parte das pessoas nunca vê. Um `<form method="post">` chega, e
 * funciona em tudo.
 *
 * **Diz de que empresa se trata, no topo.** A carta pode ter sido reenviada para outro
 * endereço a pedido — é o caso normal — e quem a receba por engano tem de perceber logo,
 * em vez de registar capacidades na ficha errada.
 */

function paraOid(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}

const INPUT = `width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid ${COR.linha};border-radius:9px;font-size:15px;font-family:inherit;color:${COR.escuro};background:#fff`;
const LABEL = `display:block;font-size:13px;font-weight:600;color:${COR.escuro};margin:0 0 5px`;
const NOTA = `font-size:12px;color:${COR.suave};margin:4px 0 0;line-height:1.45`;

function campo(id: string, label: string, opts: { tipo?: string; nota?: string; valor?: string; obrigatorio?: boolean } = {}) {
  return `<div style="margin:0 0 16px">
<label style="${LABEL}" for="${id}">${esc(label)}${opts.obrigatorio === false ? ` <span style="font-weight:400;color:${COR.suave}">(opcional)</span>` : ''}</label>
<input style="${INPUT}" id="${id}" name="${id}" type="${opts.tipo ?? 'text'}" value="${esc(opts.valor ?? '')}"${opts.obrigatorio === false ? '' : ' required'}>
${opts.nota ? `<p style="${NOTA}">${esc(opts.nota)}</p>` : ''}
</div>`;
}

function formulario(partnerId: string, token: string, empresa: string, erro?: string): Response {
  const accao = `/api/crm/registo?p=${encodeURIComponent(partnerId)}&t=${encodeURIComponent(token)}`;

  const servicos = categoriasOferecidas().map((c) => `
<label style="display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border:1px solid ${COR.linha};border-radius:9px;margin:0 0 6px;cursor:pointer;background:#fff">
  <input type="checkbox" name="categorias" value="${esc(c.id)}" style="margin-top:3px;width:16px;height:16px;flex-shrink:0">
  <span>
    <span style="display:block;font-size:14px;font-weight:600;color:${COR.escuro}">${esc(c.label)}</span>
    <span style="display:block;font-size:12.5px;color:${COR.suave};line-height:1.45">${esc(c.descricao)}</span>
  </span>
</label>`).join('');

  // Radio e nao caixa de texto: um numero exacto esta desactualizado amanha, e um escalao
  // e coisa que alguem marca sem hesitar. Quem se recusa a escrever "somos 14" marca
  // "6 a 20" sem pensar duas vezes.
  const escaloes = dimensoesOferecidas().map((d) => `
<label style="display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border:1px solid ${COR.linha};border-radius:9px;margin:0 0 6px;cursor:pointer;background:#fff">
  <input type="radio" name="dimensao" value="${esc(d.id)}" style="margin-top:3px;width:16px;height:16px;flex-shrink:0" required>
  <span>
    <span style="display:block;font-size:14px;font-weight:600;color:${COR.escuro}">${esc(d.label)}</span>
    <span style="display:block;font-size:12.5px;color:${COR.suave};line-height:1.45">${esc(d.nota)}</span>
  </span>
</label>`).join('');

  const zonas = zonasOferecidas().map((z) => `
<label style="display:inline-flex;gap:6px;align-items:center;padding:5px 11px;border:1px solid ${COR.linha};border-radius:20px;margin:0 5px 6px 0;cursor:pointer;font-size:13px;background:#fff;text-transform:capitalize">
  <input type="checkbox" name="zonas" value="${esc(z)}" style="width:14px;height:14px">${esc(z)}
</label>`).join('');

  return paginaConteudo('Dizer o que fazemos e onde', `
<p style="font-size:12px;color:${COR.suave};text-transform:uppercase;letter-spacing:.6px;margin:0 0 4px">Ficha de parceiro</p>
<h1 style="font-size:22px;color:${COR.escuro};margin:0 0 6px;line-height:1.25">${esc(empresa)}</h1>
<p style="font-size:14px;color:${COR.texto};line-height:1.6;margin:0 0 4px">
  Se esta não é a vossa empresa, feche esta página &mdash; a ligação foi-vos enviada por engano.
</p>
<p style="font-size:14px;color:${COR.texto};line-height:1.6;margin:0 0 22px">
  Com isto preenchido, ficamos a saber que pedidos vos podemos passar. Não pedimos
  documentos nem dados de pagamento.
</p>

${erro ? `<p style="background:#fdf2f2;border:1px solid #f5c6c6;color:#a33;border-radius:9px;padding:11px 13px;font-size:14px;margin:0 0 18px">${esc(erro)}</p>` : ''}

<form method="post" action="${accao}">

  <p style="font-size:12px;color:${COR.suave};text-transform:uppercase;letter-spacing:.5px;margin:0 0 12px;padding-top:6px;border-top:1px solid ${COR.linha}">A empresa</p>
  ${campo('nif', 'NIF', { nota: 'Nove dígitos. Serve para confirmarmos a empresa e para a facturação, mais tarde.' })}
  ${campo('alvara', 'Alvará do IMT', { obrigatorio: false, nota: 'Se tiverem. Acelera a verificação do vosso lado e do nosso.' })}

  <p style="font-size:12px;color:${COR.suave};text-transform:uppercase;letter-spacing:.5px;margin:22px 0 12px;padding-top:14px;border-top:1px solid ${COR.linha}">Quem trata disto</p>
  ${campo('responsavel', 'Nome do responsável')}
  ${campo('cargo', 'Função', { obrigatorio: false, valor: '' })}
  ${campo('telefone', 'Telefone', { tipo: 'tel' })}
  ${campo('emailLeads', 'Email para receber os pedidos', { tipo: 'email', nota: 'É para aqui que enviamos os pedidos. Pode ser diferente do endereço por onde nos falámos.' })}

  <p style="font-size:12px;color:${COR.suave};text-transform:uppercase;letter-spacing:.5px;margin:22px 0 10px;padding-top:14px;border-top:1px solid ${COR.linha}">Quantos são</p>
  <p style="${NOTA};margin:0 0 10px">Ajuda-nos a saber que serviços vos podemos passar sem vos atrapalhar a agenda.</p>
  ${escaloes}
  <div style="margin:14px 0 0">
    <label style="${LABEL}" for="viaturas">Quantas viaturas <span style="font-weight:400;color:${COR.suave}">(opcional)</span></label>
    <input style="${INPUT}" id="viaturas" name="viaturas" type="number" min="0" max="9999" inputmode="numeric" placeholder="ex.: 4">
    <p style="${NOTA}">Aproximado chega. Conta as que usam para este tipo de trabalho.</p>
  </div>

  <p style="font-size:12px;color:${COR.suave};text-transform:uppercase;letter-spacing:.5px;margin:22px 0 10px;padding-top:14px;border-top:1px solid ${COR.linha}">Que serviços fazem</p>
  <p style="${NOTA};margin:0 0 10px">Escolham todos os que fazem. Cada um tem um tipo de pedido diferente.</p>
  ${servicos}

  <p style="font-size:12px;color:${COR.suave};text-transform:uppercase;letter-spacing:.5px;margin:22px 0 10px;padding-top:14px;border-top:1px solid ${COR.linha}">Que zonas cobrem</p>
  <label style="display:flex;gap:9px;align-items:center;padding:10px 12px;border:1px solid ${COR.avisoLinha};background:${COR.avisoFundo};border-radius:9px;margin:0 0 12px;cursor:pointer">
    <input type="checkbox" name="nacional" value="1" style="width:16px;height:16px">
    <span style="font-size:14px;font-weight:600;color:${COR.escuro}">Cobrimos o país todo</span>
  </label>
  <p style="${NOTA};margin:0 0 10px">Ou escolham os distritos:</p>
  <div>${zonas}</div>

  <div style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${COR.linha}">
    <label style="${LABEL}" for="notas">Mais alguma coisa que devamos saber <span style="font-weight:400;color:${COR.suave}">(opcional)</span></label>
    <textarea style="${INPUT};min-height:76px;resize:vertical" id="notas" name="notas" maxlength="600"
      placeholder="ex.: temos camião com plataforma elevatória; não fazemos ao fim-de-semana"></textarea>
  </div>

  <button type="submit" style="margin-top:20px;width:100%;background:${COR.escuro};color:#fff;border:0;border-radius:9px;padding:14px;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer">
    Enviar
  </button>

  <p style="${NOTA};margin-top:12px">
    Usamos estes dados apenas para vos enviar pedidos de transporte e falar convosco.
    Não os partilhamos com terceiros. Para os corrigir ou apagar, basta responder ao nosso email.
  </p>
</form>`);
}

async function ficha(partnerId: string) {
  const db = await getDb();
  const doc: any = await db.collection('crm_partners').findOne({ _id: paraOid(partnerId) });
  return { db, doc };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const partnerId = searchParams.get('p') ?? '';
  const token = searchParams.get('t') ?? '';

  if (!partnerId || !validar('registo', partnerId, token)) {
    return paginaHtml('Ligação inválida', 'Este link não é válido. Se recebeu esta mensagem por engano, ignore-a.', false);
  }

  try {
    const { doc } = await ficha(partnerId);
    if (!doc) return paginaHtml('Ligação inválida', 'Esta ficha já não existe.', false);
    if (doc.estado === 'opos_se') {
      return paginaHtml('Já não vos escrevemos',
        'Esta empresa pediu para não receber mais contactos nossos, e nós respeitamos isso. '
        + 'Se mudaram de ideias, respondam ao nosso último email.', false);
    }
    return formulario(partnerId, token, doc.nome ?? 'a vossa empresa');
  } catch (err: any) {
    console.error('[crm/registo] falha a mostrar', partnerId, err?.message ?? err);
    return paginaHtml('Não conseguimos abrir o formulário',
      'Houve um problema do nosso lado. Responda ao nosso email e tratamos disto à mão.', false);
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const partnerId = searchParams.get('p') ?? '';
  const token = searchParams.get('t') ?? '';

  if (!partnerId || !validar('registo', partnerId, token)) {
    return paginaHtml('Ligação inválida', 'Este link não é válido.', false);
  }

  try {
    const form = await request.formData();
    const texto = (k: string) => String(form.get(k) ?? '').trim();

    const respostas: RespostasRegisto = {
      nif: texto('nif'),
      alvara: texto('alvara'),
      dimensao: texto('dimensao'),
      viaturas: texto('viaturas'),
      responsavel: texto('responsavel'),
      cargo: texto('cargo'),
      telefone: texto('telefone'),
      emailLeads: texto('emailLeads'),
      categorias: form.getAll('categorias').map(String),
      zonas: form.getAll('zonas').map(String),
      nacional: form.get('nacional') === '1',
      notas: texto('notas'),
    };

    const { db, doc } = await ficha(partnerId);
    const r = await gravarRegisto(db, partnerId, respostas);

    // Erro de preenchimento devolve o formulário com o recado, e não uma página cega:
    // quem está a preencher isto do telemóvel não deve ter de recomeçar.
    if (!r.ok) return formulario(partnerId, token, doc?.nome ?? 'a vossa empresa', r.erro);

    return paginaHtml(
      'Recebido, obrigado',
      `Ficámos com a vossa ficha: ${r.capacidades} serviço(s) e as zonas que indicaram. `
      + 'Vamos confirmar os dados e falamos convosco antes de vos enviar o primeiro pedido.',
    );
  } catch (err: any) {
    console.error('[crm/registo] falha a gravar', partnerId, err?.message ?? err);
    return paginaHtml('Não conseguimos gravar',
      'Houve um problema do nosso lado, e os dados não se perderam do vosso: responda ao '
      + 'nosso email e tratamos disto à mão.', false);
  }
}
