'use client';

import { useCallback, useEffect, useState } from 'react';
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

type Data = {
  partner: string;
  period: { month: number; year: number; label: string };
  funnel: { started: number; leads: number; converted: number; quoted: number; clientsWon: number };
  services: Service[];
  commission: Commission | null;
  commissionLinked: boolean;
};

const eur = (n: number) => n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

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
const selectStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--yb-border)', background: 'var(--yb-input)', color: 'var(--yb-fg)', cursor: 'pointer',
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

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: 'var(--yb-card)', border: '1px solid var(--yb-border)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--yb-subtle)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--yb-fg)', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--yb-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--yb-subtle)' }}>{children}</div>;
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
    <div style={{ minHeight: '100vh', background: 'var(--yb-bg)' }}>
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
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
              <Tile label="Orçamentos iniciados" value={String(data.funnel.started)} hint="visitantes que começaram o pedido" />
              <Tile label="Pedidos completos" value={String(data.funnel.leads)} hint="chegaram ao fim do formulário" />
              <Tile label="Valor orçamentado" value={eur(data.funnel.quoted)} hint="soma dos orçamentos do mês" />
              <Tile label="Clientes angariados" value={String(data.funnel.clientsWon)} hint="acumulado, desde sempre" />
            </section>

            <section style={{ background: 'var(--yb-card)', border: '1px solid var(--yb-border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--yb-fg)', margin: '0 0 10px' }}>Comissão do mês</h2>
              {data.commission ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                  <div><Small>Serviços executados</Small><Big>{data.commission.services}</Big></div>
                  <div><Small>Clientes com serviço</Small><Big>{data.commission.clients}</Big></div>
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
              {/* Explicação do esquema — o parceiro tem de perceber sobre o que recebe */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--yb-border)', fontSize: 12, color: 'var(--yb-muted)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--yb-fg)' }}>Como é calculada</strong>
                <p style={{ margin: '6px 0 0' }}>
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
              </div>
            </section>

            <section style={{ background: 'var(--yb-card)', border: '1px solid var(--yb-border)', borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--yb-fg)', margin: '0 0 4px' }}>Serviços que compõem a comissão</h2>
              <p style={{ fontSize: 11.5, color: 'var(--yb-subtle)', margin: '0 0 12px' }}>
                Detalhe do valor acima: cada serviço executado no mês pelos seus clientes.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
                  <thead>
                    <tr style={{ color: 'var(--yb-subtle)', textAlign: 'left' }}>
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
