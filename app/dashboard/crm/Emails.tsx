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

const COR_PUBLICO: Record<string, string> = {
  cliente: '#22c55e', visitante: '#8B9EC9', parceiro: '#eab308', equipa: '#00bcd4',
};
const ROTULO_PUBLICO: Record<string, string> = {
  cliente: 'cliente', visitante: 'visitante', parceiro: 'parceiro', equipa: 'equipa',
};

export default function Emails() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/crm/emails', { cache: 'no-store' })
      .then((x) => x.json())
      .then((r) => { if (r?.success) setModelos(r.modelos); })
      .catch(() => {});
  }, []);

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

function Modelo({ modelo, aberto, aoAbrir }: { modelo: Modelo; aberto: boolean; aoAbrir: () => void }) {
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
    const s = q.toString();
    return `/api/crm/emails/${modelo.id}/preview${s ? `?${s}` : ''}`;
  }, [modelo.id, aplicados]);

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
          background: `${cor}22`, color: cor, border: `1px solid ${cor}44`,
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
