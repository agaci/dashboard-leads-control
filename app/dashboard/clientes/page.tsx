'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const NAVY  = '#1a2b4a';
const CYAN  = '#00bcd4';
const BORDER = '#e8eaf0';

type Client = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  empresa: string | null;
  emailConsent: boolean;
  totalServicos: number;
  createdAt: string;
  updatedAt: string;
};

type LeadSummary = {
  id: string;
  timeStamp: string;
  origem: string | null;
  destino: string | null;
  priceWithDiscount: number | null;
  partnerFinalPrice: number | null;
  urgencia: string | null;
  serviceType: string | null;
  variante: string | null;
};

type ClientDetail = Client & {
  notas: string;
  leads: LeadSummary[];
};

function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: `linear-gradient(135deg, ${CYAN}, #0097a7)`,
      color: '#fff', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function fmt(ts?: string) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-PT');
}

export default function ClientesPage() {
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Client | null>(null);
  const [detail, setDetail]           = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notas, setNotas]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [editing, setEditing]         = useState<Partial<ClientDetail>>({});
  const searchTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchClients = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/clients?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) setClients(data.clients);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(''); }, [fetchClients]);

  function onSearch(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchClients(v), 350);
  }

  async function selectClient(c: Client) {
    setSelected(c);
    setDetail(null);
    setEditing({});
    setDetailLoading(true);
    try {
      const res  = await fetch(`/api/clients/${c.id}`);
      const data = await res.json();
      if (data.success) {
        setDetail(data.client);
        setNotas(data.client.notas ?? '');
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveField(field: string, value: unknown) {
    if (!selected) return;
    await fetch(`/api/clients/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function saveNotas() {
    setSaving(true);
    try {
      await saveField('notas', notas);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEmailConsent() {
    if (!detail || !selected) return;
    const next = !detail.emailConsent;
    setDetail({ ...detail, emailConsent: next });
    await saveField('emailConsent', next);
  }

  async function saveEdit(field: 'nome' | 'empresa' | 'email') {
    const val = editing[field];
    if (val === undefined || !detail) return;
    const updated = { ...detail, [field]: val };
    setDetail(updated);
    setEditing({});
    await saveField(field, val);
    // Actualizar lista
    setClients(cs => cs.map(c => c.id === selected!.id ? { ...c, [field]: val } : c));
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: '#aaa', margin: '0 0 10px',
  };

  const cardS: React.CSSProperties = {
    background: '#fff', borderRadius: 10, border: `1px solid ${BORDER}`,
    padding: '14px 18px', marginBottom: 12,
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '6px 9px',
    border: `1.5px solid ${BORDER}`, borderRadius: 7,
    fontSize: 13, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f5f6fa', overflow: 'hidden' }}>

      {/* ── Lista de clientes ────────────────────────────────────────────────── */}
      <div style={{
        width: selected ? 280 : '100%',
        borderRight: `1px solid ${BORDER}`,
        background: '#fff',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        transition: 'width 0.2s',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>
              Clientes {!loading && `(${clients.length})`}
            </span>
          </div>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Pesquisar nome, telefone ou email..."
            style={{ ...fieldStyle, fontSize: 12 }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <p style={{ padding: 16, fontSize: 12, color: '#aaa' }}>A carregar...</p>}
          {!loading && clients.length === 0 && (
            <p style={{ padding: 16, fontSize: 12, color: '#aaa', lineHeight: 1.5 }}>
              {search
                ? 'Sem resultados para essa pesquisa.'
                : 'Ainda sem clientes. Converta uma lead na página de Leads.'}
            </p>
          )}
          {!loading && clients.map(c => (
            <div
              key={c.id}
              onClick={() => selectClient(c)}
              style={{
                padding: '11px 14px',
                cursor: 'pointer',
                borderBottom: `1px solid ${BORDER}`,
                borderLeft: selected?.id === c.id ? `3px solid ${CYAN}` : '3px solid transparent',
                background: selected?.id === c.id ? '#f0fdff' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{c.nome}</span>
                <span style={{ fontSize: 10, color: '#aaa' }}>{fmt(c.updatedAt)}</span>
              </div>
              <div style={{ fontSize: 11, color: CYAN }}>{c.telefone}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2, display: 'flex', gap: 8 }}>
                <span>{c.totalServicos} serviço{c.totalServicos !== 1 ? 's' : ''}</span>
                {c.emailConsent && (
                  <span style={{ color: '#2e7d32', fontWeight: 600 }}>● email</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Detalhe do cliente ───────────────────────────────────────────────── */}
      {selected ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {detailLoading && <p style={{ color: '#aaa', fontSize: 13 }}>A carregar...</p>}

          {!detailLoading && detail && (
            <div style={{ maxWidth: 600 }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <Avatar name={detail.nome} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: NAVY, fontFamily: 'Space Grotesk, sans-serif' }}>
                    {detail.nome}
                  </h2>
                  {detail.empresa && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{detail.empresa}</p>}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 6, background: '#fff', padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#888' }}
                >
                  Fechar
                </button>
              </div>

              {/* Contacto */}
              <div style={cardS}>
                <p style={sectionTitle}>Contacto</p>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', margin: 0 }}>
                  {/* Telefone */}
                  <div>
                    <dt style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Telefone</dt>
                    <dd style={{ fontSize: 13, fontWeight: 600, color: CYAN, margin: 0 }}>{detail.telefone}</dd>
                  </div>

                  {/* Email */}
                  <div>
                    <dt style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Email</dt>
                    {editing.email !== undefined ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          autoFocus
                          value={editing.email as string}
                          onChange={e => setEditing({ ...editing, email: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit('email'); if (e.key === 'Escape') setEditing({}); }}
                          style={{ ...fieldStyle, fontSize: 12, padding: '3px 7px' }}
                        />
                        <button onClick={() => saveEdit('email')} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, border: `1px solid ${CYAN}`, background: '#fff', color: CYAN, cursor: 'pointer' }}>✓</button>
                      </div>
                    ) : (
                      <dd
                        onClick={() => setEditing({ email: detail.email ?? '' })}
                        style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0, cursor: 'text', minHeight: 18 }}
                        title="Clique para editar"
                      >
                        {detail.email ?? <span style={{ color: '#ccc', fontWeight: 400 }}>—</span>}
                      </dd>
                    )}
                  </div>

                  {/* Empresa */}
                  <div>
                    <dt style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Empresa</dt>
                    {editing.empresa !== undefined ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          autoFocus
                          value={editing.empresa as string}
                          onChange={e => setEditing({ ...editing, empresa: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit('empresa'); if (e.key === 'Escape') setEditing({}); }}
                          style={{ ...fieldStyle, fontSize: 12, padding: '3px 7px' }}
                        />
                        <button onClick={() => saveEdit('empresa')} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, border: `1px solid ${CYAN}`, background: '#fff', color: CYAN, cursor: 'pointer' }}>✓</button>
                      </div>
                    ) : (
                      <dd
                        onClick={() => setEditing({ empresa: detail.empresa ?? '' })}
                        style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0, cursor: 'text', minHeight: 18 }}
                        title="Clique para editar"
                      >
                        {detail.empresa ?? <span style={{ color: '#ccc', fontWeight: 400 }}>—</span>}
                      </dd>
                    )}
                  </div>

                  {/* Cliente desde */}
                  <div>
                    <dt style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Cliente desde</dt>
                    <dd style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>{fmt(detail.createdAt)}</dd>
                  </div>
                </dl>

                {/* Email consent + botão email */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: NAVY, userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={detail.emailConsent}
                      onChange={toggleEmailConsent}
                      style={{ width: 15, height: 15, accentColor: CYAN, cursor: 'pointer' }}
                    />
                    Consentimento email marketing
                  </label>
                  <button
                    disabled
                    title="Em breve"
                    style={{
                      marginLeft: 'auto', fontSize: 11, padding: '5px 14px',
                      borderRadius: 6, border: `1px solid ${BORDER}`,
                      background: '#f5f5f5', color: '#ccc', cursor: 'not-allowed', fontWeight: 600,
                    }}
                  >
                    Enviar Email
                  </button>
                </div>
              </div>

              {/* Notas */}
              <div style={cardS}>
                <p style={sectionTitle}>Notas Internas</p>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={3}
                  placeholder="Observações sobre o cliente, preferências, contexto..."
                  style={{
                    width: '100%', padding: '8px 10px',
                    border: `1.5px solid ${BORDER}`, borderRadius: 8,
                    fontSize: 13, resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit', boxSizing: 'border-box', color: NAVY,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    onClick={saveNotas}
                    disabled={saving}
                    style={{
                      padding: '6px 18px', borderRadius: 7, border: 'none',
                      background: saved ? '#2e7d32' : CYAN, color: '#fff',
                      fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    {saved ? '✓ Guardado' : saving ? 'A guardar...' : 'Guardar Notas'}
                  </button>
                </div>
              </div>

              {/* Histórico de serviços */}
              <div style={cardS}>
                <p style={sectionTitle}>Histórico de Serviços ({detail.leads.length})</p>
                {detail.leads.length === 0 && (
                  <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>Sem serviços registados.</p>
                )}
                {detail.leads.map(l => {
                  const price = l.priceWithDiscount ?? l.partnerFinalPrice;
                  const isArrasto = l.serviceType === 'arrasto';
                  return (
                    <div key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 0', borderBottom: `1px solid ${BORDER}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, marginBottom: 2 }}>
                          {l.origem?.split(',')[0] ?? '—'} → {l.destino?.split(',')[0] ?? '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {isArrasto ? '24h Amanhã' : (l.urgencia ?? '—')}
                          {' · '}
                          {new Date(l.timeStamp).toLocaleDateString('pt-PT')}
                        </div>
                      </div>
                      {price != null && (
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#2e7d32', fontFamily: 'Space Grotesk, sans-serif' }}>
                          €{price.toFixed(2)}
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: '#e3f2fd', color: '#1565c0', flexShrink: 0,
                      }}>
                        {l.variante ?? 'Manual'}
                      </span>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>
      ) : (
        /* Estado vazio */
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#bbb', gap: 10,
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p style={{ fontSize: 13, margin: 0 }}>Seleccione um cliente para ver o detalhe</p>
        </div>
      )}
    </div>
  );
}
