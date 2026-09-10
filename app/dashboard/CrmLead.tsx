'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * O CRM de Parceiros, visto de dentro da ficha da lead.
 *
 * A operadora trabalha aqui, no separador Leads — não no separador CRM. Uma lead que a
 * YourBox não serve tem de o dizer no sítio onde ela está a olhar, no momento em que
 * pega no telefone. Obrigá-la a ir procurar a consulta correspondente noutro separador
 * era garantir que ninguém o faria.
 *
 * Nas leads da Linha B mostra o ciclo todo: categoria, autorização, distribuição.
 *
 * Nas outras — a esmagadora maioria — mostra apenas uma linha discreta a dizer que a
 * triagem as deu como serviços nossos, com a hipótese de corrigir. Essa correcção existe
 * porque a triagem lê o formulário e a gerente de conta fala com a pessoa: ao telefone
 * descobre-se que o piano é de cauda ou que o carro não pega, e a conclusão muda. Sem
 * este caminho, uma lead assim não tinha como chegar aos parceiros.
 */

type Consulta = {
  _id: string;
  categoria: string;
  estado: string;
  route: string;
  valorLead?: number;
  triagem: { motivo: string; confianca: string };
  consentimento?: { em: string; via: string; actor: string } | null;
  reclassificacao?: { em: string; actor: string; motivo: string } | null;
};

type CategoriaOpcao = { id: string; label: string; route: string; descricao: string };

/** Estados a partir dos quais a lead já saiu para alguém e não se reclassifica. */
const FECHADOS = [
  'distribuída', 'entregue', 'em_reporte', 'fechada', 'recusada', 'expirada',
  'proposta_enviada', 'adjudicada', 'em_execução', 'concluída',
];

const ROTULO: Record<string, string> = {
  adr: 'ADR / radioactivo',
  temperatura: 'Temperatura controlada',
  viaturas: 'Transporte de viaturas',
  mudancas: 'Mudanças',
  fora_gabarito: 'Fora de gabarito',
  sobrepeso: 'Peso acima da capacidade',
};

export default function CrmLead({ leadId, aoAbrirCrm }: { leadId: string; aoAbrirCrm?: () => void }) {
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [guiao, setGuiao] = useState<{ versao: string; texto: string } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState('');
  const [aCorrigir, setACorrigir] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/crm/consultas?leadId=${encodeURIComponent(leadId)}&limit=1`)
      .then((x) => x.json()).catch(() => null);
    const c = r?.success && r.consultas?.[0] ? r.consultas[0] : null;
    setConsulta(c);
    if (c && !c.consentimento) {
      fetch(`/api/crm/consultas/${c._id}/consentimento`)
        .then((x) => x.json())
        .then((g) => { if (g?.success) setGuiao(g.guiao); })
        .catch(() => {});
    }
  }, [leadId]);

  useEffect(() => { carregar(); }, [carregar]);


  async function registar(via: 'telefone' | 'email') {
    if (!consulta) return;
    setAGravar(true);
    setErro('');
    const r = await fetch(`/api/crm/consultas/${consulta._id}/consentimento`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ via }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) carregar();
    else setErro(r?.error ?? 'não foi possível registar');
  }

  const autorizado = !!consulta?.consentimento;
  const linhaB = consulta?.route === 'lead_sale';
  // Sem consulta a lead e servivel e nunca abriu nenhuma — da para corrigir na mesma.
  const podeCorrigir = !consulta || !FECHADOS.includes(consulta.estado);

  // Lead servivel: uma linha discreta, e o caminho para a corrigir. A esmagadora maioria
  // das leads passa por aqui e nao deve ganhar ruido por causa do CRM.
  if (!linhaB) {
    if (!podeCorrigir) return null;
    return (
      <div style={{ marginTop: 12 }}>
        {aCorrigir ? (
          <Corrigir
            leadId={leadId}
            categoriaActual={consulta?.categoria}
            paraLinhaB
            aoFechar={() => setACorrigir(false)}
            aoGravar={() => { setACorrigir(false); carregar(); }}
          />
        ) : (
          <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: 0, lineHeight: 1.6 }}>
            Esta lead está como serviço nosso.{' '}
            <button onClick={() => setACorrigir(true)} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 11, color: 'var(--yb-cyan)', fontWeight: 600, textDecoration: 'underline',
            }}>
              Não conseguimos fazer — passar para parceiros
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card p-5 shadow-card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: 'rgba(234,179,8,0.15)', color: '#eab308',
          border: '1px solid rgba(234,179,8,0.35)', borderRadius: 10, padding: '2px 8px',
        }}>Não servível</span>
        <strong style={{ fontSize: 14, color: 'var(--yb-fg)' }}>
          {ROTULO[consulta.categoria] ?? consulta.categoria}
        </strong>
        {consulta.valorLead ? (
          <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>
            vale {consulta.valorLead.toFixed(2)} EUR
          </span>
        ) : null}
      </div>

      <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        {consulta!.triagem.motivo}
        {consulta!.triagem.confianca !== 'alta' && (
          <span style={{ color: '#eab308' }}> · confiança {consulta!.triagem.confianca}, confirme a categoria</span>
        )}
      </p>

      {consulta!.reclassificacao && (
        <p style={{ fontSize: 11, color: 'var(--yb-cyan)', margin: '-6px 0 12px', lineHeight: 1.5 }}>
          Corrigida por {consulta!.reclassificacao.actor} em{' '}
          {new Date(consulta!.reclassificacao.em).toLocaleString('pt-PT')}: {consulta!.reclassificacao.motivo}
        </p>
      )}

      {aCorrigir && (
        <Corrigir
          leadId={leadId}
          categoriaActual={consulta!.categoria}
          aoFechar={() => setACorrigir(false)}
          aoGravar={() => { setACorrigir(false); carregar(); }}
        />
      )}

      {autorizado ? (
        <>
          <p style={{ fontSize: 12, color: '#22c55e', margin: '0 0 10px' }}>
            Cliente autorizou o encaminhamento em{' '}
            {new Date(consulta.consentimento!.em).toLocaleString('pt-PT')}
            {' '}(via {consulta.consentimento!.via}, registado por {consulta.consentimento!.actor}).
          </p>
          {/* Muda de separador em vez de navegar: /dashboard/crm e uma rota que
              renderiza o componente sem o AppShell, e a pagina abria sem barra lateral
              nem logo. O CRM so existe dentro do dashboard. */}
          <button onClick={aoAbrirCrm} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 12, color: 'var(--yb-cyan)', fontWeight: 600,
          }}>
            Abrir no CRM para distribuir →
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 6px' }}>
            Leia isto ao cliente, tal como está. É este texto que fica guardado como prova.
          </p>
          <p style={{
            fontSize: 13, color: 'var(--yb-fg)', lineHeight: 1.6, margin: '0 0 12px',
            background: 'var(--yb-input)', padding: '10px 12px', borderRadius: 8,
            borderLeft: '3px solid var(--yb-cyan)',
          }}>
            {guiao ? guiao.texto : 'a carregar o guião...'}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => registar('telefone')} disabled={aGravar || !guiao} style={{
              background: 'rgba(0,188,212,0.15)', color: 'var(--yb-cyan)',
              border: '1px solid rgba(0,188,212,0.35)', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              cursor: aGravar || !guiao ? 'default' : 'pointer', opacity: aGravar || !guiao ? 0.4 : 1,
            }}>{aGravar ? 'a registar...' : 'Autorizou, ao telefone'}</button>
            <button onClick={() => registar('email')} disabled={aGravar || !guiao} style={{
              background: 'var(--yb-input)', color: 'var(--yb-muted)',
              border: '1px solid var(--yb-border)', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              cursor: aGravar || !guiao ? 'default' : 'pointer', opacity: aGravar || !guiao ? 0.4 : 1,
            }}>Autorizou, por email</button>
            <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>
              Se recusar, não registe nada.
            </span>
          </div>
        </>
      )}

      {erro && <p style={{ fontSize: 11, color: 'var(--yb-error)', margin: '8px 0 0' }}>{erro}</p>}

      {/* O caminho inverso. Uma consulta que fica aberta por engano suja o quadro de
          "Por servir", que e o que orienta a angariacao de parceiros — e manda as
          gerentes de conta atras de mercado que nao existe. */}
      {podeCorrigir && !aCorrigir && (
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '12px 0 0', paddingTop: 10, borderTop: '1px solid var(--yb-border)' }}>
          <button onClick={() => setACorrigir(true)} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 11, color: 'var(--yb-muted)', fontWeight: 600, textDecoration: 'underline',
          }}>
            Categoria errada, ou afinal fazemos nós
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Corrigir a triagem.
 *
 * A categoria escolhe-se a mao de proposito: a triagem ja errou uma vez neste caso, nao
 * faz sentido pedir-lhe um segundo palpite — e e a categoria que decide que parceiros
 * recebem a lead e quanto ela custa.
 *
 * O motivo e obrigatorio, e nao e burocracia: e o unico sitio onde fica escrito porque e
 * que a triagem falhou, escrito no momento em que se sabe. Ao fim de umas dezenas, as
 * regras corrigem-se com dados em vez de palpites.
 */
function Corrigir({ leadId, categoriaActual, paraLinhaB, aoFechar, aoGravar }: {
  leadId: string;
  categoriaActual?: string;
  paraLinhaB?: boolean;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [categorias, setCategorias] = useState<CategoriaOpcao[]>([]);
  const [categoria, setCategoria] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    fetch('/api/crm/reclassificar')
      .then((x) => x.json())
      .then((r) => { if (r?.success) setCategorias(r.categorias); })
      .catch(() => {});
  }, []);

  async function gravar() {
    setErro('');
    if (!categoria) { setErro('escolha a categoria'); return; }
    if (motivo.trim().length < 3) { setErro('diga porque e que a triagem estava errada'); return; }
    setAGravar(true);
    const r = await fetch('/api/crm/reclassificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, categoria, motivo }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) aoGravar();
    else setErro(r?.error ?? 'nao foi possivel corrigir');
  }

  // A lista abre pela linha que interessa a quem carregou no botao, mas mostra as duas:
  // as vezes o que muda nao e a linha, e so a categoria dentro dela.
  const ordenadas = [...categorias].sort((a, b) => {
    const alvo = paraLinhaB ? 'lead_sale' : 'subcontract';
    return (a.route === alvo ? 0 : 1) - (b.route === alvo ? 0 : 1);
  });

  return (
    <div style={{
      background: 'var(--yb-input)', border: '1px solid var(--yb-border)',
      borderRadius: 10, padding: '12px 14px', marginBottom: 12,
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--yb-fg)', margin: '0 0 3px' }}>
        Corrigir a triagem
      </p>
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 10px', lineHeight: 1.5 }}>
        A categoria decide que parceiros recebem a lead e quanto ela custa, por isso escolhe-se
        a mao. Depois de gravada, a lead segue o caminho normal da linha nova.
      </p>

      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={CAMPO}>
        <option value="">escolher categoria...</option>
        {ordenadas.map((c) => (
          <option key={c.id} value={c.id} disabled={c.id === categoriaActual}>
            {c.route === 'lead_sale' ? 'Parceiros' : 'Fazemos nos'} — {c.label}
            {c.id === categoriaActual ? ' (actual)' : ''}
          </option>
        ))}
      </select>

      <textarea
        value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={400}
        placeholder="porque e que a triagem estava errada? ex.: ao telefone percebeu-se que o piano e de cauda"
        style={{ ...CAMPO, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }}
      />

      {erro && <p style={{ fontSize: 11, color: 'var(--yb-error)', margin: '8px 0 0' }}>{erro}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={gravar} disabled={aGravar} style={{
          background: 'rgba(0,188,212,0.15)', color: 'var(--yb-cyan)',
          border: '1px solid rgba(0,188,212,0.35)', borderRadius: 8,
          padding: '7px 14px', fontSize: 12, fontWeight: 600,
          cursor: aGravar ? 'wait' : 'pointer', opacity: aGravar ? 0.5 : 1,
        }}>{aGravar ? 'a gravar...' : 'Gravar'}</button>
        <button onClick={aoFechar} style={{
          background: 'none', border: 'none', padding: '7px 4px', cursor: 'pointer',
          fontSize: 12, color: 'var(--yb-subtle)',
        }}>Cancelar</button>
      </div>
    </div>
  );
}

const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
  borderRadius: 7, border: '1px solid var(--yb-border)',
  background: 'var(--yb-card)', color: 'var(--yb-fg)',
  fontSize: 12, outline: 'none',
};
