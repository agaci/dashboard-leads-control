'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Os emails que a plataforma envia, para se verem.
 *
 * Duas coisas ao mesmo tempo, e é de propósito que estão juntas:
 *
 *   - **O catálogo.** Todos os modelos, com o exemplo ao vivo e a explicação do que é e
 *     de quando sai. Serve para escolher, e serve para mostrar a alguém de fora sem ter
 *     de reencaminhar um email verdadeiro.
 *   - **A escolha da carta de apresentação.** Nos modelos manuais, a gerente de conta lê
 *     as quatro situações, escolhe a que serve, preenche as variáveis, e vê a carta a
 *     mudar à frente dela antes de a mandar.
 *
 * As pré-visualizações vêm de `/api/crm/emails/<id>/preview`, que corre o mesmo código
 * que produz o email a sério. Nada aqui é uma cópia — se o molde mudar, isto muda com
 * ele, e nunca existe o estado em que a página mostra uma coisa e o cliente recebe outra.
 */

type Campo = {
  id: string; label: string; obrigatorio: boolean;
  tipo: 'texto' | 'numero'; exemplo: string; nota?: string;
};

type Modelo = {
  id: string; nome: string; publico: string; assunto: string;
  quando: string; descricao: string; manual: boolean; campos?: Campo[];
};

const CARD: React.CSSProperties = {
  background: 'var(--yb-card)', borderRadius: 12,
  border: '1px solid var(--yb-border)', padding: '16px 18px', marginBottom: 12,
};
const TITULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--yb-subtle)', marginBottom: 10,
};
const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7,
  border: '1px solid var(--yb-border)', background: 'var(--yb-input)',
  color: 'var(--yb-fg)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
};

type TextoVariante = {
  id: string; nome: string; quando: string;
  versao: string; criadoEm: string; criadoPor: string;
  assunto: string; abertura: string; oQueE: string[];
  campos: { obrigatorios: string[]; opcionais: string[] };
};

const CAMPOS_DISPONIVEIS = ['categoria', 'zona', 'pedidos', 'pessoa', 'quemIndicou'];

const COD: React.CSSProperties = {
  background: 'var(--yb-card-2)', borderRadius: 4, padding: '1px 4px',
  fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'var(--yb-muted)',
};

const COR_PUBLICO: Record<string, string> = {
  cliente: '#22c55e', visitante: '#8B9EC9', parceiro: '#eab308', equipa: '#00bcd4',
};
const ROTULO_PUBLICO: Record<string, string> = {
  cliente: 'cliente', visitante: 'visitante', parceiro: 'parceiro', equipa: 'equipa',
};

export default function Emails() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [textos, setTextos] = useState<Record<string, TextoVariante>>({});
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(() => {
    fetch('/api/crm/emails', { cache: 'no-store' })
      .then((x) => x.json())
      .then((r) => { if (r?.success) setModelos(r.modelos); })
      .catch(() => {});
    fetch('/api/crm/textos-carta', { cache: 'no-store' })
      .then((x) => x.json())
      .then((r) => {
        if (!r?.success) return;
        const m: Record<string, TextoVariante> = {};
        for (const v of r.variantes as TextoVariante[]) m[v.id] = v;
        setTextos(m);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const manuais = useMemo(() => modelos.filter((m) => m.manual), [modelos]);
  const automaticos = useMemo(() => modelos.filter((m) => !m.manual), [modelos]);

  if (!modelos.length) {
    return <p style={{ fontSize: 12, color: 'var(--yb-subtle)' }}>a carregar...</p>;
  }

  return (
    <>
      <div style={CARD}>
        <p style={TITULO}>Cartas de apresentação</p>
        <p style={{ fontSize: 12.5, color: 'var(--yb-muted)', margin: 0, lineHeight: 1.6 }}>
          As quatro situações em que se escreve a uma empresa que ainda não é parceira. Leia
          o &ldquo;quando usar&rdquo; de cada uma, abra a que servir, preencha as variáveis e
          veja a carta antes de a enviar. São enviadas à mão, uma a uma &mdash; nunca em série.
        </p>
      </div>

      {manuais.map((m) => (
        <Modelo key={m.id} modelo={m}
          texto={textos[m.id.replace(/^apresentacao_/, '')]}
          aoGravar={carregar}
          aberto={aberto === m.id} aoAbrir={() => setAberto(aberto === m.id ? null : m.id)} />
      ))}

      <div style={{ ...CARD, marginTop: 26 }}>
        <p style={TITULO}>Enviados pelo sistema</p>
        <p style={{ fontSize: 12.5, color: 'var(--yb-muted)', margin: 0, lineHeight: 1.6 }}>
          Estes saem sozinhos, no momento em que a coisa acontece. Ninguém os envia à mão &mdash;
          estão aqui para se saber o que o cliente recebe, e para se poder mostrar a alguém sem
          reencaminhar um email verdadeiro. Os valores são de exemplo.
        </p>
      </div>

      {automaticos.map((m) => (
        <Modelo key={m.id} modelo={m}
          aberto={aberto === m.id} aoAbrir={() => setAberto(aberto === m.id ? null : m.id)} />
      ))}
    </>
  );
}

function Modelo({ modelo, aberto, aoAbrir, texto, aoGravar }: {
  modelo: Modelo; aberto: boolean; aoAbrir: () => void;
  texto?: TextoVariante; aoGravar?: () => void;
}) {
  const [aEditar, setAEditar] = useState(false);
  // Cada campo começa com o seu exemplo: uma pré-visualização vazia não mostra nada de
  // útil, e ver a carta preenchida é o que permite decidir se ela serve.
  const inicial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const c of modelo.campos ?? []) v[c.id] = c.exemplo;
    return v;
  }, [modelo]);

  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [aplicados, setAplicados] = useState<Record<string, string>>(inicial);

  // Só se recarrega o iframe quando se carrega em "ver com estes valores": recarregar a
  // cada tecla fazia piscar a carta toda e gastava um pedido por letra.
  const aplicar = useCallback(() => setAplicados({ ...valores }), [valores]);

  const url = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(aplicados)) if (v.trim()) q.set(k, v);
    // A versao vai no endereco para o iframe recarregar depois de se gravar um texto
    // novo. Sem isto, gravava-se e continuava a ver-se a carta antiga.
    if (texto?.versao) q.set('_v', texto.versao);
    const s = q.toString();
    return `/api/crm/emails/${modelo.id}/preview${s ? `?${s}` : ''}`;
  }, [modelo.id, aplicados, texto?.versao]);

  const cor = COR_PUBLICO[modelo.publico] ?? 'var(--yb-subtle)';
  const emFalta = (modelo.campos ?? []).filter((c) => c.obrigatorio && !valores[c.id]?.trim());

  return (
    <div style={{ ...CARD, padding: aberto ? '16px 18px' : '13px 16px' }}>
      <button onClick={aoAbrir} style={{
        display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', width: '100%',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          // color-mix e nao `${cor}22`: a cor de recurso e uma var(--yb-*), e concatenar
          // alfa a uma var da CSS invalida — a etiqueta ficava sem fundo, em silencio.
          background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor,
          border: `1px solid color-mix(in srgb, ${cor} 34%, transparent)`,
          borderRadius: 10, padding: '2px 8px', flexShrink: 0,
        }}>{ROTULO_PUBLICO[modelo.publico] ?? modelo.publico}</span>

        <strong style={{ fontSize: 14, color: 'var(--yb-fg)' }}>{modelo.nome}</strong>
        <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>{modelo.assunto}</span>
        <span style={{ fontSize: 11, color: 'var(--yb-cyan)', marginLeft: 'auto', fontWeight: 600 }}>
          {aberto ? 'fechar' : 'ver'}
        </span>
      </button>

      <p style={{ fontSize: 11.5, color: 'var(--yb-subtle)', margin: '7px 0 0', lineHeight: 1.55 }}>
        {modelo.quando}
      </p>

      {aberto && texto && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setAEditar(!aEditar)} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 11, color: 'var(--yb-cyan)', fontWeight: 600,
          }}>{aEditar ? 'fechar o editor' : 'editar o texto desta carta'}</button>
        </div>
      )}

      {aberto && texto && aEditar && (
        <EditorTexto
          variante={texto.id}
          texto={texto}
          aoGravar={() => { setAEditar(false); aoGravar?.(); }}
        />
      )}

      {aberto && (
        <>
          <p style={{
            fontSize: 12.5, color: 'var(--yb-muted)', margin: '12px 0 0', lineHeight: 1.65,
            paddingTop: 12, borderTop: '1px solid var(--yb-border)',
          }}>
            {modelo.descricao}
          </p>

          {!!modelo.campos?.length && (
            <div style={{
              marginTop: 14, padding: '13px 14px', background: 'var(--yb-input)',
              border: '1px solid var(--yb-border)', borderRadius: 10,
            }}>
              <p style={{ ...TITULO, marginBottom: 10 }}>O que esta carta precisa</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 11 }}>
                {modelo.campos.map((c) => (
                  <div key={c.id}>
                    <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 }}>
                      {c.label}
                      {!c.obrigatorio && <span style={{ color: 'var(--yb-subtle)' }}> (opcional)</span>}
                    </label>
                    <input
                      style={{ ...CAMPO, background: 'var(--yb-card)' }}
                      type={c.tipo === 'numero' ? 'number' : 'text'}
                      value={valores[c.id] ?? ''}
                      placeholder={c.exemplo}
                      onChange={(e) => setValores({ ...valores, [c.id]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') aplicar(); }}
                    />
                    {c.nota && (
                      <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '3px 0 0', lineHeight: 1.45 }}>
                        {c.nota}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={aplicar} style={{
                  background: 'rgba(0,188,212,0.15)', color: 'var(--yb-cyan)',
                  border: '1px solid rgba(0,188,212,0.35)', borderRadius: 8,
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Ver com estes valores</button>
                {emFalta.length > 0 && (
                  <span style={{ fontSize: 11, color: '#eab308' }}>
                    Falta {emFalta.map((c) => c.label.toLowerCase()).join(', ')} para poder enviar.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Um iframe com `src`, e nao o HTML injectado: isola os estilos do email dos do
              dashboard sem ninguem ter de pensar nisso, e o que se ve e exactamente o que
              a rota devolve. */}
          <div style={{
            marginTop: 14, border: '1px solid var(--yb-border)', borderRadius: 10,
            overflow: 'hidden', background: '#f4f6f7',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              borderBottom: '1px solid var(--yb-border)', background: 'var(--yb-input)',
            }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--yb-border)' }} />
              ))}
              <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--yb-subtle)', fontFamily: 'ui-monospace, monospace' }}>
                cliente de email
              </span>
            </div>
            <iframe
              key={url}
              src={url}
              title={`Pré-visualização: ${modelo.nome}`}
              style={{ display: 'block', width: '100%', height: 620, border: 0, background: '#f4f6f7' }}
              onLoad={(e) => {
                // Altura real, para nao ficar um travao de scroll dentro da moldura.
                try {
                  const f = e.currentTarget;
                  const alt = f.contentDocument?.documentElement?.scrollHeight;
                  if (alt) f.style.height = `${alt + 8}px`;
                } catch { /* fica a altura declarada */ }
              }}
            />
          </div>

          <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '8px 0 0' }}>
            {modelo.manual
              ? 'Os valores acima são de exemplo até os mudar. O envio faz-se na ficha do parceiro.'
              : 'Valores de exemplo — este email é montado com os dados reais no momento em que sai.'}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * O editor do texto de uma carta.
 *
 * Só as três partes onde se ganha ou perde o leitor: o assunto, a abertura e os parágrafos
 * do "somos a YourBox". Os quatro passos do "como funciona", o fecho e o rodapé continuam
 * em código — são a substância da proposta e a parte de RGPD, e o risco de alguém prometer
 * o que não fazemos é maior do que o ganho de os poder mexer.
 *
 * **Gravar cria uma versão nova, não substitui.** O rótulo (`contexto-v2`) fica no registo
 * de cada envio: é por ele que se sabe, daqui a meio ano, qual das cartas é que uma empresa
 * recebeu — e sem as versões antigas guardadas esse rótulo não apontaria para nada.
 */
function EditorTexto({ variante, texto, aoGravar }: {
  variante: string;
  texto: TextoVariante;
  aoGravar: (versao: string) => void;
}) {
  const [assunto, setAssunto] = useState(texto.assunto);
  const [abertura, setAbertura] = useState(texto.abertura);
  const [paragrafos, setParagrafos] = useState<string[]>(texto.oQueE);
  const [erro, setErro] = useState('');
  const [aGravar, setAGravar] = useState(false);

  const sujo = assunto !== texto.assunto || abertura !== texto.abertura
    || paragrafos.join(' ') !== texto.oQueE.join(' ');

  async function gravar() {
    setErro('');
    setAGravar(true);
    const r = await fetch('/api/crm/textos-carta', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variante, assunto, abertura, oQueE: paragrafos.filter((p) => p.trim()) }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) aoGravar(r.versao);
    else setErro(r?.error ?? 'não foi possível gravar');
  }

  function repor() {
    setAssunto(texto.assunto); setAbertura(texto.abertura);
    setParagrafos(texto.oQueE); setErro('');
  }

  const area: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--yb-card)',
    border: '1px solid var(--yb-border)', color: 'var(--yb-fg)', borderRadius: 8,
    padding: '8px 10px', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit',
    resize: 'vertical', minHeight: 78,
  };
  const rotulo: React.CSSProperties = {
    fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 4,
  };

  return (
    <div style={{
      marginTop: 14, padding: '13px 14px', background: 'var(--yb-input)',
      border: '1px solid var(--yb-border)', borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <p style={{ ...TITULO, marginBottom: 0 }}>Texto desta carta</p>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--yb-subtle)' }}>
          versão {texto.versao}
          {texto.criadoPor && texto.criadoPor !== 'semente' ? ` · ${texto.criadoPor}` : ' · original'}
        </span>
      </div>

      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 12px', lineHeight: 1.6 }}>
        Escreva a frase inteira, com as variáveis lá dentro. Há três coisas:{' '}
        <code style={COD}>{'{categoria}'}</code> mete o valor do formulário,{' '}
        <code style={COD}>**assim**</code> fica a negrito, e{' '}
        <code style={COD}>[entre parênteses rectos]</code> desaparece inteiro se a variável
        que lá estiver vier vazia &mdash; é o que faz o &ldquo;cerca de 4 por mês&rdquo; não
        se escrever quando não há número. Não escreva HTML: aqui é tudo texto.
      </p>

      <div style={{ marginBottom: 11 }}>
        <label style={rotulo}>Assunto do email</label>
        <input style={{ ...area, minHeight: 0 }} value={assunto} onChange={(e) => setAssunto(e.target.value)} />
      </div>

      <div style={{ marginBottom: 11 }}>
        <label style={rotulo}>Abertura &mdash; a primeira coisa que se lê a seguir ao título</label>
        <textarea style={area} value={abertura} onChange={(e) => setAbertura(e.target.value)} />
      </div>

      {paragrafos.map((p, i) => (
        <div key={i} style={{ marginBottom: 11 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <label style={rotulo}>Parágrafo {i + 1}</label>
            {paragrafos.length > 1 && (
              <button type="button" onClick={() => setParagrafos(paragrafos.filter((_, j) => j !== i))}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
                  cursor: 'pointer', fontSize: 10, color: 'var(--yb-subtle)', fontWeight: 600,
                }}>tirar</button>
            )}
          </div>
          <textarea style={area} value={p}
            onChange={(e) => setParagrafos(paragrafos.map((x, j) => (j === i ? e.target.value : x)))} />
        </div>
      ))}

      <button type="button" onClick={() => setParagrafos([...paragrafos, ''])} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: 11, color: 'var(--yb-cyan)', fontWeight: 600, marginBottom: 12,
      }}>+ outro parágrafo</button>

      {/* O que o texto passa a exigir, lido do próprio texto. Se alguém puser {zona} fora
          de um bloco opcional, a carta passa a precisar da zona — e mais vale sabê-lo aqui
          do que na hora de enviar. */}
      <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '0 0 12px', lineHeight: 1.6 }}>
        Com este texto, a carta passa a pedir:{' '}
        {texto.campos.obrigatorios.length
          ? <strong style={{ color: 'var(--yb-muted)' }}>{texto.campos.obrigatorios.join(', ')}</strong>
          : 'nada de obrigatório'}
        {texto.campos.opcionais.length ? ` · opcionais: ${texto.campos.opcionais.join(', ')}` : ''}
        {'. '}
        Variáveis disponíveis: {CAMPOS_DISPONIVEIS.map((c) => `{${c}}`).join(', ')}.
      </p>

      {erro && <p style={{ fontSize: 11.5, color: 'var(--yb-error)', margin: '0 0 10px' }}>{erro}</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={gravar} disabled={aGravar || !sujo} style={{
          background: 'rgba(0,188,212,0.15)', color: 'var(--yb-cyan)',
          border: '1px solid rgba(0,188,212,0.35)', borderRadius: 8, padding: '7px 14px',
          fontSize: 12, fontWeight: 600, cursor: sujo ? 'pointer' : 'default',
          opacity: aGravar || !sujo ? 0.45 : 1,
        }}>{aGravar ? 'a gravar...' : 'Gravar versão nova'}</button>

        {sujo && (
          <button onClick={repor} style={{
            background: 'none', border: 'none', padding: '7px 4px', cursor: 'pointer',
            fontSize: 12, color: 'var(--yb-subtle)',
          }}>Repor</button>
        )}

        <span style={{ fontSize: 10.5, color: 'var(--yb-subtle)', lineHeight: 1.5 }}>
          {sujo
            ? 'Grave e depois use "ver com estes valores" para ver como fica.'
            : 'As cartas já enviadas continuam a mostrar a versão que receberam.'}
        </span>
      </div>
    </div>
  );
}
