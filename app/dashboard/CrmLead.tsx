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
 * Mostra-se só quando a triagem deu Linha B. Nas outras leads não aparece nada — a
 * esmagadora maioria segue o caminho de sempre e não deve ganhar ruído por causa disto.
 */

type Consulta = {
  _id: string;
  categoria: string;
  estado: string;
  route: string;
  valorLead?: number;
  triagem: { motivo: string; confianca: string };
  consentimento?: { em: string; via: string; actor: string } | null;
};

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

  // Lead servível, ou CRM desligado: nada a mostrar.
  if (!consulta || consulta.route !== 'lead_sale') return null;

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

  const autorizado = !!consulta.consentimento;

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
        {consulta.triagem.motivo}
        {consulta.triagem.confianca !== 'alta' && (
          <span style={{ color: '#eab308' }}> · confiança {consulta.triagem.confianca}, confirme a categoria</span>
        )}
      </p>

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
    </div>
  );
}
