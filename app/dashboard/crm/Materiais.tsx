'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Tipos de material do quiz — CRUD.
 *
 * A lista está separada em dois grupos, e a separação é o que interessa aqui:
 * **o que fazemos** e **o que não fazemos**. É essa distinção que decide se uma lead
 * segue para a operação própria ou vale como venda a um parceiro — e por isso não pode
 * estar escondida atrás da escolha de uma categoria numa lista.
 *
 * Ao criar, a pergunta vem primeiro ("fazemos isto?") e só quem responde "não" escolhe
 * a categoria. Assim ninguém marca um material como "expresso" a pensar que estava a
 * dizer "isto é nosso".
 */

type Categoria = { id: string; label: string; route: string };

type Material = {
  _id: string;
  valor: string;
  label: string;
  categoria: string | null;
  ordem: number;
  active: boolean;
};

const CARD: React.CSSProperties = {
  background: 'var(--yb-card)', borderRadius: 12,
  border: '1px solid var(--yb-border)', padding: '16px 18px', marginBottom: 12,
};
const TITULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--yb-subtle)', marginBottom: 12,
};
const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--yb-input)', border: '1px solid var(--yb-border)',
  color: 'var(--yb-fg)', borderRadius: 8, padding: '6px 9px', fontSize: 12,
  colorScheme: 'inherit' as const,
};

function botao(v: 'primario' | 'neutro' | 'perigo' = 'neutro'): React.CSSProperties {
  const c = {
    primario: { bg: 'rgba(0,188,212,0.15)', fg: 'var(--yb-cyan)', bd: 'rgba(0,188,212,0.35)' },
    neutro:   { bg: 'var(--yb-input)', fg: 'var(--yb-muted)', bd: 'var(--yb-border)' },
    perigo:   { bg: 'rgba(248,113,113,0.12)', fg: 'var(--yb-error)', bd: 'rgba(248,113,113,0.3)' },
  }[v];
  return {
    background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
    borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  };
}

export default function Materiais({ categorias }: { categorias: Categoria[] }) {
  const [lista, setLista] = useState<Material[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [novo, setNovo] = useState({ label: '', categoria: '', servimos: true });
  const [aCriar, setACriar] = useState(false);
  // Que linha acabou de ser gravada, para o dizer. Sem isto a interface e muda: os
  // campos mostram sempre o que a pessoa escreveu, gravado ou nao, e a unica forma de
  // saber se resultou era recarregar a pagina.
  const [gravado, setGravado] = useState<string | null>(null);

  // Só as da Linha B: um material nunca é "expresso" nem "arrasto" — isso sai da
  // urgência, não do que vai dentro da caixa.
  // Aqui a rota e mesmo o criterio: esta lista diz que material manda uma lead para
  // fora do ambito, e o transporte corrente nao manda.
  const naoServidas = categorias.filter((c) => c.route === 'lead_sale');

  const carregar = useCallback(async () => {
    // `no-store` tambem aqui: o cabecalho do servidor ja chega, mas esta lista e
    // relida logo a seguir a cada gravacao e nao pode vir de uma copia guardada.
    const r = await fetch('/api/crm/materiais?todos=1', { cache: 'no-store' })
      .then((x) => x.json()).catch(() => null);
    if (r?.success) setLista(r.materiais);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function guardar(m: Material, campos: Partial<Material>) {
    setErro('');
    setAviso('');
    const r = await fetch(`/api/crm/materiais/${m._id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campos),
    }).then((x) => x.json()).catch(() => null);
    if (r?.success) {
      setGravado(m._id);
      setTimeout(() => setGravado((g) => (g === m._id ? null : g)), 1800);
      carregar();
    } else {
      // Recarregar tambem no erro: os campos voltam ao que esta gravado, em vez de
      // ficarem a mostrar uma alteracao que nao aconteceu.
      setErro(r?.error ?? 'não foi possível guardar');
      carregar();
    }
  }

  async function apagar(m: Material) {
    setErro('');
    setAviso('');
    // Apagar tira a opcao do quiz para sempre. Uma linha que desaparece sem mais e
    // indistinguivel de uma linha que nao desapareceu — daqui a confirmacao.
    if (!confirm(`Apagar "${m.label}"? A opção deixa de existir. Se preferir só tirá-la do quiz, use "desactivar".`)) return;
    const r = await fetch(`/api/crm/materiais/${m._id}`, { method: 'DELETE' })
      .then((x) => x.json()).catch(() => null);
    if (r?.success) { setAviso(`"${m.label}" apagado.`); carregar(); }
    else setErro(r?.error ?? 'não foi possível apagar');
  }

  async function criar() {
    setErro('');
    const label = novo.label.trim();
    if (!label) { setErro('escreva o nome da opção'); return; }
    if (!novo.servimos && !novo.categoria) { setErro('escolha a que categoria pertence'); return; }

    setACriar(true);
    const r = await fetch('/api/crm/materiais', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valor: label, label,
        categoria: novo.servimos ? null : novo.categoria,
      }),
    }).then((x) => x.json()).catch(() => null);
    setACriar(false);
    if (r?.success) {
      setNovo({ label: '', categoria: '', servimos: true });
      setAviso(`"${label}" acrescentado a "${novo.servimos ? 'Serviços que fazemos' : 'Serviços que não fazemos'}".`);
      setGravado(r.id);
      setTimeout(() => setGravado((g) => (g === r.id ? null : g)), 1800);
      carregar();
    } else setErro(r?.error ?? 'não foi possível criar');
  }

  const nossos = lista.filter((m) => m.categoria == null);
  const alheios = lista.filter((m) => m.categoria != null);

  const linha = (m: Material) => (
    <div key={m._id} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
      borderBottom: '1px solid var(--yb-border)', opacity: m.active ? 1 : 0.45,
      // Numa lista de trinta linhas, a que acabou de mudar tem de se encontrar.
      background: gravado === m._id ? 'rgba(34,197,94,0.10)' : 'transparent',
      borderRadius: gravado === m._id ? 6 : 0,
    }}>
      {/* `key` no valor gravado: quando o servidor devolve outra coisa (ou recusa a
          alteracao), o campo e recriado com o que esta mesmo na base — em vez de ficar
          a mostrar o que a pessoa escreveu como se tivesse resultado. */}
      <input
        key={m.label}
        style={{ ...INPUT, flex: '1 1 180px' }}
        defaultValue={m.label}
        onBlur={(e) => { if (e.target.value.trim() !== m.label) guardar(m, { label: e.target.value }); }}
      />
      {gravado === m._id && (
        <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap' }}>guardado</span>
      )}
      {m.categoria != null && (
        <select style={{ ...INPUT, width: 'auto', minWidth: 150 }} value={m.categoria}
          onChange={(e) => guardar(m, { categoria: e.target.value })}>
          {naoServidas.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      )}
      <button onClick={() => guardar(m, { active: !m.active })} style={botao(m.active ? 'neutro' : 'primario')}>
        {m.active ? 'desactivar' : 'activar'}
      </button>
      <button onClick={() => apagar(m)} style={botao('perigo')}>apagar</button>
    </div>
  );

  return (
    <div style={CARD}>
      <p style={TITULO}>Tipos de material do quiz</p>
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 14px', lineHeight: 1.55 }}>
        O que a pessoa escolhe aqui decide a triagem. O <strong>texto</strong> muda-se à vontade;
        o valor gravado não, depois de alguma lead o ter usado — senão essas leads deixam de ter
        explicação. Para tirar uma opção de circulação sem partir o passado, <strong>desactive</strong>.
      </p>

      <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px dashed var(--yb-border)' }}>
        <p style={TITULO}>Acrescentar opção</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={{ ...INPUT, flex: '1 1 200px' }} placeholder="ex.: Piano / instrumentos pesados"
            value={novo.label} onChange={(e) => setNovo({ ...novo, label: e.target.value })} />

          <select style={{ ...INPUT, width: 'auto' }} value={novo.servimos ? 'sim' : 'nao'}
            onChange={(e) => setNovo({ ...novo, servimos: e.target.value === 'sim', categoria: '' })}>
            <option value="sim">Isto fazemos nós</option>
            <option value="nao">Isto não fazemos</option>
          </select>

          {!novo.servimos && (
            <select style={{ ...INPUT, width: 'auto', minWidth: 170 }} value={novo.categoria}
              onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}>
              <option value="">Que categoria?</option>
              {naoServidas.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}

          <button onClick={criar} disabled={aCriar} style={{ ...botao('primario'), opacity: aCriar ? 0.5 : 1 }}>
            {aCriar ? 'a criar...' : 'Acrescentar'}
          </button>
        </div>
      </div>


      {/* As mensagens vivem aqui, encostadas ao formulario e ao topo da lista. No fundo
          de um cartao com trinta linhas ninguem as via — e uma accao sem resposta visivel
          le-se como uma accao que falhou. */}
      {erro && (
        <p style={{
          fontSize: 12, color: 'var(--yb-error)', lineHeight: 1.5, margin: '0 0 12px',
          background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 8, padding: '9px 11px',
        }}>{erro}</p>
      )}
      {aviso && !erro && (
        <p style={{
          fontSize: 12, color: '#22c55e', lineHeight: 1.5, margin: '0 0 12px',
          background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 8, padding: '9px 11px',
        }}>{aviso}</p>
      )}

      <p style={{ ...TITULO, color: '#22c55e' }}>Serviços que fazemos ({nossos.length})</p>
      {nossos.map(linha)}

      <p style={{ ...TITULO, color: '#eab308', marginTop: 18 }}>
        Serviços que não fazemos ({alheios.length}) — estas leads valem como venda
      </p>
      {alheios.map(linha)}

    </div>
  );
}
