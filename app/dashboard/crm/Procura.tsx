'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Procura por servir — a lista de compras da angariação.
 *
 * Cada linha é uma célula `categoria × zona` com leads que não se conseguiram vender.
 * A ordem é por dinheiro perdido, porque é essa a ordem por que se deve ligar.
 *
 * A coluna que mais decide é a do **motivo**: "ninguém cobre" resolve-se a angariar
 * empresas novas; "sem saldo" resolve-se com uma chamada a quem já é parceiro. Contar as
 * duas juntas mandava as gerentes de conta atrás de mercado quando o problema era uma
 * carteira vazia.
 */

type Celula = {
  categoria: string;
  label: string;
  zona: string;
  leads: number;
  valor: number;
  cpl: number;
  parceiros: number;
  porTentar: number;
  motivos: Record<string, number>;
};

const CARD: React.CSSProperties = {
  background: 'var(--yb-card)', borderRadius: 12,
  border: '1px solid var(--yb-border)', padding: '16px 18px', marginBottom: 12,
};
const TITULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--yb-subtle)', marginBottom: 12,
};

const MOTIVO: Record<string, { label: string; cor: string; accao: string }> = {
  nenhum_cobre:     { label: 'ninguém cobre',    cor: '#f87171', accao: 'angariar' },
  sem_saldo:        { label: 'sem saldo',        cor: '#eab308', accao: 'cobrar' },
  ja_recusaram:     { label: 'já contestada',    cor: '#8B9EC9', accao: 'caso isolado' },
  bloqueio_interno: { label: 'bloqueio interno', cor: '#00bcd4', accao: 'ver configuração' },
  outro:            { label: 'outro',            cor: '#8B9EC9', accao: '—' },
};

export default function Procura() {
  const [dados, setDados] = useState<{ celulas: Celula[]; total: number; valor: number } | null>(null);
  const [dias, setDias] = useState(30);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/crm/procura?dias=${dias}`, { cache: 'no-store' })
      .then((x) => x.json()).catch(() => null);
    if (r?.success) setDados(r);
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!dados) return <p style={{ fontSize: 12, color: 'var(--yb-subtle)' }}>a carregar...</p>;

  return (
    <>
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={TITULO}>Por servir nos últimos {dias} dias</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--yb-fg)', margin: 0 }}>
            {dados.total} leads · {dados.valor.toFixed(2)} EUR
          </p>
          <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '4px 0 0' }}>
            O que se deixou de facturar por não haver a quem vender.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDias(d)} style={{
              background: dias === d ? 'rgba(0,188,212,0.15)' : 'var(--yb-input)',
              color: dias === d ? 'var(--yb-cyan)' : 'var(--yb-muted)',
              border: `1px solid ${dias === d ? 'rgba(0,188,212,0.35)' : 'var(--yb-border)'}`,
              borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>{d} dias</button>
          ))}
        </div>
      </div>

      {!dados.celulas.length && (
        <div style={CARD}>
          <p style={{ fontSize: 13, color: 'var(--yb-muted)', margin: 0 }}>
            Nada por servir neste período. Ou a rede chega para a procura, ou ainda não
            houve leads da Linha B — o quadro só se enche quando uma distribuição falha.
          </p>
        </div>
      )}

      {dados.celulas.map((c) => {
        const motivoPrincipal = Object.entries(c.motivos).sort((a, b) => b[1] - a[1])[0];
        const m = motivoPrincipal ? MOTIVO[motivoPrincipal[0]] : null;

        return (
          <div key={`${c.categoria}|${c.zona}`} style={{ ...CARD, padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: 'var(--yb-fg)' }}>{c.label}</strong>
              <span style={{ fontSize: 13, color: 'var(--yb-muted)', textTransform: 'capitalize' }}>{c.zona}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#eab308', marginLeft: 'auto' }}>
                {c.valor.toFixed(2)} EUR
              </span>
            </div>

            <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: '6px 0 0' }}>
              {c.leads} lead{c.leads === 1 ? '' : 's'} por servir
              {c.porTentar > 0 && ` · ${c.porTentar} por tentar`}
              {' · '}
              {c.parceiros === 0
                ? <span style={{ color: '#f87171', fontWeight: 600 }}>nenhum parceiro nesta categoria</span>
                : `${c.parceiros} parceiro(s) na categoria`}
            </p>

            {m && (
              <p style={{ fontSize: 11, margin: '6px 0 0' }}>
                <span style={{
                  background: `${m.cor}22`, color: m.cor, border: `1px solid ${m.cor}44`,
                  borderRadius: 10, padding: '2px 8px', fontWeight: 700, fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>{m.label}</span>
                <span style={{ color: 'var(--yb-subtle)', marginLeft: 8 }}>
                  {motivoPrincipal![1]} de {c.leads} · acção: <strong style={{ color: 'var(--yb-muted)' }}>{m.accao}</strong>
                </span>
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
