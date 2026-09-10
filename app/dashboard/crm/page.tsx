'use client';

import { useCallback, useEffect, useState } from 'react';
import { DISTRITOS, limparZona, ZONA_NACIONAL } from '@/lib/crm/zonas';
import { LARGURA_CONTEUDO } from '@/components/layout/larguras';
import Materiais from './Materiais';
import Procura from './Procura';
import Emails from './Emails';
import Prospecto from './Prospecto';

/**
 * CRM de Parceiros — painel da operadora (spec §12, fase 1).
 *
 * Três separadores, pela ordem por que se trabalha:
 *
 *   Consultas   as leads triadas, e o botão que as distribui
 *   Parceiros   quem são, o que fazem (capacidades) e quanto têm em carteira
 *   Config      CPL por categoria e as regras que a distribuição usa
 *
 * A distribuição cobra dinheiro a terceiros e não se desfaz. Por isso o botão nunca
 * distribui à primeira: mostra sempre a pré-visualização — quem recebe, quanto paga,
 * quem ficou de fora e porquê — e só o segundo clique é que executa.
 */

// ── Tipos do lado do cliente ─────────────────────────────────────────────────

type Categoria = { id: string; label: string; route: string; descricao: string };

type Consulta = {
  _id: string;
  route: 'lead_sale' | 'subcontract';
  categoria: string;
  estado: string;
  cliente: { nome?: string; telefone?: string; email?: string };
  pedido: { origem?: string; destino?: string; urgencia?: string; weightKg?: number | null; totalCm?: number | null; nVolumes?: number | null; observacoes?: string };
  triagem: { motivo: string; confianca: string };
  valorLead?: number;
  entregueAt?: string | null;
  recusaExpiraEm?: string | null;
  contradicao?: { at: string; motivo: string } | null;
  consentimento?: { em: string; via: string; actor: string; guiao?: { versao: string; texto: string } | null } | null;
  autorizacao?: { pedidaEm: string; para: string; expiraEm: string; respondidaEm?: string | null; resposta?: 'sim' | 'nao' | null; falhouEm?: string } | null;
  history: { estado: string; timestamp: string; actor: string; motivo: string }[];
  createdAt: string;
};

type Parceiro = {
  _id: string; nome: string; estado: string; score: number; saldo: number;
  telefone?: string; email?: string; contacto?: string; nif?: string;
  morada?: string; zonas?: string[]; motivoSaida?: string;
  canaisPreferidos: string[]; leadsGratisRestantes: number; notas?: string;
};

type Capacidade = {
  _id: string; partnerId: string; categoria: string; zonas: string[];
  maxWeightKg?: number | null; maxDimensionCm?: number | null;
  adr?: boolean; temperatura?: boolean; prioridade: number; active: boolean;
};

type Candidato = {
  partnerId: string; nome: string; estado: string; score: number;
  saldo: number; custo: number; gratis: boolean; recebe: boolean; motivo: string;
};

type Previsao = {
  crmActivo: boolean; categoria: string; confianca: string; valorLead: number;
  maxParceirosPorLead: number; candidatos: Candidato[];
  excluidos: { partnerId: string; motivo: string }[]; avisos: string[];
};

type Envio = {
  _id: string; canal: string; estado: string; nomeParceiro: string; partnerId: string;
  sentAt?: string | null; erro?: string | null;
};

type Outcome = {
  _id: string; fonte: string; tipo: string; motivo?: string;
  valorServico?: number | null; avaliacao?: number | null; createdAt: string;
};

type Config = {
  active: boolean; envioAutomatico: boolean; pedirAutorizacaoPorEmail: boolean;
  autorizacaoValidadeHoras: number; cpl: Record<string, number>; maxParceirosPorLead: number;
  janelaRecusaHoras: number; followUpHoras: number; limiteAvisoSaldo: number; leadsGratisTrial: number;
};

// ── Estilos partilhados ──────────────────────────────────────────────────────

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
  color: 'var(--yb-fg)', borderRadius: 8, padding: '7px 10px', fontSize: 13,
  colorScheme: 'inherit' as const,
};
const LABEL: React.CSSProperties = { fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 };

function botao(variante: 'primario' | 'neutro' | 'perigo' = 'neutro'): React.CSSProperties {
  const cores = {
    primario: { bg: 'rgba(0,188,212,0.15)', fg: 'var(--yb-cyan)', bd: 'rgba(0,188,212,0.35)' },
    neutro:   { bg: 'var(--yb-input)', fg: 'var(--yb-muted)', bd: 'var(--yb-border)' },
    perigo:   { bg: 'rgba(248,113,113,0.12)', fg: 'var(--yb-error)', bd: 'rgba(248,113,113,0.3)' },
  }[variante];
  return {
    background: cores.bg, color: cores.fg, border: `1px solid ${cores.bd}`,
    borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  };
}

function Etiqueta({ texto, cor }: { texto: string; cor: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
      padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase',
      background: `${cor}22`, color: cor, border: `1px solid ${cor}44`,
    }}>{texto}</span>
  );
}

const COR_ESTADO: Record<string, string> = {
  triada: '#8B9EC9', qualificada: '#00bcd4', 'distribuída': '#00bcd4',
  entregue: '#22c55e', em_reporte: '#eab308', fechada: '#22c55e',
  recusada: '#f87171', expirada: '#4a6080',
};

const COR_CONFIANCA: Record<string, string> = { alta: '#22c55e', media: '#eab308', baixa: '#f87171' };

const COR_ENVIO: Record<string, string> = {
  enviado: '#00bcd4', entregue: '#22c55e', visto: '#22c55e', aceite: '#22c55e',
  recusado: '#f87171', expirado: '#4a6080', falhado: '#f87171',
};

const COR_FONTE: Record<string, string> = { parceiro: '#eab308', cliente: '#22c55e', plataforma: '#8B9EC9' };

/** O que cada tipo de resultado quer dizer em português corrente. */
const ROTULO_OUTCOME: Record<string, string> = {
  ganhou: 'Parceiro fechou o serviço',
  perdeu: 'Parceiro não fechou',
  nao_executado: 'Não chegou a realizar-se',
  recusa: 'Lead contestada',
  resolveu: 'Cliente resolveu o transporte',
  nao_resolveu: 'Cliente não resolveu',
  avaliacao: 'Avaliação do cliente',
  abriu: 'Parceiro abriu a lead',
  contacto_revelado: 'Contacto revelado',
  sem_accao: 'Sem acção do parceiro',
};

// ── Página ───────────────────────────────────────────────────────────────────

export default function CrmPage() {
  const [aba, setAba] = useState<'consultas' | 'parceiros' | 'procura' | 'emails' | 'config'>('consultas');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [limites, setLimites] = useState<{ maxKg: number; maxCm: number } | null>(null);

  const carregarConfig = useCallback(async () => {
    const r = await fetch('/api/crm/config').then((x) => x.json()).catch(() => null);
    if (r?.success) { setConfig(r.config); setCategorias(r.categorias); setLimites(r.limites); }
  }, []);

  useEffect(() => { carregarConfig(); }, [carregarConfig]);

  const labelCategoria = (id: string) => categorias.find((c) => c.id === id)?.label ?? id;

  return (
    <div style={{ flex: 1, overflowY: 'auto', height: '100%', background: 'var(--yb-bg)', padding: '20px 24px' }}>
      <div style={{ maxWidth: LARGURA_CONTEUDO, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--yb-fg)', margin: 0 }}>CRM de Parceiros</h1>
          <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: '4px 0 0' }}>
            Subcontratação e venda de leads não servíveis.{' '}
            {config && !config.active && (
              <strong style={{ color: 'var(--yb-error)' }}>Distribuição desligada na configuração.</strong>
            )}
          </p>
        </header>

        <nav style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {([
            ['consultas', 'Consultas'],
            ['parceiros', 'Parceiros'],
            ['procura', 'Por servir'],
            ['emails', 'Emails'],
            ['config', 'Configuração'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setAba(id)} style={{
              ...botao(aba === id ? 'primario' : 'neutro'),
              padding: '7px 16px',
            }}>{label}</button>
          ))}
        </nav>

        {aba === 'consultas' && (
          <Consultas labelCategoria={labelCategoria} categorias={categorias}
            config={config} aoMudarConfig={carregarConfig} />
        )}
        {aba === 'parceiros' && <Parceiros categorias={categorias} />}
        {aba === 'procura' && <Procura />}
        {aba === 'emails' && <Emails />}
        {aba === 'config' && (
          <Configuracao config={config} categorias={categorias} limites={limites} aoGravar={carregarConfig} />
        )}
      </div>
    </div>
  );
}

// ── Consultas ────────────────────────────────────────────────────────────────

/**
 * Janelas de tempo. Os mesmos rotulos da lista de Leads, para quem salta de um separador
 * para o outro nao ter de aprender duas linguagens. Devolve o intervalo em ISO, ou null
 * quando e "sempre".
 */
function periodo(chave: string): { de?: string; ate?: string } | null {
  const agora = new Date();
  const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (chave === 'hoje') return { de: meiaNoite(agora).toISOString() };
  if (chave === 'ontem') {
    const ontem = new Date(agora); ontem.setDate(ontem.getDate() - 1);
    return { de: meiaNoite(ontem).toISOString(), ate: meiaNoite(agora).toISOString() };
  }
  if (chave === '7dias') {
    const d = new Date(agora); d.setDate(d.getDate() - 6);
    return { de: meiaNoite(d).toISOString() };
  }
  return null;
}

function Consultas({ labelCategoria, categorias, config, aoMudarConfig }: {
  labelCategoria: (id: string) => string;
  categorias: Categoria[];
  config: Config | null;
  aoMudarConfig: () => void;
}) {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [filtroRota, setFiltroRota] = useState<'' | 'lead_sale' | 'subcontract'>('lead_sale');
  const [filtroData, setFiltroData] = useState('sempre');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [leadId, setLeadId] = useState('');
  const [manual, setManual] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setACarregar(true);
    const p = new URLSearchParams();
    if (filtroRota) p.set('route', filtroRota);
    if (filtroCategoria) p.set('categoria', filtroCategoria);
    const janela = periodo(filtroData);
    if (janela?.de) p.set('dateFrom', janela.de);
    if (janela?.ate) p.set('dateTo', janela.ate);
    const qs = p.toString();
    const r = await fetch(`/api/crm/consultas${qs ? '?' + qs : ''}`).then((x) => x.json()).catch(() => null);
    if (r?.success) setConsultas(r.consultas);
    setACarregar(false);
  }, [filtroRota, filtroCategoria, filtroData]);

  useEffect(() => { carregar(); }, [carregar]);

  async function criarDeLead() {
    setErro('');
    const id = leadId.trim();
    if (!id) return;
    const r = await fetch('/api/crm/consultas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: id }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.success) { setLeadId(''); carregar(); }
    else setErro(r?.error ?? 'não foi possível criar a consulta');
  }

  return (
    <>
      <div style={{ ...CARD, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={LABEL}>Triar uma lead existente</label>
          <input
            style={INPUT} placeholder="id da lead (messages._id)"
            value={leadId} onChange={(e) => setLeadId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') criarDeLead(); }}
          />
        </div>
        <button onClick={criarDeLead} style={botao('primario')}>Triar</button>
        <div style={{ flex: '1 1 140px' }}>
          <label style={LABEL}>Linha</label>
          <select style={INPUT} value={filtroRota} onChange={(e) => setFiltroRota(e.target.value as any)}>
            <option value="lead_sale">B — venda de lead</option>
            <option value="subcontract">A — subcontratação</option>
            <option value="">todas</option>
          </select>
        </div>
        <button onClick={() => setManual(!manual)} style={botao(manual ? 'neutro' : 'primario')}>
          {manual ? 'Cancelar' : 'Consulta manual'}
        </button>
        {config && <InterruptorAutorizacao config={config} aoMudar={aoMudarConfig} />}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', width: '100%' }}>
          {([['sempre', 'Sempre'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7dias', '7 dias']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFiltroData(k)} style={{
              ...botao(filtroData === k ? 'primario' : 'neutro'), padding: '5px 12px', fontSize: 11,
            }}>{l}</button>
          ))}
          <select style={{ ...INPUT, width: 'auto', minWidth: 190, marginLeft: 'auto' }}
            value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias
              .filter((c) => !filtroRota || c.route === filtroRota)
              .map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        {erro && <p style={{ fontSize: 12, color: 'var(--yb-error)', margin: 0, width: '100%' }}>{erro}</p>}
      </div>

      {manual && <FormConsultaManual aoCriar={() => { setManual(false); carregar(); }} />}

      {aCarregar && <p style={{ fontSize: 12, color: 'var(--yb-subtle)' }}>a carregar...</p>}
      {!aCarregar && !consultas.length && !manual && (
        <div style={CARD}>
          <p style={{ fontSize: 13, color: 'var(--yb-muted)', margin: 0 }}>
            {filtroData !== 'sempre' || filtroCategoria
              ? 'Nada neste período ou categoria. Alargue o filtro para ver o resto.'
              : 'Sem consultas. Cole o id de uma lead acima para a triar, ou use a consulta manual para um pedido que chegou por telefone.'}
          </p>
        </div>
      )}

      {consultas.map((c) => (
        <LinhaConsulta
          key={c._id}
          consulta={c}
          labelCategoria={labelCategoria}
          aberta={aberta === c._id}
          aoAbrir={() => setAberta(aberta === c._id ? null : c._id)}
          aoMudar={carregar}
        />
      ))}
    </>
  );
}


/**
 * Interruptor do pedido automático de autorização, à mão de quem está ao balcão.
 *
 * Vive aqui e não só na Configuração porque a decisão de o ligar ou desligar muda várias
 * vezes por dia — desliga-se ao entrar de manhã, liga-se ao sair. Um interruptor que
 * obriga a mudar de separador para se usar acaba por ficar sempre na mesma posição.
 */
function InterruptorAutorizacao({ config, aoMudar }: { config: Config; aoMudar: () => void }) {
  const [aGravar, setAGravar] = useState(false);
  const ligado = !!config.pedirAutorizacaoPorEmail;

  async function alternar() {
    setAGravar(true);
    await fetch('/api/crm/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, pedirAutorizacaoPorEmail: !ligado }),
    }).catch(() => null);
    setAGravar(false);
    aoMudar();
  }

  return (
    <button onClick={alternar} disabled={aGravar} title="Pedir a autorização ao cliente por email, sem operadora"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto',
        background: ligado ? 'rgba(0,188,212,0.12)' : 'var(--yb-input)',
        border: `1px solid ${ligado ? 'rgba(0,188,212,0.35)' : 'var(--yb-border)'}`,
        borderRadius: 20, padding: '5px 12px 5px 8px', cursor: aGravar ? 'wait' : 'pointer',
        opacity: aGravar ? 0.6 : 1,
      }}>
      <span style={{
        width: 30, height: 17, borderRadius: 10, flexShrink: 0, position: 'relative',
        background: ligado ? 'var(--yb-cyan)' : 'var(--yb-border)', transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: ligado ? 15 : 2,
          width: 13, height: 13, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s',
        }} />
      </span>
      <span style={{ textAlign: 'left' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: ligado ? 'var(--yb-cyan)' : 'var(--yb-muted)', display: 'block' }}>
          Autorização por email {ligado ? 'ligada' : 'desligada'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--yb-subtle)', display: 'block' }}>
          {ligado ? 'as leads novas recebem o pedido sozinhas' : 'a autorização é pedida ao telefone'}
        </span>
      </span>
    </button>
  );
}

/**
 * Consulta criada à mão — o pedido que chegou por telefone ou email e nunca passou
 * pelo site.
 *
 * Não há aqui campo para escolher a categoria nem a linha, e é de propósito: a triagem
 * é automática (spec §3). Escreve-se o que o cliente disse, e o sistema classifica.
 * O que o operador controla é a qualidade do que escreve nas observações — é de lá que
 * saem quase todos os sinais.
 */
function FormConsultaManual({ aoCriar }: { aoCriar: () => void }) {
  const [d, setD] = useState({
    nome: '', telefone: '', email: '',
    origem: '', destino: '', urgencia: '24 Horas',
    weightKg: '', nVolumes: '', totalCm: '', observacoes: '',
  });
  const [erro, setErro] = useState('');
  const [aGravar, setAGravar] = useState(false);

  async function gravar() {
    setErro('');
    if (!d.telefone.trim() && !d.email.trim()) {
      setErro('a lead precisa de telefone ou email — sem contacto não vale nada para vender, nem há a quem fazer o follow-up');
      return;
    }
    setAGravar(true);
    const r = await fetch('/api/crm/consultas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origem: { tipo: 'telefone' },
        cliente: { nome: d.nome, telefone: d.telefone, email: d.email },
        pedido: {
          origem: d.origem, destino: d.destino, urgencia: d.urgencia,
          weightKg: d.weightKg ? Number(d.weightKg) : null,
          nVolumes: d.nVolumes ? Number(d.nVolumes) : null,
          totalCm: d.totalCm ? Number(d.totalCm) : null,
          observacoes: d.observacoes,
        },
      }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) aoCriar();
    else setErro(r?.error ?? 'não foi possível criar a consulta');
  }

  const campo = (k: keyof typeof d, label: string, placeholder = '') => (
    <div>
      <label style={LABEL}>{label}</label>
      <input style={INPUT} placeholder={placeholder} value={d[k]}
        onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </div>
  );

  return (
    <div style={CARD}>
      <p style={TITULO}>Pedido recebido por telefone</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 10 }}>
        {campo('nome', 'Nome do cliente')}
        {campo('telefone', 'Telefone')}
        {campo('email', 'Email')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 10 }}>
        {campo('origem', 'Recolha', 'Rua, cidade')}
        {campo('destino', 'Entrega', 'Rua, cidade')}
        <div>
          <label style={LABEL}>Prazo</label>
          <select style={INPUT} value={d.urgencia} onChange={(e) => setD({ ...d, urgencia: e.target.value })}>
            <option>1 Hora</option>
            <option>4 Horas</option>
            <option>24 Horas</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 10 }}>
        {campo('weightKg', 'Peso total (kg)')}
        {campo('nVolumes', 'Nº de volumes')}
        {campo('totalCm', 'C+L+A do maior (cm)')}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={LABEL}>O que o cliente disse</label>
        <textarea
          style={{ ...INPUT, minHeight: 64, resize: 'vertical' }}
          placeholder="por palavras dele — é daqui que a triagem tira a categoria"
          value={d.observacoes}
          onChange={(e) => setD({ ...d, observacoes: e.target.value })}
        />
      </div>

      {erro && <p style={{ fontSize: 12, color: 'var(--yb-error)', margin: '0 0 10px' }}>{erro}</p>}

      <button onClick={gravar} disabled={aGravar} style={{ ...botao('primario'), opacity: aGravar ? 0.5 : 1 }}>
        {aGravar ? 'a triar...' : 'Criar e triar'}
      </button>
    </div>
  );
}

function LinhaConsulta({
  consulta, labelCategoria, aberta, aoAbrir, aoMudar,
}: {
  consulta: Consulta; labelCategoria: (id: string) => string;
  aberta: boolean; aoAbrir: () => void; aoMudar: () => void;
}) {
  const rota = consulta.route === 'lead_sale' ? 'B' : 'A';
  const cor = COR_ESTADO[consulta.estado] ?? 'var(--yb-muted)';

  return (
    <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
      <button onClick={aoAbrir} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '13px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <Etiqueta texto={`Linha ${rota}`} cor={rota === 'B' ? '#eab308' : '#00bcd4'} />
        <Etiqueta texto={consulta.estado} cor={cor} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)' }}>
          {labelCategoria(consulta.categoria)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--yb-muted)' }}>
          {consulta.cliente.nome ?? consulta.cliente.telefone ?? 'sem nome'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--yb-subtle)', marginLeft: 'auto' }}>
          {new Date(consulta.createdAt).toLocaleString('pt-PT')}
        </span>
      </button>

      {aberta && <DetalheConsulta consulta={consulta} aoMudar={aoMudar} />}
    </div>
  );
}

function DetalheConsulta({ consulta, aoMudar }: { consulta: Consulta; aoMudar: () => void }) {
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [aDistribuir, setADistribuir] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [falhados, setFalhados] = useState<{ nome: string; motivo: string }[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [resultados, setResultados] = useState<Outcome[]>([]);
  const [nomesParceiros, setNomesParceiros] = useState<Record<string, string>>({});
  const p = consulta.pedido;

  // Os envios e os resultados nao vem na listagem — sao do detalhe. Sem esta chamada,
  // o reporte do parceiro e a resposta do cliente ficavam gravados e invisiveis.
  const carregarDetalhe = useCallback(async () => {
    const r = await fetch(`/api/crm/consultas/${consulta._id}`).then((x) => x.json()).catch(() => null);
    if (r?.success) {
      setEnvios(r.envios ?? []);
      setResultados(r.resultados ?? []);
      setNomesParceiros(r.parceiros ?? {});
    }
  }, [consulta._id]);

  useEffect(() => { carregarDetalhe(); }, [carregarDetalhe]);

  const carga = [
    p.nVolumes ? `${p.nVolumes} volume(s)` : null,
    p.totalCm ? `C+L+A ${p.totalCm} cm` : null,
    p.weightKg ? `${p.weightKg} kg` : null,
  ].filter(Boolean).join(' · ');

  async function verPrevisao() {
    const r = await fetch(`/api/crm/consultas/${consulta._id}/distribuir`).then((x) => x.json()).catch(() => null);
    if (r?.success) setPrevisao(r);
    else setResultado(r?.error ?? 'não foi possível calcular');
  }

  async function distribuir() {
    setADistribuir(true);
    setResultado(null);
    setFalhados([]);
    const r = await fetch(`/api/crm/consultas/${consulta._id}/distribuir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forcarConfiancaBaixa: consulta.triagem.confianca === 'baixa' }),
    }).then((x) => x.json()).catch(() => null);
    setADistribuir(false);

    if (r?.success) {
      setResultado(`Entregue a ${r.entregues.map((e: any) => `${e.nome} (${e.canal})`).join(', ')}.`);
      setPrevisao(null);
      carregarDetalhe();
      aoMudar();
    } else {
      setResultado(r?.error ?? 'falhou');
      // O motivo de cada parceiro que ficou pelo caminho. Sem isto, "nenhum parceiro
      // recebeu a lead" e um encolher de ombros era tudo o que a operadora tinha.
      setFalhados(Array.isArray(r?.falhados) ? r.falhados : []);
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--yb-border)', padding: '14px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14, marginBottom: 14 }}>
        <div>
          <p style={TITULO}>Cliente</p>
          <Campo k="Nome" v={consulta.cliente.nome} />
          <Campo k="Telefone" v={consulta.cliente.telefone} />
          <Campo k="Email" v={consulta.cliente.email} />
        </div>
        <div>
          <p style={TITULO}>Pedido</p>
          <Campo k="Recolha" v={p.origem} />
          <Campo k="Entrega" v={p.destino} />
          <Campo k="Prazo" v={p.urgencia} />
          <Campo k="Carga" v={carga} />
        </div>
        <div>
          <p style={TITULO}>Triagem</p>
          <div style={{ marginBottom: 5 }}>
            <Etiqueta texto={`confiança ${consulta.triagem.confianca}`} cor={COR_CONFIANCA[consulta.triagem.confianca] ?? '#8B9EC9'} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: 0, lineHeight: 1.5 }}>{consulta.triagem.motivo}</p>
          {consulta.valorLead ? <Campo k="CPL" v={`${consulta.valorLead.toFixed(2)} EUR`} /> : null}
          {consulta.recusaExpiraEm && (
            <Campo k="Recusa até" v={new Date(consulta.recusaExpiraEm).toLocaleString('pt-PT')} />
          )}
        </div>
      </div>

      {p.observacoes && (
        <p style={{ fontSize: 12, color: 'var(--yb-muted)', background: 'var(--yb-input)', padding: '8px 10px', borderRadius: 8, margin: '0 0 14px' }}>
          {p.observacoes}
        </p>
      )}

      {consulta.route === 'lead_sale' && !consulta.consentimento
        && ['triada', 'qualificada', 'recusada'].includes(consulta.estado) && (
        <Consentimento consultaId={consulta._id} aoRegistar={() => { carregarDetalhe(); aoMudar(); }} />
      )}

      {/* Perguntado e sem resposta e diferente de nao perguntado: o primeiro ja nao
          precisa de chamada, o segundo precisa. Sem esta linha eram indistinguiveis. */}
      {!consulta.consentimento && consulta.autorizacao && (
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 8px', lineHeight: 1.5 }}>
          {consulta.autorizacao.falhouEm
            ? <strong style={{ color: 'var(--yb-error)' }}>O pedido de autorizacao nao chegou a sair (o email falhou). Ligue ao cliente.</strong>
            : consulta.autorizacao.resposta === 'nao'
              ? <strong style={{ color: 'var(--yb-error)' }}>O cliente respondeu que nao autoriza. A consulta fica fechada.</strong>
              : <>Pedido de autorizacao enviado para {consulta.autorizacao.para} em{' '}
                  {new Date(consulta.autorizacao.pedidaEm).toLocaleString('pt-PT')}. Sem resposta ate agora;
                  o link expira a {new Date(consulta.autorizacao.expiraEm).toLocaleString('pt-PT')}.</>}
        </p>
      )}

      {consulta.consentimento && (
        <p style={{ fontSize: 11, color: '#22c55e', margin: '0 0 12px' }}>
          Autorizado pelo cliente em {new Date(consulta.consentimento.em).toLocaleString('pt-PT')}
          {' '}(via {consulta.consentimento.via}, registado por {consulta.consentimento.actor})
        </p>
      )}

      {consulta.route === 'lead_sale' && ['triada', 'qualificada', 'recusada'].includes(consulta.estado) && (
        <div style={{ marginBottom: 14 }}>
          {!previsao ? (
            <button onClick={verPrevisao} style={botao('primario')}>Ver quem recebe</button>
          ) : (
            <Previsualizacao previsao={previsao} aDistribuir={aDistribuir} aoDistribuir={distribuir} aoFechar={() => setPrevisao(null)} />
          )}
        </div>
      )}

      {resultado && (
        <div style={{ background: 'var(--yb-input)', padding: '9px 11px', borderRadius: 8, marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--yb-fg)', margin: 0 }}>{resultado}</p>
          {falhados.map((f, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--yb-error)', margin: '6px 0 0', lineHeight: 1.5 }}>
              <strong>{f.nome}</strong> — {f.motivo}
            </p>
          ))}
        </div>
      )}

      {consulta.contradicao && (
        <Contradicao
          consulta={consulta}
          partnerId={envios.find((e) => e.estado === 'recusado')?.partnerId}
          nomeParceiro={envios.find((e) => e.estado === 'recusado')?.nomeParceiro}
          aoCobrar={() => { carregarDetalhe(); aoMudar(); }}
        />
      )}

      {(envios.length > 0 || resultados.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 14 }}>
          {envios.length > 0 && (
            <div>
              <p style={TITULO}>Envios</p>
              {envios.map((e) => (
                <div key={e._id} style={{ padding: '5px 0', borderBottom: '1px solid var(--yb-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--yb-fg)', fontWeight: 600 }}>{e.nomeParceiro}</span>
                    <Etiqueta texto={e.canal} cor="#8B9EC9" />
                    <Etiqueta texto={e.estado} cor={COR_ENVIO[e.estado] ?? '#8B9EC9'} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--yb-subtle)' }}>
                    {e.sentAt ? new Date(e.sentAt).toLocaleString('pt-PT') : 'sem envio'}
                    {e.erro ? ` · ${e.erro}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* As tres fontes da triangulacao (spec §6). E aqui que se ve o que o parceiro
              reportou e o que o cliente respondeu ao follow-up. */}
          {resultados.length > 0 && (
            <div>
              <p style={TITULO}>Resultados reportados</p>
              {resultados.map((r) => (
                <div key={r._id} style={{ padding: '5px 0', borderBottom: '1px solid var(--yb-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Etiqueta texto={r.fonte} cor={COR_FONTE[r.fonte] ?? '#8B9EC9'} />
                    <span style={{ fontSize: 12, color: 'var(--yb-fg)', fontWeight: 600 }}>
                      {ROTULO_OUTCOME[r.tipo] ?? r.tipo}
                    </span>
                    {r.avaliacao != null && (
                      <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>{r.avaliacao}/5</span>
                    )}
                    {r.valorServico != null && (
                      <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>{r.valorServico.toFixed(2)} EUR</span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--yb-subtle)' }}>
                    {new Date(r.createdAt).toLocaleString('pt-PT')}
                    {r.motivo ? ` · ${r.motivo}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <details>
        <summary style={{ ...TITULO, cursor: 'pointer', marginBottom: 8 }}>Histórico</summary>
        {consulta.history.map((h, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--yb-muted)', padding: '4px 0', borderBottom: '1px solid var(--yb-border)' }}>
            <span style={{ color: 'var(--yb-fg)', fontWeight: 600 }}>{h.estado}</span>
            {' · '}{new Date(h.timestamp).toLocaleString('pt-PT')}
            {' · '}{nomeDoActor(h.actor, nomesParceiros)}
            <br />
            <span style={{ color: 'var(--yb-subtle)' }}>{h.motivo}</span>
          </div>
        ))}
      </details>
    </div>
  );
}

/**
 * Pré-visualização da distribuição.
 *
 * O ponto desta caixa é não haver surpresas: quem recebe, quanto lhe é debitado, quem
 * ficou de fora e porquê. Só depois de a ler é que aparece o botão que executa.
 */
function Previsualizacao({
  previsao, aDistribuir, aoDistribuir, aoFechar,
}: {
  previsao: Previsao; aDistribuir: boolean; aoDistribuir: () => void; aoFechar: () => void;
}) {
  const vaiReceber = previsao.candidatos.filter((c) => c.recebe);
  const total = vaiReceber.reduce((s, c) => s + c.custo, 0);

  return (
    <div style={{ background: 'var(--yb-input)', borderRadius: 10, padding: 14, border: '1px solid var(--yb-border)' }}>
      <p style={TITULO}>Antes de distribuir</p>

      {previsao.avisos.map((a, i) => (
        <p key={i} style={{ fontSize: 12, color: 'var(--yb-error)', margin: '0 0 6px' }}>{a}</p>
      ))}

      {previsao.candidatos.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: '0 0 10px' }}>
          Nenhum parceiro tem capacidade declarada para esta categoria.
        </p>
      )}

      {previsao.candidatos.map((c) => (
        <div key={c.partnerId} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
          borderBottom: '1px solid var(--yb-border)', opacity: c.recebe ? 1 : 0.5,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--yb-fg)', minWidth: 120 }}>{c.nome}</span>
          <Etiqueta texto={c.estado} cor={c.estado === 'ativo' ? '#22c55e' : '#8B9EC9'} />
          <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>score {c.score}</span>
          <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>saldo {c.saldo.toFixed(2)} EUR</span>
          <span style={{ fontSize: 11, color: c.gratis ? '#22c55e' : 'var(--yb-fg)', fontWeight: 600 }}>
            {c.gratis ? 'lead de trial' : `-${c.custo.toFixed(2)} EUR`}
          </span>
          <span style={{ fontSize: 11, color: 'var(--yb-subtle)', marginLeft: 'auto' }}>{c.motivo}</span>
        </div>
      ))}

      {previsao.excluidos.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: 'var(--yb-subtle)', cursor: 'pointer' }}>
            {previsao.excluidos.length} parceiro(s) excluído(s)
          </summary>
          {previsao.excluidos.map((e, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '4px 0 0' }}>{e.motivo}</p>
          ))}
        </details>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button
          onClick={aoDistribuir}
          disabled={aDistribuir || !vaiReceber.length || !previsao.crmActivo}
          style={{ ...botao('primario'), opacity: aDistribuir || !vaiReceber.length || !previsao.crmActivo ? 0.4 : 1 }}
        >
          {aDistribuir
            ? 'a distribuir...'
            : total > 0
              ? `Distribuir e cobrar ${total.toFixed(2)} EUR`
              // Sem custo é sempre uma lead de trial: as 5 grátis da angariação, que a
              // spec §6.1 troca por reporte. Dizer "cobrar 0.00 EUR" era enganador.
              : `Distribuir sem custo (${vaiReceber.length === 1 ? 'lead' : 'leads'} de trial)`}
        </button>
        <button onClick={aoFechar} style={botao()}>Cancelar</button>
      </div>
    </div>
  );
}

/**
 * Autorização do cliente, recolhida ao telefone.
 *
 * É o portão da Linha B: sem isto o `distribuir()` recusa-se a correr. A chamada
 * acontece de qualquer maneira — a YourBox liga em minutos — por isso a pergunta não
 * custa nada de novo; o que custa é fazê-la de maneira diferente cada vez.
 *
 * Daí o guião estar aqui à vista e vir do servidor: a operadora lê o que está escrito,
 * e é esse texto que fica guardado com o registo. O RGPD pede que se demonstre o
 * consentimento, e demonstrar é conseguir dizer o que a pessoa ouviu.
 */
function Consentimento({ consultaId, aoRegistar }: { consultaId: string; aoRegistar: () => void }) {
  const [guiao, setGuiao] = useState<{ versao: string; texto: string } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetch(`/api/crm/consultas/${consultaId}/consentimento`)
      .then((x) => x.json())
      .then((r) => { if (r?.success) setGuiao(r.guiao); })
      .catch(() => {});
  }, [consultaId]);

  async function registar(via: 'telefone' | 'email') {
    setAGravar(true);
    setErro('');
    const r = await fetch(`/api/crm/consultas/${consultaId}/consentimento`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ via }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) aoRegistar();
    else setErro(r?.error ?? 'não foi possível registar');
  }

  return (
    <div style={{
      background: 'rgba(0,188,212,0.07)', border: '1px solid rgba(0,188,212,0.3)',
      borderRadius: 10, padding: '12px 14px', marginBottom: 14,
    }}>
      <p style={{ ...TITULO, color: 'var(--yb-cyan)', marginBottom: 8 }}>Falta a autorização do cliente</p>
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 8px' }}>
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
        <button onClick={() => registar('telefone')} disabled={aGravar || !guiao}
          style={{ ...botao('primario'), opacity: aGravar || !guiao ? 0.4 : 1 }}>
          {aGravar ? 'a registar...' : 'Autorizou, ao telefone'}
        </button>
        <button onClick={() => registar('email')} disabled={aGravar || !guiao}
          style={{ ...botao(), opacity: aGravar || !guiao ? 0.4 : 1 }}>
          Autorizou, por email
        </button>
        <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>
          Se recusar, não registe nada — a lead fica por distribuir.
        </span>
      </div>
      {erro && <p style={{ fontSize: 11, color: 'var(--yb-error)', margin: '8px 0 0' }}>{erro}</p>}
    </div>
  );
}

/**
 * Aviso de contradição entre as fontes (spec §6).
 *
 * O parceiro contestou a lead e o cliente diz que ficou resolvida. O sistema não cobra
 * sozinho de propósito: o cliente pode ter resolvido com outra empresa qualquer, e uma
 * cobrança automática a partir de uma inferência estraga a relação com um parceiro
 * honesto por causa de um caso ambíguo. Quem decide é quem conhece o parceiro.
 *
 * O que o sistema faz sozinho é contar: a recusa contradita pesa a dobrar no score, e
 * quem repete deixa de receber leads (spec §6.5).
 */
function Contradicao({
  consulta, partnerId, nomeParceiro, aoCobrar,
}: {
  consulta: Consulta; partnerId?: string; nomeParceiro?: string; aoCobrar: () => void;
}) {
  const [aCobrar, setACobrar] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const valor = consulta.valorLead ?? 0;

  async function cobrar() {
    if (!partnerId) return;
    setACobrar(true);
    const r = await fetch(`/api/crm/parceiros/${partnerId}/carteira`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valor: -valor,
        tipo: 'ajuste',
        motivo: `recusa contradita pelo cliente na lead ${consulta._id.slice(-5).toUpperCase()}`,
      }),
    }).then((x) => x.json()).catch(() => null);
    setACobrar(false);
    setFeito(r?.success ? `Cobrado. Saldo: ${Number(r.saldo).toFixed(2)} EUR.` : (r?.error ?? 'não foi possível cobrar'));
    if (r?.success) aoCobrar();
  }

  return (
    <div style={{
      background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.35)',
      borderRadius: 10, padding: '12px 14px', marginBottom: 14,
    }}>
      <p style={{ ...TITULO, color: '#eab308', marginBottom: 6 }}>As fontes não batem certo</p>
      <p style={{ fontSize: 12, color: 'var(--yb-fg)', margin: '0 0 4px', lineHeight: 1.55 }}>
        {nomeParceiro ?? 'O parceiro'} contestou esta lead e recebeu o valor de volta.
        O cliente, no follow-up, diz que <strong>ficou resolvida</strong>.
      </p>
      <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Não cobrámos nada — o cliente pode ter resolvido com outra empresa. A recusa já
        conta a dobrar no score do parceiro. Detectado a {new Date(consulta.contradicao!.at).toLocaleString('pt-PT')}.
      </p>
      {feito ? (
        <p style={{ fontSize: 12, color: 'var(--yb-fg)', margin: 0 }}>{feito}</p>
      ) : partnerId && valor > 0 ? (
        <button onClick={cobrar} disabled={aCobrar} style={{ ...botao('perigo'), opacity: aCobrar ? 0.5 : 1 }}>
          {aCobrar ? 'a cobrar...' : `Cobrar novamente ${valor.toFixed(2)} EUR`}
        </button>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: 0 }}>
          Sem valor a cobrar: esta lead foi de trial.
        </p>
      )}
    </div>
  );
}

/**
 * O `actor` do historico e gravado como id — `parceiro:<id>` — de proposito: e o que
 * nao muda quando o parceiro trocar de nome. Aqui traduz-se so para leitura, e cai de
 * volta no id quando o parceiro ja nao existe.
 */
function nomeDoActor(actor: string, nomes: Record<string, string>): string {
  const m = /^parceiro:(.+)$/.exec(actor);
  if (!m) return actor;
  return nomes[m[1]] ? `parceiro: ${nomes[m[1]]}` : actor;
}

function Campo({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <p style={{ fontSize: 12, margin: '0 0 3px', color: 'var(--yb-fg)' }}>
      <span style={{ color: 'var(--yb-subtle)' }}>{k}: </span>{v}
    </p>
  );
}

// ── Parceiros ────────────────────────────────────────────────────────────────

function Parceiros({ categorias }: { categorias: Categoria[] }) {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch('/api/crm/parceiros').then((x) => x.json()).catch(() => null);
    if (r?.success) setParceiros(r.parceiros);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => setNovo(!novo)} style={botao('primario')}>
          {novo ? 'Cancelar' : 'Novo parceiro'}
        </button>
      </div>

      {novo && <FormNovoParceiro aoCriar={() => { setNovo(false); carregar(); }} />}

      {parceiros.map((p) => (
        <div key={p._id} style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          <button onClick={() => setAberto(aberto === p._id ? null : p._id)} style={{
            width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '13px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--yb-fg)' }}>{p.nome}</span>
            <Etiqueta texto={p.estado} cor={p.estado === 'ativo' ? '#22c55e' : p.estado === 'suspenso' ? '#f87171' : '#8B9EC9'} />
            <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>score {p.score}</span>
            {p.leadsGratisRestantes > 0 && (
              <Etiqueta texto={`${p.leadsGratisRestantes} leads de trial`} cor="#eab308" />
            )}
            <span style={{
              fontSize: 12, fontWeight: 700, marginLeft: 'auto',
              color: p.saldo > 0 ? 'var(--yb-fg)' : 'var(--yb-error)',
            }}>{p.saldo.toFixed(2)} EUR</span>
          </button>

          {aberto === p._id && <DetalheParceiro parceiro={p} categorias={categorias} aoMudar={carregar} />}
        </div>
      ))}

      {!parceiros.length && !novo && (
        <div style={CARD}>
          <p style={{ fontSize: 13, color: 'var(--yb-muted)', margin: 0 }}>
            Sem parceiros. A fase 1 começa pela angariação nas categorias em falta: viaturas,
            mudanças, ADR, temperatura controlada e cargas fora de gabarito.
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Zonas que uma empresa cobre.
 *
 * Botões e não caixa de texto porque a zona é uma chave de cruzamento: "Setúbal",
 * "setubal" e "Setubal " são a mesma coisa para quem escreve e três zonas diferentes
 * para a distribuição — e o parceiro que ficasse com a variante errada deixava de
 * receber leads sem ninguém dar por isso.
 *
 * Fica na mesma a hipótese de acrescentar uma zona fora da lista (concelhos, sobretudo),
 * já normalizada da mesma maneira que o lado da lead.
 */
function SelectorZonas({ valor, aoMudar }: { valor: string[]; aoMudar: (z: string[]) => void }) {
  const [extra, setExtra] = useState('');
  const nacional = !valor.length;
  const fora = valor.filter((z) => !(DISTRITOS as readonly string[]).includes(z));

  function alternar(z: string) {
    aoMudar(valor.includes(z) ? valor.filter((v) => v !== z) : [...valor, z]);
  }

  function acrescentar() {
    const z = limparZona(extra);
    if (z && z !== ZONA_NACIONAL && !valor.includes(z)) aoMudar([...valor, z]);
    setExtra('');
  }

  const chip = (activo: boolean): React.CSSProperties => ({
    background: activo ? 'rgba(0,188,212,0.15)' : 'var(--yb-input)',
    color: activo ? 'var(--yb-cyan)' : 'var(--yb-muted)',
    border: `1px solid ${activo ? 'rgba(0,188,212,0.35)' : 'var(--yb-border)'}`,
    borderRadius: 20, padding: '3px 10px', fontSize: 11,
    fontWeight: activo ? 700 : 500, cursor: 'pointer', textTransform: 'capitalize',
  });

  return (
    <div>
      <label style={LABEL}>Zonas que serve</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        <button type="button" onClick={() => aoMudar([])} style={chip(nacional)}>
          todo o país
        </button>
        {DISTRITOS.map((d) => (
          <button type="button" key={d} onClick={() => alternar(d)} style={chip(valor.includes(d))}>{d}</button>
        ))}
        {fora.map((z) => (
          <button type="button" key={z} onClick={() => alternar(z)} style={{ ...chip(true), fontStyle: 'italic' }}>{z}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input style={{ ...INPUT, flex: 1 }} placeholder="outra zona (concelho, ilha...)"
          value={extra} onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); acrescentar(); } }} />
        <button type="button" onClick={acrescentar} style={botao('neutro')}>juntar</button>
      </div>
      <p style={{ fontSize: 10, color: 'var(--yb-subtle)', margin: '5px 0 0' }}>
        {nacional
          ? 'Sem zonas escolhidas o parceiro conta como nacional e entra em qualquer distribuição.'
          : `${valor.length} zona(s). Cada capacidade herda estas zonas, a não ser que declare as suas.`}
      </p>
    </div>
  );
}

function FormNovoParceiro({ aoCriar }: { aoCriar: () => void }) {
  const [dados, setDados] = useState({ nome: '', contacto: '', telefone: '', email: '', nif: '', morada: '', estado: 'trial' });
  const [zonas, setZonas] = useState<string[]>([]);
  const [erro, setErro] = useState('');

  async function gravar() {
    setErro('');
    const r = await fetch('/api/crm/parceiros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dados, zonas, canaisPreferidos: ['whatsapp', 'email'] }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.success) aoCriar();
    else setErro(r?.error ?? 'não foi possível criar');
  }

  return (
    <div style={CARD}>
      <p style={TITULO}>Novo parceiro</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 12 }}>
        {([
          ['nome', 'Nome da empresa'], ['contacto', 'Pessoa de contacto'],
          ['telefone', 'Telefone (WhatsApp)'], ['email', 'Email'], ['nif', 'NIF'],
          ['morada', 'Morada da empresa'],
        ] as const).map(([campo, label]) => (
          <div key={campo}>
            <label style={LABEL}>{label}</label>
            <input style={INPUT} value={(dados as any)[campo]}
              onChange={(e) => setDados({ ...dados, [campo]: e.target.value })} />
          </div>
        ))}
        <div>
          <label style={LABEL}>Estado</label>
          <select style={INPUT} value={dados.estado} onChange={(e) => setDados({ ...dados, estado: e.target.value })}>
            <option value="prospect">prospect</option>
            <option value="trial">trial (com leads grátis)</option>
            <option value="ativo">ativo</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}><SelectorZonas valor={zonas} aoMudar={setZonas} /></div>
      {erro && <p style={{ fontSize: 12, color: 'var(--yb-error)', margin: '0 0 10px' }}>{erro}</p>}
      <button onClick={gravar} style={botao('primario')}>Criar</button>
    </div>
  );
}

/**
 * Edição do perfil do parceiro.
 *
 * O score não está aqui de propósito: sai das três fontes de resultado e é o que ordena
 * a fila de distribuição. Editável à mão, a torneira de leads passava a ser uma questão
 * de simpatia. As leads de trial, essas, editam-se — porque são uma negociação.
 */
function FormEditarParceiro({ parceiro, aoGravar }: { parceiro: Parceiro; aoGravar: () => void }) {
  const [dados, setDados] = useState({
    nome: parceiro.nome ?? '',
    contacto: parceiro.contacto ?? '',
    telefone: parceiro.telefone ?? '',
    email: parceiro.email ?? '',
    nif: parceiro.nif ?? '',
    morada: parceiro.morada ?? '',
    estado: parceiro.estado,
    leadsGratisRestantes: parceiro.leadsGratisRestantes ?? 0,
    notas: parceiro.notas ?? '',
  });
  const [zonas, setZonas] = useState<string[]>(parceiro.zonas ?? []);
  const [erro, setErro] = useState('');
  const [aGravar, setAGravar] = useState(false);

  async function gravar() {
    setErro('');
    if (!dados.nome.trim()) { setErro('o nome não pode ficar vazio'); return; }
    if (!dados.telefone.trim() && !dados.email.trim()) {
      setErro('tem de ficar com telefone ou email — sem contacto não há canal de entrega');
      return;
    }
    setAGravar(true);
    const r = await fetch(`/api/crm/parceiros/${parceiro._id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dados, zonas }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) aoGravar();
    else setErro(r?.error ?? 'não foi possível gravar');
  }

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {([
        ['nome', 'Nome da empresa'], ['contacto', 'Pessoa de contacto'],
        ['telefone', 'Telefone (WhatsApp)'], ['email', 'Email'], ['nif', 'NIF'],
        ['morada', 'Morada da empresa'],
      ] as const).map(([campo, label]) => (
        <div key={campo}>
          <label style={LABEL}>{label}</label>
          <input style={INPUT} value={(dados as any)[campo]}
            onChange={(e) => setDados({ ...dados, [campo]: e.target.value })} />
        </div>
      ))}

      <SelectorZonas valor={zonas} aoMudar={setZonas} />

      <div>
        <label style={LABEL}>Estado</label>
        <select style={INPUT} value={dados.estado} onChange={(e) => setDados({ ...dados, estado: e.target.value })}>
          <option value="prospect">prospect — não recebe leads</option>
          <option value="trial">trial — gasta as leads grátis</option>
          <option value="ativo">ativo — paga da carteira</option>
          <option value="suspenso">suspenso — nunca entra numa distribuição</option>
        </select>
      </div>

      <div>
        <label style={LABEL}>Leads de trial por gastar</label>
        <input type="number" min={0} style={INPUT} value={dados.leadsGratisRestantes}
          onChange={(e) => setDados({ ...dados, leadsGratisRestantes: parseInt(e.target.value) || 0 })} />
      </div>

      <div>
        <label style={LABEL}>Notas</label>
        <textarea style={{ ...INPUT, minHeight: 52, resize: 'vertical' }} value={dados.notas}
          onChange={(e) => setDados({ ...dados, notas: e.target.value })} />
      </div>

      {erro && <p style={{ fontSize: 11, color: 'var(--yb-error)', margin: 0 }}>{erro}</p>}

      <button onClick={gravar} disabled={aGravar} style={{ ...botao('primario'), opacity: aGravar ? 0.5 : 1 }}>
        {aGravar ? 'a gravar...' : 'Gravar alterações'}
      </button>
    </div>
  );
}

function DetalheParceiro({ parceiro, categorias, aoMudar }: { parceiro: Parceiro; categorias: Categoria[]; aoMudar: () => void }) {
  const [capacidades, setCapacidades] = useState<Capacidade[]>([]);
  const [movimentos, setMovimentos] = useState<any[]>([]);
  const [metricas, setMetricas] = useState<any>(null);
  const [valor, setValor] = useState('');
  const [novaCap, setNovaCap] = useState({ categoria: '', zonas: '', maxWeightKg: '', maxDimensionCm: '', adr: false, temperatura: false });
  const [aEditar, setAEditar] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/crm/parceiros/${parceiro._id}`).then((x) => x.json()).catch(() => null);
    if (r?.success) { setCapacidades(r.capacidades); setMovimentos(r.movimentos); setMetricas(r.metricas); }
  }, [parceiro._id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function carregarSaldo() {
    setErro('');
    const v = parseFloat(valor.replace(',', '.'));
    if (!isFinite(v) || v <= 0) { setErro('valor inválido'); return; }
    const r = await fetch(`/api/crm/parceiros/${parceiro._id}/carteira`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: v, tipo: 'carregamento' }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.success) { setValor(''); carregar(); aoMudar(); }
    else setErro(r?.error ?? 'falhou');
  }

  async function criarCapacidade() {
    setErro('');
    if (!novaCap.categoria) { setErro('escolha uma categoria'); return; }
    const r = await fetch('/api/crm/capacidades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerId: parceiro._id,
        categoria: novaCap.categoria,
        zonas: novaCap.zonas.split(',').map((z) => z.trim()).filter(Boolean),
        maxWeightKg: novaCap.maxWeightKg ? Number(novaCap.maxWeightKg) : null,
        maxDimensionCm: novaCap.maxDimensionCm ? Number(novaCap.maxDimensionCm) : null,
        adr: novaCap.adr, temperatura: novaCap.temperatura,
      }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.success) { setNovaCap({ ...novaCap, categoria: '' }); carregar(); }
    else setErro(r?.error ?? 'falhou');
  }

  async function apagarCapacidade(id: string) {
    await fetch(`/api/crm/capacidades/${id}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <div style={{ borderTop: '1px solid var(--yb-border)', padding: '14px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <p style={{ ...TITULO, marginBottom: 8 }}>Contactos</p>
            <button onClick={() => setAEditar(!aEditar)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 10, color: 'var(--yb-cyan)', fontWeight: 600,
            }}>{aEditar ? 'cancelar' : 'editar'}</button>
          </div>

          {aEditar ? (
            <FormEditarParceiro
              parceiro={parceiro}
              aoGravar={() => { setAEditar(false); carregar(); aoMudar(); }}
            />
          ) : (
            <>
              <Campo k="Pessoa" v={parceiro.contacto} />
              <Campo k="Telefone" v={parceiro.telefone} />
              <Campo k="Email" v={parceiro.email} />
              <Campo k="NIF" v={parceiro.nif} />
              <Campo k="Morada" v={parceiro.morada} />
              <Campo k="Zonas" v={parceiro.zonas?.length ? parceiro.zonas.join(', ') : 'todo o país'} />
              <Campo k="Estado" v={parceiro.estado} />
              <Campo k="Leads de trial" v={String(parceiro.leadsGratisRestantes)} />
            </>
          )}

          <p style={{ ...TITULO, marginTop: 14 }}>Carteira</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--yb-fg)', margin: '0 0 8px' }}>
            {parceiro.saldo.toFixed(2)} EUR
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...INPUT, width: 100 }} placeholder="0.00" value={valor}
              onChange={(e) => setValor(e.target.value)} />
            <button onClick={carregarSaldo} style={botao('primario')}>Carregar</button>
          </div>
        </div>

        <div>
          <p style={TITULO}>Capacidades</p>
          {capacidades.map((c) => (
            <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--yb-border)' }}>
              <span style={{ fontSize: 12, color: 'var(--yb-fg)', fontWeight: 600 }}>
                {categorias.find((k) => k.id === c.categoria)?.label ?? c.categoria}
              </span>
              <span style={{ fontSize: 11, color: 'var(--yb-muted)' }}>
                {c.zonas?.length
                  ? c.zonas.join(', ')
                  : (parceiro.zonas?.length ? `${parceiro.zonas.join(', ')} (do parceiro)` : 'todo o país')}
                {c.maxWeightKg ? ` · max ${c.maxWeightKg} kg` : ''}
                {c.maxDimensionCm ? ` · max ${c.maxDimensionCm} cm` : ''}
                {c.adr ? ' · ADR' : ''}
                {c.temperatura ? ' · frio' : ''}
              </span>
              <button onClick={() => apagarCapacidade(c._id)} style={{ ...botao('perigo'), marginLeft: 'auto', padding: '3px 8px', fontSize: 10 }}>
                apagar
              </button>
            </div>
          ))}
          {!capacidades.length && (
            <p style={{ fontSize: 12, color: 'var(--yb-subtle)', margin: '0 0 8px' }}>
              Sem capacidades declaradas: este parceiro nunca vai aparecer numa distribuição.
            </p>
          )}

          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            <select style={INPUT} value={novaCap.categoria} onChange={(e) => setNovaCap({ ...novaCap, categoria: e.target.value })}>
              <option value="">acrescentar categoria...</option>
              {categorias.filter((c) => c.route === 'lead_sale').map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            {novaCap.categoria && (
              <>
                <input style={INPUT} placeholder="zonas separadas por vírgula (vazio = as do parceiro)"
                  value={novaCap.zonas} onChange={(e) => setNovaCap({ ...novaCap, zonas: e.target.value })} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={INPUT} placeholder="max kg (vazio = sem limite)"
                    value={novaCap.maxWeightKg} onChange={(e) => setNovaCap({ ...novaCap, maxWeightKg: e.target.value })} />
                  <input style={INPUT} placeholder="max cm"
                    value={novaCap.maxDimensionCm} onChange={(e) => setNovaCap({ ...novaCap, maxDimensionCm: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={novaCap.adr} onChange={(e) => setNovaCap({ ...novaCap, adr: e.target.checked })} />
                    certificação ADR
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={novaCap.temperatura} onChange={(e) => setNovaCap({ ...novaCap, temperatura: e.target.checked })} />
                    cadeia de frio
                  </label>
                </div>
                <button onClick={criarCapacidade} style={botao('primario')}>Acrescentar</button>
              </>
            )}
          </div>
        </div>

        <div>
          <p style={TITULO}>Resultados</p>
          {metricas && (
            <>
              <Campo k="Leads recebidas" v={String(metricas.leadsRecebidas)} />
              <Campo k="Reportadas" v={String(metricas.reportadas)} />
              <Campo k="Recusas" v={String(metricas.recusas)} />
              <Campo k="Ganhos declarados" v={String(metricas.ganhos)} />
              <Campo k="Avaliação do cliente" v={metricas.avaliacaoMedia ? metricas.avaliacaoMedia.toFixed(1) : null} />
            </>
          )}

          <p style={{ ...TITULO, marginTop: 14 }}>Últimos movimentos</p>
          {movimentos.slice(0, 8).map((m) => (
            <p key={m._id} style={{ fontSize: 11, color: 'var(--yb-muted)', margin: '0 0 4px', lineHeight: 1.45 }}>
              <span style={{ color: m.tipo === 'debito' ? 'var(--yb-error)' : '#22c55e', fontWeight: 700 }}>
                {m.tipo === 'debito' ? '-' : '+'}{Number(m.valor).toFixed(2)}
              </span>
              {' '}{m.motivo}
              {m.createdAt && (
                <><br /><span style={{ color: 'var(--yb-subtle)' }}>
                  {new Date(m.createdAt).toLocaleString('pt-PT')}
                  {typeof m.saldoApos === 'number' ? ` · saldo ${Number(m.saldoApos).toFixed(2)} EUR` : ''}
                </span></>
              )}
            </p>
          ))}
          {!movimentos.length && <p style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>sem movimentos</p>}
        </div>
      </div>

      {erro && <p style={{ fontSize: 12, color: 'var(--yb-error)', margin: '10px 0 0' }}>{erro}</p>}

      {/* A angariacao vive dentro da ficha do parceiro e nao num ecra proprio: um
          prospecto e um parceiro num estado inicial, e separa-los obrigaria a migrar o
          registo no momento em que ele adere — perdendo o historial exactamente quando
          ele passa a valer alguma coisa. */}
      <Prospecto parceiro={parceiro} aoMudar={() => { carregar(); aoMudar(); }} />
    </div>
  );
}

// ── Configuração ─────────────────────────────────────────────────────────────


/**
 * Quem envia o email de confirmacao ao cliente.
 *
 * O que importa nesta ficha nao e o selector — e a linha que diz o que a plataforma
 * antiga esta a decidir NESTE momento. Sem ela, "auto" e uma palavra que nao se pode
 * verificar, e ninguem saberia dizer se o cliente esta a receber um email ou dois.
 */
function EmailDoCliente() {
  const [dados, setDados] = useState<{
    estado: { modo: string; pulsoEm: string | null; idadeSegundos: number | null; nodechefEnvia: boolean; actor?: string };
    validadeMinutos: number;
  } | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch('/api/crm/email-cliente', { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (r?.success) setDados(r);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudar(modo: string) {
    setAGravar(true);
    const r = await fetch('/api/crm/email-cliente', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) setDados(r);
  }

  if (!dados) return null;
  const { estado, validadeMinutos } = dados;
  const idade = estado.idadeSegundos;
  const pulsoVivo = idade !== null && idade <= validadeMinutos * 60;

  const OPCOES: [string, string, string][] = [
    ['auto', 'Automatico', `A plataforma antiga so envia se este servidor deixar de dar sinal durante ${validadeMinutos} minutos.`],
    ['leads', 'So daqui', 'A plataforma antiga nunca envia. Se este servidor cair, o cliente fica sem confirmacao.'],
    ['nodechef', 'So de la', 'Esta aplicacao continua a enviar, e a antiga tambem. Para manutencao ou teste.'],
  ];

  return (
    <div style={CARD}>
      <p style={TITULO}>Email de confirmacao ao cliente</p>
      <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
        A lead e recebida por duas plataformas — esta e a YourBox antiga, no nodechef — e as
        duas sabem enviar a confirmacao. Para o cliente nao receber duas, so uma envia de cada vez.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
        background: pulsoVivo ? 'rgba(0,188,212,0.08)' : 'rgba(234,179,8,0.10)',
        border: `1px solid ${pulsoVivo ? 'rgba(0,188,212,0.28)' : 'rgba(234,179,8,0.35)'}`,
        borderRadius: 9, padding: '10px 12px', marginBottom: 14,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: pulsoVivo ? 'var(--yb-cyan)' : '#eab308',
        }} />
        <span style={{ fontSize: 12, color: 'var(--yb-fg)', fontWeight: 600 }}>
          {estado.nodechefEnvia
            ? 'A plataforma antiga esta a enviar a confirmacao'
            : 'A confirmacao esta a sair daqui'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>
          {idade === null
            ? 'nunca houve pulso — falta o cron'
            : `ultimo pulso ha ${idade < 90 ? `${idade}s` : `${Math.round(idade / 60)} min`}`}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 7 }}>
        {OPCOES.map(([id, label, nota]) => (
          <label key={id} style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', cursor: aGravar ? 'wait' : 'pointer',
            opacity: aGravar ? 0.6 : 1,
          }}>
            <input type="radio" name="modoEmailCliente" checked={estado.modo === id}
              disabled={aGravar} onChange={() => mudar(id)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 13, color: 'var(--yb-fg)' }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--yb-subtle)', display: 'block', lineHeight: 1.5, marginTop: 1 }}>
                {nota}
              </span>
            </span>
          </label>
        ))}
      </div>

      {estado.modo !== 'auto' && (
        <p style={{ fontSize: 11, color: '#eab308', margin: '11px 0 0', lineHeight: 1.5 }}>
          Fora do automatico{estado.actor ? `, por ${estado.actor}` : ''}. Volte a por em
          Automatico quando acabar — e o unico modo que se corrige sozinho.
        </p>
      )}
    </div>
  );
}

function Configuracao({
  config, categorias, limites, aoGravar,
}: {
  config: Config | null; categorias: Categoria[];
  limites: { maxKg: number; maxCm: number } | null; aoGravar: () => void;
}) {
  const [local, setLocal] = useState<Config | null>(config);
  const [gravado, setGravado] = useState(false);

  useEffect(() => { setLocal(config); }, [config]);
  if (!local) return <p style={{ fontSize: 12, color: 'var(--yb-subtle)' }}>a carregar...</p>;

  async function gravar() {
    const r = await fetch('/api/crm/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(local),
    }).then((x) => x.json()).catch(() => null);
    if (r?.success) { setGravado(true); setTimeout(() => setGravado(false), 2000); aoGravar(); }
  }

  return (
    <>
      <div style={CARD}>
        <p style={TITULO}>Distribuição</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 12 }}>
          <input type="checkbox" checked={local.active} onChange={(e) => setLocal({ ...local, active: e.target.checked })} />
          <span style={{ fontSize: 13, color: 'var(--yb-fg)' }}>CRM activo</span>
          <span style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>
            com isto desligado, nenhuma lead é entregue nem cobrada
          </span>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={local.envioAutomatico} style={{ marginTop: 3 }}
            onChange={(e) => setLocal({ ...local, envioAutomatico: e.target.checked })} />
          <span>
            <span style={{ fontSize: 13, color: 'var(--yb-fg)' }}>Envio automático</span>
            <span style={{ fontSize: 11, color: 'var(--yb-subtle)', display: 'block', lineHeight: 1.5, marginTop: 2 }}>
              Desligado, a triagem corre na mesma e a consulta fica a aguardar — é a operadora
              que decide e dispara. Ligado, uma lead com autorização do cliente e parceiro
              elegível segue sozinha. A autorização é sempre obrigatória, nos dois casos.
            </span>
          </span>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={local.pedirAutorizacaoPorEmail} style={{ marginTop: 3 }}
            onChange={(e) => setLocal({ ...local, pedirAutorizacaoPorEmail: e.target.checked })} />
          <span>
            <span style={{ fontSize: 13, color: 'var(--yb-fg)' }}>Pedir a autorizacao por email</span>
            <span style={{ fontSize: 11, color: 'var(--yb-subtle)', display: 'block', lineHeight: 1.5, marginTop: 2 }}>
              Ligado, uma lead da Linha B recebe sozinha, mal e classificada, um email a pedir
              autorizacao para o pedido seguir para outra empresa. E para as horas em que nao ha
              ninguem: de madrugada e ao fim-de-semana a lead ficava parada ate alguem chegar.
              <strong> Desligue-o quando estiver ao balcao</strong> — a chamada fecha melhor, e as
              duas coisas ao mesmo tempo sao o cliente a ser abordado duas vezes pelo mesmo.
              Nunca escreve a quem ja autorizou, e nunca insiste: um pedido por lead.
            </span>
          </span>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <Numero label="Validade do link (h)" valor={local.autorizacaoValidadeHoras}
            aoMudar={(v) => setLocal({ ...local, autorizacaoValidadeHoras: v })}
            nota="72h cobre sexta a segunda" />
          <Numero label="Parceiros por lead" valor={local.maxParceirosPorLead}
            aoMudar={(v) => setLocal({ ...local, maxParceirosPorLead: v })}
            nota="1 = lead exclusiva" />
          <Numero label="Janela de recusa (h)" valor={local.janelaRecusaHoras}
            aoMudar={(v) => setLocal({ ...local, janelaRecusaHoras: v })} />
          <Numero label="Follow-up ao cliente (h)" valor={local.followUpHoras}
            aoMudar={(v) => setLocal({ ...local, followUpHoras: v })} />
          <Numero label="Aviso de saldo (EUR)" valor={local.limiteAvisoSaldo}
            aoMudar={(v) => setLocal({ ...local, limiteAvisoSaldo: v })} />
          <Numero label="Leads grátis no trial" valor={local.leadsGratisTrial}
            aoMudar={(v) => setLocal({ ...local, leadsGratisTrial: v })} />
        </div>
      </div>

      <div style={CARD}>
        <p style={TITULO}>Preço da lead por categoria (EUR)</p>
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Piso: o CPL próprio da YourBox — abaixo disso está a subsidiar-se o parceiro.
          Uma categoria a zero não é distribuída.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          {categorias.filter((c) => c.route === 'lead_sale').map((c) => (
            <Numero key={c.id} label={c.label} valor={local.cpl[c.id] ?? 0} passo={0.5}
              aoMudar={(v) => setLocal({ ...local, cpl: { ...local.cpl, [c.id]: v } })} />
          ))}
        </div>
      </div>

      <EmailDoCliente />

      <Materiais categorias={categorias} />

      {limites && (
        <div style={CARD}>
          <p style={TITULO}>Limites da tabela em vigor</p>
          <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: 0, lineHeight: 1.6 }}>
            Uma carga acima de <strong style={{ color: 'var(--yb-fg)' }}>{limites.maxKg} kg</strong> ou de{' '}
            <strong style={{ color: 'var(--yb-fg)' }}>{limites.maxCm} cm</strong> (C+L+A) é triada como não servível
            e vai para venda de lead. Estes números saem das tarifas activas dos parceiros logísticos,
            no separador Serviços — não se editam aqui.
          </p>
        </div>
      )}

      <button onClick={gravar} style={botao('primario')}>
        {gravado ? 'gravado' : 'Gravar configuração'}
      </button>
    </>
  );
}

function Numero({ label, valor, aoMudar, passo = 1, nota }: {
  label: string; valor: number; aoMudar: (v: number) => void; passo?: number; nota?: string;
}) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      <input type="number" step={passo} style={INPUT} value={valor}
        onChange={(e) => aoMudar(parseFloat(e.target.value) || 0)} />
      {nota && <span style={{ fontSize: 10, color: 'var(--yb-subtle)' }}>{nota}</span>}
    </div>
  );
}
