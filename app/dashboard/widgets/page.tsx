'use client';

import { useEffect, useState, useCallback } from 'react';

const CYAN   = 'var(--yb-cyan)';
const NAVY   = 'var(--yb-fg)';
const BORDER = 'var(--yb-border)';
const YB_BG  = 'var(--yb-bg)';

const BASE_URL = 'https://leads.comgo.pt';

type WidgetClient = {
  _id: string;
  clientId: string;
  secretToken?: string;
  name: string;
  primaryColor: string;
  darkColor: string;
  logoUrl: string | null;
  whatsappNumber: string | null;
  botName: string;
  allowedOrigins: string[];
  webhookUrl: string | null;
  active: boolean;
  createdAt: string;
};

const EMPTY_FORM = {
  name: '', primaryColor: '#bed62f', darkColor: '#1a1a1a',
  logoUrl: '', whatsappNumber: '', botName: 'Assistente',
  allowedOrigins: '*', webhookUrl: '',
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
  });
}

function embedCode(clientId: string) {
  return `<script src="${BASE_URL}/embed.js" data-ybw-client="${clientId}"><\/script>`;
}

function Pill({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: active ? '#22c55e' : '#f87171',
      border: `1px solid ${active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function ColorDot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: color, border: `1.5px solid ${BORDER}`, verticalAlign: 'middle', marginRight: 5 }} />;
}

export default function WidgetsPage() {
  const [clients, setClients] = useState<WidgetClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/widget-clients');
      const data = await res.json();
      if (data.success) setClients(data.clients);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(c: WidgetClient) {
    setEditId(c._id);
    setForm({
      name:           c.name,
      primaryColor:   c.primaryColor,
      darkColor:      c.darkColor,
      logoUrl:        c.logoUrl ?? '',
      whatsappNumber: c.whatsappNumber ?? '',
      botName:        c.botName,
      allowedOrigins: (c.allowedOrigins ?? ['*']).join(', '),
      webhookUrl:     c.webhookUrl ?? '',
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const origins = form.allowedOrigins.split(',').map(s => s.trim()).filter(Boolean);
      const body = {
        name:           form.name.trim(),
        primaryColor:   form.primaryColor,
        darkColor:      form.darkColor,
        logoUrl:        form.logoUrl.trim() || null,
        whatsappNumber: form.whatsappNumber.trim() || null,
        botName:        form.botName.trim() || 'Assistente',
        allowedOrigins: origins.length ? origins : ['*'],
        webhookUrl:     form.webhookUrl.trim() || null,
      };
      if (editId) {
        await fetch('/api/admin/widget-clients', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _id: editId, ...body }) });
      } else {
        await fetch('/api/admin/widget-clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function toggleActive(c: WidgetClient) {
    await fetch('/api/admin/widget-clients', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _id: c._id, active: !c.active }) });
    await load();
  }

  function handleCopy(clientId: string) {
    copyToClipboard(embedCode(clientId));
    setCopiedId(clientId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopyToken(token: string, id: string) {
    copyToClipboard(token);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  async function handleRegenerateToken(c: WidgetClient) {
    if (!confirm(`Regenerar o token de "${c.name}"?\nO token anterior ficará inválido imediatamente.`)) return;
    setRegenerating(c._id);
    try {
      const res = await fetch('/api/admin/widget-clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: c._id, regenerateToken: true }),
      });
      const data = await res.json();
      if (data.success) {
        setRevealedToken(c._id);
        await load();
      }
    } finally {
      setRegenerating(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    border: `1.5px solid ${BORDER}`, borderRadius: 8,
    fontFamily: 'inherit', fontSize: 13, color: 'var(--yb-fg)',
    background: 'var(--yb-input)', outline: 'none', colorScheme: 'inherit' as const,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--yb-muted)', marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: '24px 28px', background: YB_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Widgets White-label</h1>
          <p style={{ fontSize: 12, color: 'var(--yb-muted)', margin: '3px 0 0' }}>Gerir clientes que embebem o widget no seu site</p>
        </div>
        <button
          onClick={openCreate}
          style={{
            background: CYAN, color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Cliente
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--yb-subtle)', fontSize: 13 }}>A carregar...</div>
      ) : clients.length === 0 ? (
        <div style={{ background: 'var(--yb-card)', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '3rem', textAlign: 'center', color: 'var(--yb-subtle)' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--yb-muted)', margin: '0 0 6px' }}>Nenhum cliente configurado</p>
          <p style={{ fontSize: 12, margin: 0 }}>Clique em "Novo Cliente" para começar.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {clients.map((c) => (
            <div key={c._id} style={{ background: 'var(--yb-card)', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <ColorDot color={c.primaryColor} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{c.name}</span>
                    <Pill active={c.active} />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: '0 0 2px', fontFamily: 'monospace' }}>
                    ID: <strong style={{ color: 'var(--yb-muted)' }}>{c.clientId}</strong>
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: 0 }}>
                    Bot: {c.botName} &bull; Origens: {(c.allowedOrigins ?? ['*']).join(', ')}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Embed code copy */}
                  <button
                    onClick={() => handleCopy(c.clientId)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
                      border: `1.5px solid ${BORDER}`, background: copiedId === c.clientId ? 'rgba(34,197,94,0.12)' : 'var(--yb-input)',
                      color: copiedId === c.clientId ? '#22c55e' : '#8B9EC9', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {copiedId === c.clientId
                      ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copiado!</>)
                      : (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar código</>)
                    }
                  </button>

                  <button
                    onClick={() => openEdit(c)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
                      border: `1.5px solid ${BORDER}`, background: 'var(--yb-input)', color: 'var(--yb-muted)', cursor: 'pointer',
                    }}
                  >
                    Editar
                  </button>

                  <button
                    onClick={() => toggleActive(c)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
                      border: `1.5px solid ${c.active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                      background: c.active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      color: c.active ? '#f87171' : '#22c55e', cursor: 'pointer',
                    }}
                  >
                    {c.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>

              {/* Embed snippet */}
              <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--yb-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Código de embed</p>
                <code style={{ fontSize: 11, color: 'var(--yb-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {`<script src="${BASE_URL}/embed.js" data-ybw-client="${c.clientId}"><\/script>`}
                </code>
              </div>

              {/* API Stats token */}
              <div style={{ marginTop: 8, background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Token API de Estatísticas
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--yb-subtle)', marginLeft: 8 }}>
                      GET {BASE_URL}/api/v1/stats?month=MM&year=YYYY
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {c.secretToken && (
                      <button
                        onClick={() => handleCopyToken(c.secretToken!, c._id)}
                        title="Copiar token"
                        style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                          border: '1px solid rgba(167,139,250,0.3)',
                          background: copiedToken === c._id ? 'rgba(139,92,246,0.15)' : 'var(--yb-input)',
                          color: '#a78bfa',
                          fontWeight: 600,
                        }}
                      >
                        {copiedToken === c._id ? 'Copiado' : 'Copiar token'}
                      </button>
                    )}
                    <button
                      onClick={() => setRevealedToken(revealedToken === c._id ? null : c._id)}
                      title={revealedToken === c._id ? 'Ocultar' : 'Revelar token'}
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                        border: '1px solid rgba(167,139,250,0.3)', background: 'var(--yb-input)', color: '#a78bfa', fontWeight: 600,
                      }}
                    >
                      {revealedToken === c._id ? 'Ocultar' : 'Revelar'}
                    </button>
                    <button
                      onClick={() => handleRegenerateToken(c)}
                      disabled={regenerating === c._id}
                      title="Gerar novo token (invalida o anterior)"
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                        border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontWeight: 600,
                        opacity: regenerating === c._id ? 0.5 : 1,
                      }}
                    >
                      {regenerating === c._id ? '...' : 'Regenerar'}
                    </button>
                  </div>
                </div>

                {c.secretToken ? (
                  <code style={{
                    fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all',
                    color: revealedToken === c._id ? '#a78bfa' : 'transparent',
                    background: revealedToken === c._id ? 'transparent' : 'rgba(167,139,250,0.2)',
                    borderRadius: 4, padding: revealedToken === c._id ? 0 : '0 4px',
                    userSelect: revealedToken === c._id ? 'all' : 'none',
                  }}>
                    {c.secretToken}
                  </code>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--yb-subtle)', margin: 0, fontStyle: 'italic' }}>
                    Sem token — clique em "Regenerar" para criar um.
                  </p>
                )}

                {revealedToken === c._id && c.secretToken && (
                  <p style={{ fontSize: 10, color: 'var(--yb-subtle)', margin: '6px 0 0' }}>
                    Exemplo: <code style={{ fontFamily: 'monospace' }}>Authorization: Bearer {c.secretToken.slice(0, 8)}…</code>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div style={{ background: 'var(--yb-card)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 24, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: 0 }}>{editId ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--yb-subtle)' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome do cliente *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Loja do João" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Cor primária</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} style={{ width: 40, height: 36, border: `1.5px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    <input style={{ ...inputStyle, flex: 1 }} value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Cor escura</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={form.darkColor} onChange={e => setForm(f => ({ ...f, darkColor: e.target.value }))} style={{ width: 40, height: 36, border: `1.5px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    <input style={{ ...inputStyle, flex: 1 }} value={form.darkColor} onChange={e => setForm(f => ({ ...f, darkColor: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Nome do bot</label>
                <input style={inputStyle} value={form.botName} onChange={e => setForm(f => ({ ...f, botName: e.target.value }))} placeholder="Assistente" />
              </div>

              <div>
                <label style={labelStyle}>Número WhatsApp (internacional, sem +)</label>
                <input style={inputStyle} value={form.whatsappNumber} onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))} placeholder="351961220881" />
              </div>

              <div>
                <label style={labelStyle}>Origens permitidas (separadas por vírgula, ou * para todas)</label>
                <input style={inputStyle} value={form.allowedOrigins} onChange={e => setForm(f => ({ ...f, allowedOrigins: e.target.value }))} placeholder="meusite.pt, www.meusite.pt" />
              </div>

              <div>
                <label style={labelStyle}>Webhook URL (opcional)</label>
                <input style={inputStyle} value={form.webhookUrl} onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))} placeholder="https://..." />
              </div>

              <div>
                <label style={labelStyle}>Logo URL (opcional)</label>
                <input style={inputStyle} value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${BORDER}`, background: 'var(--yb-input)', color: 'var(--yb-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: CYAN, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'A guardar...' : editId ? 'Guardar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
