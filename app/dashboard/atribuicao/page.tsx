'use client';

import { useCallback, useEffect, useState } from 'react';

// Painel de verificação da captura de gclid.
//
// Existe para responder a uma pergunta antes de confiarmos nos dados: que
// percentagem das leads traz mesmo um identificador de clique do Google. Sem
// cobertura decente, importar conversões offline dá ao algoritmo de lances uma
// imagem parcial — pior do que não importar nada.

const CYAN = 'var(--yb-cyan)';
const NAVY = 'var(--yb-fg)';
const BORDER = 'var(--yb-border)';
const CARD_BG = 'var(--yb-card)';
const TEXT2 = 'var(--yb-muted)';
const TEXT3 = 'var(--yb-subtle)';

type Stats = {
  periodo: { days: number; from: string; to: string };
  leads: { total: number; comClickId: number; semClickId: number; cobertura: number; reconciliadas: number };
  porTipo: { gclid: number; wbraid: number; gbraid: number };
  sync: Record<string, number>;
  pendentes: number;
  fontes: { source: string; visitas: number; comClickId: number }[];
};

const DAY_OPTIONS = [7, 30, 90];

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: 16, ...style,
    }}>{children}</div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <Card>
      <p style={{ margin: 0, fontSize: 10, color: TEXT3, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 800, color: accent ?? NAVY, lineHeight: 1.1 }}>
        {value}
      </p>
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: TEXT2 }}>{hint}</p>}
    </Card>
  );
}

export default function AtribuicaoPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Stats | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async (d: number) => {
    setACarregar(true);
    setErro(null);
    try {
      const r = await fetch(`/api/conversions/stats?days=${d}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => { carregar(days); }, [days, carregar]);

  // A cobertura é o número que decide se isto é utilizável.
  const cobertura = data?.leads.cobertura ?? 0;
  const corCobertura = cobertura >= 40 ? '#22c55e' : cobertura >= 15 ? '#ffc107' : '#ef4444';

  function descarregar(kind: 'gclid' | 'wbraid' | 'gbraid') {
    const from = data?.periodo.from ? new Date(data.periodo.from).toISOString().slice(0, 10) : '';
    const to = data?.periodo.to ? new Date(data.periodo.to).toISOString().slice(0, 10) : '';
    window.location.href = `/api/conversions/export?id=${kind}&from=${from}&to=${to}`;
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--yb-bg)', color: NAVY,
      fontFamily: 'Inter, Nunito, system-ui, sans-serif', padding: '20px 22px 40px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <header style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Atribuição Google Ads</h1>
          <a href="/dashboard" style={{ fontSize: 12, color: CYAN, textDecoration: 'none' }}>voltar ao dashboard</a>
        </header>
        <p style={{ margin: '2px 0 18px', fontSize: 12, color: TEXT2, maxWidth: 720 }}>
          Cobertura da captura de identificadores de clique e exportação de conversões offline.
          O CSV descarregado aqui carrega-se no Google Ads em Ferramentas &gt; Conversões &gt; Importações.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${days === d ? CYAN : BORDER}`,
                background: days === d ? 'rgba(0,188,212,0.15)' : 'var(--yb-input)',
                color: days === d ? CYAN : TEXT2,
              }}
            >{d} dias</button>
          ))}
          <button
            onClick={() => carregar(days)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${BORDER}`, background: 'var(--yb-input)', color: TEXT2, marginLeft: 'auto',
            }}
          >actualizar</button>
        </div>

        {erro && (
          <Card style={{ borderColor: '#ef4444', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>Erro a carregar: {erro}</p>
          </Card>
        )}

        {aCarregar && !data && <p style={{ fontSize: 12, color: TEXT3 }}>A carregar...</p>}

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
              <Kpi
                label="Cobertura de atribuição"
                value={`${cobertura}%`}
                accent={corCobertura}
                hint={`${data.leads.comClickId} de ${data.leads.total} leads`}
              />
              <Kpi label="Leads com identificador" value={String(data.leads.comClickId)}
                   hint={data.leads.reconciliadas ? `${data.leads.reconciliadas} por reconciliação` : 'todas directas'} />
              <Kpi label="Leads sem identificador" value={String(data.leads.semClickId)}
                   hint="orgânico, directo ou captura falhada" />
              <Kpi label="Pendentes de exportação" value={String(data.pendentes)} accent={data.pendentes > 0 ? '#ffc107' : undefined}
                   hint="ainda não saíram num CSV" />
            </div>

            <Card style={{ marginBottom: 14 }}>
              <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>Descarregar CSV do período</p>
              <p style={{ margin: '0 0 12px', fontSize: 11, color: TEXT2, maxWidth: 700 }}>
                O Google exige um ficheiro por tipo de identificador — o gclid não pode partilhar coluna
                com o wbraid. Em iOS o tráfego vem quase todo como wbraid, por isso vale a pena carregar
                os dois. Descarregar marca as leads como exportadas.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  ['gclid', data.porTipo.gclid, 'padrão'],
                  ['wbraid', data.porTipo.wbraid, 'iOS web'],
                  ['gbraid', data.porTipo.gbraid, 'iOS app'],
                ] as const).map(([kind, n, nota]) => (
                  <button
                    key={kind}
                    onClick={() => descarregar(kind)}
                    disabled={n === 0}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 8,
                      cursor: n === 0 ? 'default' : 'pointer',
                      border: `1px solid ${n === 0 ? BORDER : CYAN}`,
                      background: n === 0 ? 'var(--yb-input)' : 'rgba(0,188,212,0.15)',
                      color: n === 0 ? TEXT3 : CYAN,
                      opacity: n === 0 ? 0.55 : 1,
                    }}
                  >
                    {kind} ({n}) <span style={{ fontWeight: 500, color: TEXT3 }}>· {nota}</span>
                  </button>
                ))}
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
              <Card>
                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>Origem do tráfego (visitas)</p>
                {data.fontes.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 11, color: TEXT3 }}>Sem visitas registadas no período.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                        {['utm_source', 'Visitas', 'Com click id'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: TEXT3, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.fontes.map((f, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '6px', color: NAVY }}>{f.source}</td>
                          <td style={{ padding: '6px', color: TEXT2 }}>{f.visitas}</td>
                          <td style={{ padding: '6px', fontWeight: 700, color: f.comClickId > 0 ? CYAN : TEXT3 }}>{f.comClickId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card>
                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>Estado de sincronização</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    {([
                      ['pending', 'Por exportar'],
                      ['exported', 'Exportadas (CSV gerado)'],
                      ['uploaded', 'Confirmadas no Google Ads'],
                      ['skipped', 'Excluídas'],
                    ] as const).map(([k, label]) => (
                      <tr key={k} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '6px', color: TEXT2 }}>{label}</td>
                        <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: NAVY }}>{data.sync[k] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: '10px 0 0', fontSize: 10, color: TEXT3, lineHeight: 1.5 }}>
                  &quot;Confirmadas&quot; é marcação manual — o Google não nos diz o que aceitou.
                  Depois de carregar o CSV com sucesso, confirma na consola quantas linhas entraram.
                </p>
              </Card>
            </div>

            <p style={{ margin: '18px 0 0', fontSize: 10, color: TEXT3, lineHeight: 1.6, maxWidth: 760 }}>
              Cobertura baixa não significa captura partida: leads de tráfego orgânico, directo ou de
              outras campanhas nunca terão gclid. O que interessa vigiar é a linha
              <strong style={{ color: TEXT2 }}> utm_source = google</strong> na tabela da esquerda — se
              essas visitas tiverem poucos click ids, aí sim há um problema de captura.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
