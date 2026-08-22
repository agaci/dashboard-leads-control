'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';

// Portal do parceiro de widget. Fora de /dashboard e sem NextAuth: autentica-se com o
// secretToken do widget, entregue em link (/parceiro?t=...) e guardado no browser.
// Nunca mostra dados pessoais de leads ou de clientes finais — só contagens, rotas e valores.

const KEY = 'yb_parceiro_token';

type Service = {
  date: string;
  nr: number | null;
  client: string | null;
  price: number;
  commission: number;
  margin: number | null;   // em %, já calculada
  grouped: number;         // quantos serviços-perna foram somados a este
};

type Commission = {
  services: number;
  clients: number;
  billed: number;
  percentage: number;
  amount: number;
  model: 'fixed' | 'margin';
  marginBase: 'cost' | 'revenue';
  referenceMargin: number;
};

type Gestao = {
  status: string;
  priority: string;
  notes: string;
  followUpDate: string | null;
  tags: string[];
  comments: { timestamp: string; user: string; text: string }[];
  updatedAt: string | null;
  updatedBy: string | null;
};

type Pedido = {
  id: string;
  date: string;
  origem: string | null;
  destino: string | null;
  urgencia: string | null;
  viatura: string | null;
  weightKg: number | null;
  volumes: string | number | null;
  material: string | null;
  embalado: string | null;
  price: number | null;
  isClient: boolean;
  motivo: string | null;
  gestao: Gestao;
};

type Iniciado = {
  id: string;
  date: string;
  origem: string | null;
  destino: string | null;
  urgencia: string | null;
  volumes: string | number | null;
  peso: string | number | null;
  dimensoes: string | null;
  material: string | null;
  embalado: string | null;
  ultimoPasso: string | null;
  passo: number | null;
  total: number | null;
  completo: boolean;
};

type Data = {
  partner: string;
  period: { month: number; year: number; label: string };
  funnel: { started: number; leads: number; converted: number; quoted: number; clientsWon: number };
  services: Service[];
  iniciados: Iniciado[];
  pedidos: Pedido[];
  commission: Commission | null;
  commissionLinked: boolean;
};

const eur = (n: number) => n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

// Estados da gestao, tal como no card do dashboard interno
const rotulo = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
function corEstado(status: string): { background: string; color: string } {
  switch (status) {
    case 'contactado': return { background: 'rgba(255,193,7,0.15)', color: '#ffc107' };
    case 'fechado':    return { background: 'rgba(34,197,94,0.15)', color: '#22c55e' };
    case 'perdido':    return { background: 'rgba(248,113,113,0.15)', color: '#f87171' };
    default:           return { background: 'rgba(148,163,184,0.15)', color: 'var(--yb-muted)' };
  }
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Anos consultáveis: de 2024 (primeiro histórico útil) até ao ano corrente, do mais recente para trás
const ANOS = (() => {
  const atual = new Date().getFullYear();
  return Array.from({ length: atual - 2023 }, (_, i) => atual - i);
})();

const navBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 8,
  border: '1px solid var(--yb-border)', background: 'var(--yb-input)', color: 'var(--yb-fg)', cursor: 'pointer',
};
// Fundo OPACO de propósito: com uma cor translúcida (--yb-input é branco a 5%), o popup
// nativo do select resolve-a sobre branco e fica ilegível em tema escuro.
const selectStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--yb-border)', background: 'var(--yb-card-2)', color: 'var(--yb-fg)', cursor: 'pointer',
};
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 };
const td: React.CSSProperties = { padding: '8px' };

const LIMA = '#bed62f';
const ESCURO = '#1a1a1a';

// Faixa de marca. O logótipo tem metade em contorno branco, por isso assenta em escuro —
// em fundo claro metade dele desapareceria.
function BarraMarca() {
  return (
    <div style={{ background: ESCURO, borderBottom: `2px solid ${LIMA}` }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '9px 20px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <Image src="/logo.png" alt="YourBox" width={24} height={24} style={{ objectFit: 'contain' }} priority />
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          YourBox <span style={{ color: LIMA }}>·</span> Portal de parceiro
        </span>
      </div>
    </div>
  );
}

function Rodape() {
  return (
    <footer style={{ maxWidth: 980, margin: '30px auto 0', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ height: 1, background: 'var(--yb-border)', marginBottom: 12 }} />
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: 0 }}>
        <span style={{ color: LIMA, fontWeight: 700 }}>YourBox</span> · Gestão Online de Entregas · {ANOS[0]}
      </p>
    </footer>
  );
}

function Tile({ label, value, hint, onClick, aberto }: {
  label: string; value: string; hint?: string; onClick?: () => void; aberto?: boolean;
}) {
  const clicavel = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clicavel ? 'button' : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onKeyDown={clicavel ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
      style={{
        background: 'var(--yb-card)',
        border: `1px solid ${aberto ? LIMA : 'var(--yb-border)'}`,
        borderRadius: 12, padding: '16px 18px',
        cursor: clicavel ? 'pointer' : undefined,
        transition: 'border-color .15s',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--yb-muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--yb-fg)', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--yb-muted)', marginTop: 2 }}>{hint}</div>}
      {clicavel && (
        <div style={{ fontSize: 11, fontWeight: 600, color: LIMA, marginTop: 6 }}>
          {aberto ? 'fechar detalhe' : 'ver detalhe'}
        </div>
      )}
    </div>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--yb-muted)' }}>{children}</div>;
}

function Big({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--yb-fg)' }}>{children}</div>;
}

export default function PortalParceiro() {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Período em consulta. Arranca no mês corrente; navegável pelas setas ou pelos selectores.
  const hoje = new Date();
  const [period, setPeriod] = useState({ m: hoje.getMonth() + 1, y: hoje.getFullYear() });
  const isCurrent = period.m === hoje.getMonth() + 1 && period.y === hoje.getFullYear();

  // Token do link (?t=) ou o que ficou guardado no browser
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('t');
    if (fromUrl) {
      localStorage.setItem(KEY, fromUrl);
      window.history.replaceState({}, '', url.pathname);
      setToken(fromUrl);
    } else {
      setToken(localStorage.getItem(KEY));
    }
  }, []);

  const load = useCallback(async (t: string, m: number, y: number) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/parceiro/stats?month=${m}&year=${y}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json();
      if (!json.success) {
        setErro(json.error ?? 'Não foi possível carregar');
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setErro('Não foi possível contactar o servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) load(token, period.m, period.y); }, [token, period, load]);

  // No modelo de margem mostra-se a coluna da margem, que explica o valor de cada linha
  const isMargin = data?.commission?.model === 'margin';

  // Painel de detalhe aberto a partir dos cards, e a linha expandida dentro dele
  const [painel, setPainel] = useState<'iniciados' | 'pedidos' | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  // Um mês para trás ou para a frente, sem passar do mês corrente
  function shift(delta: number) {
    setPeriod((p) => {
      const d = new Date(p.y, p.m - 1 + delta, 1);
      if (d > new Date(hoje.getFullYear(), hoje.getMonth(), 1)) return p;
      return { m: d.getMonth() + 1, y: d.getFullYear() };
    });
  }

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--yb-bg)', display: 'flex', flexDirection: 'column' }}>
        <BarraMarca />
        <main style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380, background: 'var(--yb-card)', border: '1px solid var(--yb-border)', borderRadius: 14, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ background: ESCURO, borderRadius: 12, padding: 12, display: 'grid', placeItems: 'center' }}>
              <Image src="/logo.png" alt="YourBox" width={40} height={40} style={{ objectFit: 'contain' }} />
            </div>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--yb-fg)', margin: 0, textAlign: 'center' }}>Portal do parceiro</h1>
          <p style={{ fontSize: 13, color: 'var(--yb-muted)', margin: '6px 0 16px', textAlign: 'center' }}>
            Introduza o código de acesso do seu widget.
          </p>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Código de acesso"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--yb-border)', background: 'var(--yb-input)', color: 'var(--yb-fg)', fontSize: 13 }}
          />
          <button
            onClick={() => { const t = input.trim(); if (t) { localStorage.setItem(KEY, t); setToken(t); } }}
            style={{ width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 8, border: 'none', background: '#bed62f', color: '#1a1a1a', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Entrar
          </button>
        </div>
        </main>
        <Rodape />
        <div style={{ height: 24 }} />
      </div>
    );
  }

  return (
    <div className="yb-portal" style={{ minHeight: '100vh', background: 'var(--yb-bg)' }}>
      <BarraMarca />
      <main style={{ padding: '24px 20px 40px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--yb-fg)', margin: 0 }}>{data?.partner ?? 'Portal do parceiro'}</h1>
            <p style={{ fontSize: 12.5, color: 'var(--yb-muted)', margin: '4px 0 0' }}>
              Actividade do widget · {data?.period.label ?? '—'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => shift(-1)} style={navBtn} title="Mês anterior">‹</button>

            <select
              value={period.m}
              onChange={(e) => setPeriod((p) => ({ ...p, m: Number(e.target.value) }))}
              style={selectStyle}
            >
              {MESES.map((nome, i) => {
                const futuro = period.y === hoje.getFullYear() && i + 1 > hoje.getMonth() + 1;
                return <option key={nome} value={i + 1} disabled={futuro}>{nome}</option>;
              })}
            </select>

            <select
              value={period.y}
              onChange={(e) => {
                const y = Number(e.target.value);
                // Ao saltar para o ano corrente, não deixar ficar num mês futuro
                setPeriod((p) => ({ y, m: y === hoje.getFullYear() ? Math.min(p.m, hoje.getMonth() + 1) : p.m }));
              }}
              style={selectStyle}
            >
              {ANOS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            <button onClick={() => shift(1)} disabled={isCurrent} style={{ ...navBtn, opacity: isCurrent ? 0.4 : 1 }} title="Mês seguinte">›</button>
            <button
              onClick={() => setPeriod({ m: hoje.getMonth() + 1, y: hoje.getFullYear() })}
              disabled={isCurrent}
              style={{ ...navBtn, opacity: isCurrent ? 0.4 : 1 }}
            >
              Mês actual
            </button>
            <button
              onClick={() => { localStorage.removeItem(KEY); setToken(null); setData(null); }}
              style={{ ...navBtn, color: '#f87171' }}
            >
              Sair
            </button>
          </div>
        </header>

        {loading && <p style={{ color: 'var(--yb-muted)', fontSize: 13 }}>A carregar...</p>}

        {erro && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 14, color: '#f87171', fontSize: 13 }}>
            {erro}
          </div>
        )}

        {data && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 12, marginBottom: 12 }}>
              <Tile
                label="Orçamentos iniciados"
                value={String(data.funnel.started)}
                hint={`começaram o pedido em ${data.period.label}`}
                aberto={painel === 'iniciados'}
                onClick={() => { setPainel(painel === 'iniciados' ? null : 'iniciados'); setExpandido(null); }}
              />
              <Tile
                label="Pedidos completos"
                value={String(data.funnel.leads)}
                hint={`chegaram ao fim em ${data.period.label}`}
                aberto={painel === 'pedidos'}
                onClick={() => { setPainel(painel === 'pedidos' ? null : 'pedidos'); setExpandido(null); }}
              />
              <Tile label="Valor orçamentado" value={eur(data.funnel.quoted)} hint="quando há preço calculado" />
              <Tile label="Clientes angariados" value={String(data.funnel.clientsWon)} hint="total acumulado, desde sempre" />
              <Tile
                label="Clientes com serviço"
                value={data.commission ? String(data.commission.clients) : '—'}
                hint={`pediram serviço em ${data.period.label}`}
              />
            </section>

            {/* Detalhe dos pedidos, aberto a partir dos cards. Sem contactos: o objectivo
                e o parceiro perceber que tipo de pedidos o site dele gera. */}
            {painel && (
              <section style={{ background: 'var(--yb-card)', border: `1px solid ${LIMA}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--yb-fg)', margin: 0 }}>
                    {painel === 'iniciados' ? 'Orçamentos iniciados' : 'Pedidos completos'} · {data.period.label}
                  </h2>
                  <button onClick={() => { setPainel(null); setExpandido(null); }} style={{ ...navBtn, padding: '4px 10px' }}>Fechar</button>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--yb-muted)', margin: '4px 0 12px' }}>
                  {painel === 'iniciados'
                    ? 'Inclui quem começou e não terminou — a coluna do passo mostra onde parou.'
                    : 'Clique numa linha para ver o detalhe e o acompanhamento feito pela equipa.'}
                  {' '}Por privacidade dos clientes finais, não são mostrados contactos.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                    <thead>
                      <tr style={{ color: 'var(--yb-muted)', textAlign: 'left' }}>
                        <th style={th}>Data</th>
                        <th style={th}>Rota</th>
                        <th style={th}>Urgência</th>
                        <th style={th}>Carga</th>
                        <th style={th}>{painel === 'iniciados' ? 'Parou em' : 'Estado'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel === 'iniciados' && data.iniciados.map((x) => (
                        <tr key={x.id} style={{ borderTop: '1px solid var(--yb-border)', color: 'var(--yb-fg)' }}>
                          <td style={td}>{new Date(x.date).toLocaleDateString('pt-PT')}</td>
                          <td style={td}>{x.origem ? `${x.origem} → ${x.destino ?? '?'}` : '—'}</td>
                          <td style={td}>{x.urgencia ?? '—'}</td>
                          <td style={td}>
                            {[x.volumes ? `${x.volumes} vol` : null, x.peso ? `${x.peso} kg/vol` : null, x.dimensoes, x.material]
                              .filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td style={td}>
                            {x.completo
                              ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Completo</span>
                              : <span style={{ color: 'var(--yb-muted)' }}>{x.ultimoPasso ?? '—'}{x.passo && x.total ? ` (${x.passo}/${x.total})` : ''}</span>}
                          </td>
                        </tr>
                      ))}

                      {painel === 'pedidos' && data.pedidos.map((p) => (
                        <Fragment key={p.id}>
                          <tr
                            onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                            style={{ borderTop: '1px solid var(--yb-border)', color: 'var(--yb-fg)', cursor: 'pointer' }}
                          >
                            <td style={td}>{new Date(p.date).toLocaleDateString('pt-PT')}</td>
                            <td style={td}>{p.origem ? `${p.origem} → ${p.destino ?? '?'}` : '—'}</td>
                            <td style={td}>{p.urgencia ?? '—'}</td>
                            <td style={td}>
                              {[p.volumes ? `${p.volumes} vol` : null, p.weightKg ? `${p.weightKg} kg` : null, p.material]
                                .filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td style={td}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, ...corEstado(p.gestao.status) }}>
                                {rotulo(p.gestao.status)}
                              </span>
                            </td>
                          </tr>
                          {expandido === p.id && (
                            <tr style={{ background: 'var(--yb-card-2)' }}>
                              <td colSpan={5} style={{ padding: '14px 12px' }}>
                                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                                  <div>
                                    <Small>Pedido</Small>
                                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--yb-fg)', lineHeight: 1.6 }}>
                                      {p.viatura && <>Viatura: <strong>{p.viatura}</strong><br /></>}
                                      {p.embalado && <>Embalagem: <strong>{p.embalado}</strong><br /></>}
                                      {p.price != null && <>Orçamento: <strong>{eur(p.price)}</strong><br /></>}
                                      {p.motivo && <>Motivo do registo: <strong>{p.motivo}</strong><br /></>}
                                      {p.isClient && <span style={{ color: '#22c55e', fontWeight: 600 }}>Já é cliente YourBox</span>}
                                    </p>
                                  </div>
                                  <div>
                                    <Small>Acompanhamento</Small>
                                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--yb-fg)', lineHeight: 1.6 }}>
                                      Estado: <strong>{rotulo(p.gestao.status)}</strong><br />
                                      Prioridade: <strong>{rotulo(p.gestao.priority)}</strong><br />
                                      {p.gestao.followUpDate && <>Seguimento: <strong>{new Date(p.gestao.followUpDate).toLocaleDateString('pt-PT')}</strong><br /></>}
                                      {p.gestao.tags.length > 0 && <>Etiquetas: {p.gestao.tags.join(', ')}<br /></>}
                                      {p.gestao.updatedBy && <span style={{ color: 'var(--yb-muted)' }}>Última actualização por {p.gestao.updatedBy}</span>}
                                    </p>
                                  </div>
                                  {p.gestao.notes && (
                                    <div style={{ gridColumn: '1 / -1' }}>
                                      <Small>Notas</Small>
                                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--yb-fg)', whiteSpace: 'pre-wrap' }}>{p.gestao.notes}</p>
                                    </div>
                                  )}
                                  {p.gestao.comments.length > 0 && (
                                    <div style={{ gridColumn: '1 / -1' }}>
                                      <Small>Comentários da equipa</Small>
                                      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                                        {p.gestao.comments.map((c, i) => (
                                          <div key={i} style={{ fontSize: 12.5, color: 'var(--yb-fg)' }}>
                                            <span style={{ color: 'var(--yb-muted)' }}>
                                              {new Date(c.timestamp).toLocaleDateString('pt-PT')} · {c.user}:
                                            </span>{' '}
                                            {c.text}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}

                      {((painel === 'iniciados' && !data.iniciados.length) || (painel === 'pedidos' && !data.pedidos.length)) && (
                        <tr><td style={{ ...td, color: 'var(--yb-muted)' }} colSpan={5}>Nada neste mês.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* O parceiro tem de perceber a diferenca entre os dois numeros de clientes */}
            <details style={{ background: 'var(--yb-card)', border: '1px solid var(--yb-border)', borderRadius: 12, padding: '12px 18px', marginBottom: 20 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--yb-fg)' }}>
                O que significa cada número?
              </summary>
              <div style={{ fontSize: 12.5, color: 'var(--yb-muted)', lineHeight: 1.6, marginTop: 10, display: 'grid', gap: 10 }}>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--yb-fg)' }}>Orçamentos iniciados</strong> — pessoas que abriram o
                  formulário no seu site e começaram a preencher, em {data.period.label}. Inclui quem desistiu a meio.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--yb-fg)' }}>Pedidos completos</strong> — os que chegaram ao fim e
                  deixaram contacto. É deste grupo que saem os clientes.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--yb-fg)' }}>Valor orçamentado</strong> — soma dos orçamentos
                  calculados automaticamente. Muitos pedidos são orçamentados pela equipa depois do contacto e não
                  entram nesta conta, por isso este número tende a ficar abaixo do valor real.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--yb-fg)' }}>Clientes angariados</strong> — pedidos seus que a YourBox
                  já registou como cliente. É um <strong>total acumulado</strong>, não do mês: uma vez cliente, conta
                  sempre, e não muda ao navegar entre meses. Este registo é feito <strong>manualmente</strong> pela
                  nossa equipa quando trata do pedido, por isso pode ficar atrás da realidade — nunca à frente.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--yb-fg)' }}>Clientes com serviço</strong> — clientes que lhe estão
                  atribuídos e pediram pelo menos um serviço <strong>em {data.period.label}</strong>. Vem directamente
                  dos serviços executados, <strong>sem nenhum registo manual pelo meio</strong>. Um cliente que não
                  peça serviços num mês não aparece nesse mês, e volta a aparecer assim que voltar a pedir.
                </p>

                <div style={{ borderTop: '1px solid var(--yb-border)', paddingTop: 10, marginTop: 2 }}>
                  <p style={{ margin: 0, color: 'var(--yb-fg)', fontWeight: 600 }}>Porque é que estes dois podem não bater certo</p>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    <li>o primeiro depende do tal registo manual e pode estar em atraso;</li>
                    <li>o segundo conta todos os clientes que lhe estão atribuídos, incluindo os que tenham chegado por outra via que não o widget;</li>
                    <li>um cliente angariado que não peça serviços num mês conta no primeiro mas não no segundo.</li>
                  </ul>
                  <p style={{ margin: '8px 0 0' }}>
                    <strong style={{ color: 'var(--yb-fg)' }}>A sua comissão nunca depende do primeiro número.</strong>{' '}
                    É sempre calculada sobre os serviços executados — mesmo que o registo de cliente esteja em atraso,
                    não perde comissão nenhuma.
                  </p>
                </div>
              </div>
            </details>

            <section style={{ background: 'var(--yb-card)', border: '1px solid var(--yb-border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--yb-fg)', margin: '0 0 10px' }}>Comissão do mês</h2>
              {data.commission ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                  <div><Small>Serviços executados</Small><Big>{data.commission.services}</Big></div>
                  <div><Small>Facturado</Small><Big>{eur(data.commission.billed)}</Big></div>
                  <div>
                    <Small>Comissão ({(data.commission.percentage * 100).toFixed(1)}%)</Small>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{eur(data.commission.amount)}</div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--yb-muted)', margin: 0 }}>
                  {data.commissionLinked
                    ? 'Ainda sem serviços executados neste mês.'
                    : 'A ligação à conta de comissões ainda não está configurada. Fale com a YourBox.'}
                </p>
              )}
              {/* Explicação do esquema — o parceiro tem de perceber sobre o que recebe.
                  Recolhível, como o "O que significa cada número?": quem já sabe não tem
                  de passar por cima do texto todo de cada vez que abre a página. */}
              <details style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--yb-border)', fontSize: 12, color: 'var(--yb-muted)', lineHeight: 1.55 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--yb-fg)' }}>
                  Como é calculada
                </summary>
                <p style={{ margin: '10px 0 0' }}>
                  A comissão incide sobre os <strong>serviços executados</strong> dos clientes que lhe estão
                  atribuídos na YourBox, e não sobre os pedidos recebidos no widget.
                </p>
                <p style={{ margin: '6px 0 0' }}>
                  Quando alguém pede um orçamento através do seu widget e se torna cliente da YourBox, esse
                  cliente fica associado a si. A partir desse momento, <strong>todos os serviços que ele
                  vier a pedir</strong> geram comissão para si — mesmo os que já não passem pelo widget, e
                  nos meses seguintes.
                </p>
                {data.commission?.model === 'margin' ? (
                  <>
                    <p style={{ margin: '6px 0 0' }}>
                      A comissão base é de <strong>{(data.commission.percentage * 100).toFixed(1)}%</strong> do valor
                      facturado, mas ajustada à <strong>rentabilidade de cada serviço</strong>: quando a margem fica
                      abaixo da referência de {(data.commission.referenceMargin * 100).toFixed(0)}%, a comissão desce
                      na mesma proporção. Acima da referência não sobe — {(data.commission.percentage * 100).toFixed(1)}%
                      é sempre o máximo.
                    </p>
                    <p style={{ margin: '6px 0 0' }}>
                      A margem é calculada {data.commission.marginBase === 'cost'
                        ? 'sobre o custo do serviço'
                        : 'sobre o valor de venda'}. Serviços sem margem positiva não geram comissão. Um serviço
                      composto por várias recolhas conta como um só, somado.
                    </p>
                  </>
                ) : (
                  <p style={{ margin: '6px 0 0' }}>
                    Sobre cada serviço executado aplica-se
                    {data.commission ? ` ${(data.commission.percentage * 100).toFixed(1)}%` : ' a percentagem acordada'}
                    {' '}do valor facturado ao cliente.
                  </p>
                )}
                <p style={{ margin: '6px 0 0' }}>
                  Serviços cancelados ou anulados não contam. Um pedido que fique só em orçamento, sem serviço
                  realizado, também não gera comissão.
                </p>
                <p style={{ margin: '6px 0 0', color: 'var(--yb-subtle)' }}>
                  Os valores aqui mostrados são indicativos e servem para conferência. O apuramento oficial,
                  e o que é pago, é o da YourBox.
                </p>
              </details>
            </section>

            <section style={{ background: 'var(--yb-card)', border: '1px solid var(--yb-border)', borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--yb-fg)', margin: '0 0 4px' }}>Serviços que compõem a comissão</h2>
              <p style={{ fontSize: 11.5, color: 'var(--yb-muted)', margin: '0 0 12px' }}>
                Detalhe do valor acima: cada serviço executado no mês pelos seus clientes.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
                  <thead>
                    <tr style={{ color: 'var(--yb-muted)', textAlign: 'left' }}>
                      <th style={th}>Data</th>
                      <th style={th}>Serviço</th>
                      <th style={th}>Cliente</th>
                      <th style={{ ...th, textAlign: 'right' }}>Facturado</th>
                      {isMargin && <th style={{ ...th, textAlign: 'right' }}>Margem</th>}
                      <th style={{ ...th, textAlign: 'right' }}>Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.map((s, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--yb-border)', color: 'var(--yb-fg)' }}>
                        <td style={td}>{new Date(s.date).toLocaleDateString('pt-PT')}</td>
                        <td style={{ ...td, color: 'var(--yb-muted)' }}>
                          {s.nr ? `#${s.nr}` : '—'}
                          {s.grouped > 0 && <span title="inclui recolhas associadas"> +{s.grouped}</span>}
                        </td>
                        <td style={td}>{s.client ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{eur(s.price)}</td>
                        {isMargin && (
                          <td style={{ ...td, textAlign: 'right', color: 'var(--yb-muted)' }}>
                            {s.margin === null ? '—' : `${s.margin.toFixed(1)}%`}
                          </td>
                        )}
                        <td style={{ ...td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{eur(s.commission)}</td>
                      </tr>
                    ))}
                    {data.services.length === 0 && (
                      <tr>
                        <td style={{ ...td, color: 'var(--yb-muted)' }} colSpan={isMargin ? 6 : 5}>
                          {data.commissionLinked
                            ? 'Sem serviços executados neste mês.'
                            : 'A ligação à conta de comissões ainda não está configurada.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {data.services.length > 0 && data.commission && (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--yb-border)', color: 'var(--yb-fg)', fontWeight: 700 }}>
                        <td style={td} colSpan={3}>Total · {data.services.length} serviços</td>
                        <td style={{ ...td, textAlign: 'right' }}>{eur(data.commission.billed)}</td>
                        {isMargin && <td />}
                        <td style={{ ...td, textAlign: 'right', color: '#22c55e' }}>{eur(data.commission.amount)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          </>
        )}
      </div>
      </main>
      <Rodape />
      <div style={{ height: 28 }} />
    </div>
  );
}
