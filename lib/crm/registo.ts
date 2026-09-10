import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { CrmContacto, CrmPartner } from '@/types/crm';
import { CATEGORIAS_ORDENADAS } from './categorias';
import { DISTRITOS, limparZona } from './zonas';
import { mudarEstadoParceiro, registarInteraccao } from './prospectos';

/**
 * O formulário onde a empresa diz o que faz e onde.
 *
 * É o único sítio em toda a angariação onde alguém de fora escreve na base de dados, e é
 * a peça que decide se isto poupa trabalho ou se o cria. **As respostas geram capacidades,
 * não texto:** se "tipo de serviço" e "zonas" chegassem como frases, uma gerente de conta
 * teria de as traduzir à mão para linhas de `crm_capabilities` — e enquanto isso não
 * acontecesse, o parceiro não recebia uma única lead, porque a distribuição cruza
 * capacidades e não descrições.
 *
 * **As capacidades nascem inactivas.** Ficam declaradas e adormecidas até a gerente de
 * conta as verificar. Qualquer pessoa marca "ADR" num formulário; uma lead de ADR vale
 * €60 e envolve mercadoria perigosa.
 *
 * Sete campos, e não cinco. Os dois acrescentados — NIF e alvará — são o que permite
 * confirmar que a empresa existe, desduplicar, e facturar mais tarde.
 */

export interface RespostasRegisto {
  nif: string;
  alvara?: string;
  responsavel: string;
  cargo?: string;
  telefone: string;
  emailLeads: string;
  categorias: string[];
  zonas: string[];
  nacional: boolean;
  notas?: string;
}

export interface ResultadoRegisto {
  ok: boolean;
  erro?: string;
  capacidades?: number;
}

/** As categorias que se oferecem: só as da venda de leads. A Linha A não se declara aqui. */
export function categoriasOferecidas(): { id: string; label: string; descricao: string }[] {
  return CATEGORIAS_ORDENADAS
    .filter((c) => c.route === 'lead_sale')
    .map((c) => ({ id: c.id, label: c.label, descricao: c.descricao }));
}

export function zonasOferecidas(): readonly string[] {
  return DISTRITOS;
}

function paraOid(id: string): any {
  try { return new ObjectId(id); } catch { return id; }
}

/**
 * Valida o que a empresa preencheu.
 *
 * Do lado do servidor e não só no browser: o formulário é público, e quem quiser salta-o.
 * Nada aqui é cosmético — cada regra corresponde a um campo sem o qual a ficha não serve
 * para distribuir uma lead.
 */
export function validarRespostas(r: Partial<RespostasRegisto>): { ok: boolean; erro?: string } {
  const nif = String(r.nif ?? '').replace(/\D/g, '');
  if (nif.length !== 9) return { ok: false, erro: 'O NIF tem de ter nove dígitos.' };

  if (!String(r.responsavel ?? '').trim()) return { ok: false, erro: 'Falta o nome do responsável.' };

  const tel = String(r.telefone ?? '').replace(/[\s.-]/g, '');
  if (tel.replace(/\D/g, '').length < 9) return { ok: false, erro: 'O telefone não parece completo.' };

  const email = String(r.emailLeads ?? '').trim();
  if (!email.includes('@') || !email.includes('.')) return { ok: false, erro: 'O email não é válido.' };

  if (!(r.categorias ?? []).length) return { ok: false, erro: 'Escolha pelo menos um tipo de serviço.' };

  const conhecidas = new Set(categoriasOferecidas().map((c) => c.id));
  if ((r.categorias ?? []).some((c) => !conhecidas.has(c))) {
    return { ok: false, erro: 'Tipo de serviço desconhecido.' };
  }

  if (!r.nacional && !(r.zonas ?? []).length) {
    return { ok: false, erro: 'Escolha as zonas que cobrem, ou marque todo o país.' };
  }

  return { ok: true };
}

/**
 * Grava o registo.
 *
 * Repetível de propósito: uma empresa que corrija o que preencheu não deve ficar com duas
 * fichas nem com capacidades a dobrar. As capacidades criadas por aqui ficam marcadas com
 * `origem: 'formulario'` e são substituídas a cada submissão — as que uma gerente de conta
 * tenha criado à mão não são tocadas.
 */
export async function gravarRegisto(
  db: Db,
  partnerId: string,
  r: RespostasRegisto,
): Promise<ResultadoRegisto> {
  const doc: any = await db.collection('crm_partners').findOne({ _id: paraOid(partnerId) });
  if (!doc) return { ok: false, erro: 'ficha não encontrada' };
  const parceiro = { ...doc, _id: String(doc._id) } as CrmPartner;

  if (parceiro.estado === 'opos_se') {
    return { ok: false, erro: 'esta empresa pediu para não ser contactada' };
  }

  const valido = validarRespostas(r);
  if (!valido.ok) return { ok: false, erro: valido.erro };

  const agora = new Date();
  const emailLeads = r.emailLeads.trim().toLowerCase();
  const zonas = r.nacional ? [] : (r.zonas ?? []).map(limparZona).filter(Boolean);

  // O responsável entra como contacto e é ele que recebe as leads. Os contactos antigos
  // ficam — o `geral@` por onde se chegou à empresa continua a ser um endereço válido —
  // mas perdem a marca, porque duas pessoas a receber a mesma lead são duas a ligar ao
  // mesmo cliente.
  const anteriores = (parceiro.contactos ?? [])
    .filter((c) => String(c.email ?? '').toLowerCase() !== emailLeads)
    .map((c) => ({ ...c, recebeLeads: false }));

  const responsavel: CrmContacto = {
    nome: r.responsavel.trim(),
    cargo: String(r.cargo ?? '').trim() || undefined,
    email: emailLeads,
    telefone: r.telefone.trim(),
    recebeLeads: true,
    notas: 'indicado no formulário de registo',
  };

  await db.collection('crm_partners').updateOne(
    { _id: paraOid(partnerId) },
    {
      $set: {
        nif: r.nif.replace(/\D/g, ''),
        alvara: String(r.alvara ?? '').trim() || undefined,
        telefone: parceiro.telefone || r.telefone.trim(),
        email: parceiro.email || emailLeads,
        contactos: [responsavel, ...anteriores],
        zonas,
        registoEm: agora,
        updatedAt: agora,
      },
    },
  );

  // Substitui as capacidades que este formulário criou; não toca nas feitas à mão.
  await db.collection('crm_capabilities').deleteMany({ partnerId: String(partnerId), origem: 'formulario' } as any);

  const capacidades = (r.categorias ?? []).map((categoria) => ({
    partnerId: String(partnerId),
    categoria,
    zonas,                    // vazio = herda as do parceiro (lib/crm/zonas.ts)
    maxWeightKg: null,
    maxDimensionCm: null,
    adr: categoria === 'adr',
    temperatura: categoria === 'temperatura',
    prioridade: 0,
    // Adormecidas até alguém verificar. Ver o cabeçalho deste ficheiro.
    active: false,
    origem: 'formulario',
    createdAt: agora,
    updatedAt: agora,
  }));
  if (capacidades.length) await db.collection('crm_capabilities').insertMany(capacidades as any);

  const resumo = [
    `Formulário preenchido por ${responsavel.nome}`,
    `${capacidades.length} serviço(s): ${r.categorias.join(', ')}`,
    zonas.length ? `zonas: ${zonas.join(', ')}` : 'cobertura nacional',
    `leads para ${emailLeads}`,
    String(r.notas ?? '').trim() ? `nota: ${String(r.notas).trim().slice(0, 300)}` : '',
  ].filter(Boolean).join(' · ');

  await registarInteraccao(db, partnerId, 'formulario', resumo, 'a própria empresa');

  // Só avança quem ainda estava atrás. Uma empresa em avaliação que corrige o formulário
  // não deve recuar no funil por causa disso.
  if (['prospect', 'contactado'].includes(parceiro.estado)) {
    await mudarEstadoParceiro(db, partnerId, 'registado',
      'preencheu o formulário e declarou serviços e zonas', 'a própria empresa');
  }

  return { ok: true, capacidades: capacidades.length };
}
