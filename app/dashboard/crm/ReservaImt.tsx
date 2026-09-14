'use client';

import { useCallback, useEffect, useState } from 'react';
import { DISTRITOS, nomeZona } from '@/lib/crm/zonas';

/**
 * A reserva do IMT — o registo nacional de transportadoras licenciadas.
 *
 * **Não são parceiros.** São empresas que existem e têm alvará, e mais nada: ninguém
 * falou com elas. Por isso vivem à parte, e não na lista de parceiros — sete mil e
 * oitocentas fichas saturavam o mapa em todos os distritos e faziam "parceiro" deixar de
 * querer dizer alguma coisa.
 *
 * **O caminho é o inverso do habitual.** Não se importa tudo e depois se filtra: vai-se
 * aqui buscar uma empresa quando o quadro "Por servir" diz que falta alguém num distrito.
 * Por isso a coluna dos distritos está sempre à vista, e o filtro abre em "por promover".
 *
 * Promover pede telefone ou email, que esta lista não tem — é a operadora que os traz, do
 * site da empresa ou de uma chamada. Um parceiro sem contacto nenhum nunca poderia
 * receber uma lead, e criá-lo era só adiar a descoberta.
 */

type Linha = {
  _id: string;
  alvara: string;
  nome: string;
  morada: string;
  codigoPostal: string;
  localidade: string;
  distrito: string | null;
  internacional: boolean;
  partnerId: string | null;
  promovidoPor?: string;
};

const CARD: React.CSSProperties = {
  background: 'var(--yb-card)', borderRadius: 12,
  border: '1px solid var(--yb-border)', padding: '16px 18px', marginBottom: 12,
};
const TITULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--yb-subtle)', marginBottom: 10,
};
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--yb-input)',
  border: '1px solid var(--yb-border)', color: 'var(--yb-fg)', borderRadius: 8,
  padding: '7px 10px', fontSize: 13,
};

function chip(activo: boolean): React.CSSProperties {
  return {
    background: activo ? 'rgba(0,188,212,0.15)' : 'var(--yb-input)',
    color: activo ? 'var(--yb-cyan)' : 'var(--yb-muted)',
    border: `1px solid ${activo ? 'rgba(0,188,212,0.35)' : 'var(--yb-border)'}`,
    borderRadius: 20, padding: '3px 10px', fontSize: 11,
    fontWeight: activo ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function botao(primario = false): React.CSSProperties {
  return {
    background: primario ? 'rgba(0,188,212,0.15)' : 'var(--yb-input)',
    color: primario ? 'var(--yb-cyan)' : 'var(--yb-muted)',
    border: `1px solid ${primario ? 'rgba(0,188,212,0.35)' : 'var(--yb-border)'}`,
    borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  };
}

export default function ReservaImt() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [porDistrito, setPorDistrito] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [aCarregar, setACarregar] = useState(true);

  const [q, setQ] = useState('');
  const [qEfectivo, setQEfectivo] = useState('');
  const [distrito, setDistrito] = useState('');
  const [internacional, setInternacional] = useState(false);
  const [porPromover, setPorPromover] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQEfectivo(q); setPagina(1); }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const carregar = useCallback(async () => {
    setACarregar(true);
    const p = new URLSearchParams();
    if (qEfectivo.trim()) p.set('q', qEfectivo.trim());
    if (distrito) p.set('distrito', distrito);
    if (internacional) p.set('internacional', '1');
    if (porPromover) p.set('porPromover', '1');
    p.set('pagina', String(pagina));

    const r = await fetch(`/api/crm/imt?${p}`, { cache: 'no-store' })
      .then((x) => x.json()).catch(() => null);
    setACarregar(false);
    if (r?.success) {
      setLinhas(r.linhas ?? []);
      setTotal(r.total ?? 0);
      setPorDistrito(r.porDistrito ?? {});
    }
  }, [qEfectivo, distrito, internacional, porPromover, pagina]);

  useEffect(() => { carregar(); }, [carregar]);

  const paginas = Math.max(1, Math.ceil(total / 50));

  return (
    <>
      <div style={CARD}>
        <p style={TITULO}>Reserva do IMT</p>
        <p style={{ fontSize: 12.5, color: 'var(--yb-muted)', margin: 0, lineHeight: 1.6 }}>
          O registo nacional das transportadoras licenciadas. <strong>Não são parceiros</strong> &mdash;
          são empresas que existem e têm alvará, e mais nada. Use o quadro &ldquo;Por servir&rdquo;
          para saber onde faltam, venha aqui buscar quem lá está, e promova a parceiro quando
          tiver por onde lhes falar.
        </p>
      </div>

      <div style={{ ...CARD, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <input
            style={{ ...INPUT, flex: '1 1 220px', minWidth: 160 }}
            placeholder="começo do nome, localidade, ou o número de alvará"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" style={chip(porPromover)} onClick={() => { setPorPromover(!porPromover); setPagina(1); }}>
            só por promover
          </button>
          <button type="button" style={chip(internacional)} onClick={() => { setInternacional(!internacional); setPagina(1); }}>
            âmbito internacional
          </button>
        </div>

        {/* Os distritos com a contagem à vista: é por aqui que se entra, depois de olhar
            para o quadro "Por servir". A contagem não leva o filtro de distrito, para
            escolher um não apagar os outros da vista de conjunto. */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button type="button" style={chip(!distrito)} onClick={() => { setDistrito(''); setPagina(1); }}>
            todo o país
          </button>
          {DISTRITOS.map((d) => (
            <button type="button" key={d} style={chip(distrito === d)}
              onClick={() => { setDistrito(distrito === d ? '' : d); setPagina(1); }}>
              {nomeZona(d)}{' '}
              <span style={{ opacity: 0.65 }}>{porDistrito[d] ?? 0}</span>
            </button>
          ))}
          {(porDistrito.sem ?? 0) > 0 && (
            <button type="button" style={chip(distrito === 'sem')}
              onClick={() => { setDistrito(distrito === 'sem' ? '' : 'sem'); setPagina(1); }}
              title="O código postal destas atravessa dois distritos e a localidade vem truncada no PDF. Precisam de mão.">
              sem distrito <span style={{ opacity: 0.65 }}>{porDistrito.sem}</span>
            </button>
          )}
        </div>

        <p style={{ fontSize: 11, color: 'var(--yb-muted)', margin: '10px 0 0' }}>
          {aCarregar ? 'a procurar...' : `${total} empresa${total === 1 ? '' : 's'}`}
        </p>
      </div>

      {linhas.map((l) => (
        <div key={l._id} style={{ ...CARD, padding: 0, overflow: 'hidden', marginBottom: 8 }}>
          <button
            onClick={() => setAberta(aberta === l.alvara ? null : l.alvara)}
            style={{
              width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '11px 15px', textAlign: 'left', display: 'flex', alignItems: 'center',
              gap: 10, flexWrap: 'wrap',
            }}
          >
            <span style={{ minWidth: 0, flex: '1 1 260px' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)' }}>
                {l.nome}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--yb-subtle)' }}>
                {l.morada} · {l.codigoPostal} {l.localidade}
              </span>
            </span>

            <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>
              {l.distrito ? nomeZona(l.distrito) : <span style={{ color: 'var(--yb-aviso)' }}>sem distrito</span>}
            </span>
            {l.internacional && (
              <span style={{ fontSize: 10, color: 'var(--yb-subtle)' }}>internacional</span>
            )}
            <span style={{ fontSize: 10, color: 'var(--yb-subtle)', fontVariantNumeric: 'tabular-nums' }}>
              alvará {l.alvara}
            </span>

            {l.partnerId ? (
              <span style={{ fontSize: 11, color: 'var(--yb-success)', fontWeight: 600 }}>
                promovido{l.promovidoPor ? ` · ${l.promovidoPor}` : ''}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--yb-cyan)', fontWeight: 600 }}>
                {aberta === l.alvara ? 'fechar' : 'promover'}
              </span>
            )}
          </button>

          {aberta === l.alvara && !l.partnerId && (
            <Promover
              linha={l}
              // A linha muda no sitio em vez de a lista voltar a carregar. Com o filtro
              // "so por promover" ligado, recarregar fazia a empresa desaparecer no
              // momento em que se acabou de trabalhar nela — e perdia-se o sitio onde se
              // ia na lista.
              aoPromover={(partnerId) => setLinhas((antes) => antes.map(
                (x) => (x.alvara === l.alvara ? { ...x, partnerId } : x),
              ))}
              aoFechar={() => setAberta(null)}
            />
          )}
        </div>
      ))}

      {!linhas.length && !aCarregar && (
        <div style={CARD}>
          <p style={{ fontSize: 13, color: 'var(--yb-muted)', margin: 0 }}>
            Nada com estes filtros. Tire um, ou desligue o &ldquo;só por promover&rdquo;.
          </p>
        </div>
      )}

      {paginas > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', margin: '12px 0 4px' }}>
          <button onClick={() => setPagina(Math.max(1, pagina - 1))} disabled={pagina <= 1}
            style={{ ...botao(), opacity: pagina <= 1 ? 0.4 : 1 }}>anterior</button>
          <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>página {pagina} de {paginas}</span>
          <button onClick={() => setPagina(Math.min(paginas, pagina + 1))} disabled={pagina >= paginas}
            style={{ ...botao(), opacity: pagina >= paginas ? 0.4 : 1 }}>seguinte</button>
        </div>
      )}
    </>
  );
}

/**
 * Promover uma empresa a parceiro.
 *
 * O telefone ou o email são obrigatórios porque a lista do IMT não os traz e um parceiro
 * sem contacto nenhum nunca poderia receber uma lead. É a operadora que os vai buscar —
 * ao site da empresa, ou a uma chamada.
 */
function Promover({ linha, aoPromover, aoFechar }: {
  linha: Linha; aoPromover: (partnerId: string) => void; aoFechar: () => void;
}) {
  const [dados, setDados] = useState({ telefone: '', email: '', contacto: '' });
  const [erro, setErro] = useState('');
  const [aGravar, setAGravar] = useState(false);

  const procurar = `https://www.google.com/search?q=${encodeURIComponent(`${linha.nome} ${linha.localidade} contacto`)}`;

  async function gravar() {
    setErro('');
    setAGravar(true);
    const r = await fetch('/api/crm/imt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alvara: linha.alvara, ...dados }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) { aoFechar(); aoPromover(String(r.partnerId)); }
    else setErro(r?.error ?? 'não foi possível promover');
  }

  return (
    <div style={{
      borderTop: '1px solid var(--yb-border)', background: 'var(--yb-card-2)',
      padding: '13px 15px',
    }}>
      <p style={{ fontSize: 11.5, color: 'var(--yb-muted)', margin: '0 0 11px', lineHeight: 1.6 }}>
        A ficha fica com o nome, a morada, o alvará e o distrito da sede. Falta por onde
        lhes falar &mdash; é a única coisa que esta lista não tem.{' '}
        <a href={procurar} target="_blank" rel="noreferrer"
          style={{ color: 'var(--yb-cyan)', fontWeight: 600 }}>procurar no Google</a>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 11 }}>
        {([
          ['telefone', 'Telefone'], ['email', 'Email'], ['contacto', 'Pessoa de contacto'],
        ] as const).map(([campo, rotulo]) => (
          <div key={campo}>
            <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 }}>
              {rotulo}{campo === 'contacto' ? ' (opcional)' : ''}
            </label>
            <input style={INPUT} value={dados[campo]}
              onChange={(e) => setDados({ ...dados, [campo]: e.target.value })} />
          </div>
        ))}
      </div>

      {erro && <p style={{ fontSize: 11.5, color: 'var(--yb-error)', margin: '0 0 10px' }}>{erro}</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={gravar} disabled={aGravar}
          style={{ ...botao(true), opacity: aGravar ? 0.5 : 1 }}>
          {aGravar ? 'a criar...' : 'Criar como prospecto'}
        </button>
        <button onClick={aoFechar} style={{
          background: 'none', border: 'none', padding: '7px 4px', cursor: 'pointer',
          fontSize: 12, color: 'var(--yb-subtle)',
        }}>Cancelar</button>
        <span style={{ fontSize: 10.5, color: 'var(--yb-subtle)' }}>
          Entra no funil em &ldquo;por contactar&rdquo;. Não recebe leads até alguém o pôr em trial.
        </span>
      </div>
    </div>
  );
}
