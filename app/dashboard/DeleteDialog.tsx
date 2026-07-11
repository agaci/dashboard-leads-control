'use client';

import { useEffect, useState } from 'react';

// Modal de apagar com código de servidor + escolha de registos associados a apagar em cascata.
// Apagar um nível NÃO apaga os outros: o utilizador escolhe (visita -> conversa -> lead).
// Só deve usar-se para registos de TESTE — apagar produção altera as estatísticas.
export function DeleteDialog({
  open, title, options = [], busy = false, error = null, onCancel, onConfirm,
}: {
  open: boolean;
  title: string;
  options?: { id: string; label: string; hint?: string }[]; // checkboxes de cascata
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (code: string, checked: Record<string, boolean>) => void;
}) {
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => { if (open) { setCode(''); setChecked({}); } }, [open]);
  if (!open) return null;

  const canConfirm = code.trim().length > 0 && !busy;
  const anyChecked = Object.values(checked).some(Boolean);

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--yb-card, #fff)', borderRadius: 14, padding: '22px 24px', maxWidth: 440, width: '100%', boxShadow: '0 12px 44px rgba(0,0,0,0.28)', border: '1px solid var(--yb-border, #dde1e8)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(220,38,38,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--yb-fg, #1a2332)' }}>{title}</h3>
        </div>

        {/* Aviso de estatísticas */}
        <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 9, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--yb-muted, #5b6472)', lineHeight: 1.5 }}>
            Apagar é <strong>irreversível</strong> e <strong>altera as estatísticas do funil</strong>. Use apenas para
            registos de <strong>teste</strong> — em produção nunca apague visitas, inbox nem leads.
          </p>
        </div>

        {/* Registos associados (cascata) */}
        {options.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            {options.map((o) => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13, color: 'var(--yb-fg, #1a2332)' }}>
                <input
                  type="checkbox"
                  checked={!!checked[o.id]}
                  onChange={(e) => setChecked((c) => ({ ...c, [o.id]: e.target.checked }))}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <span>
                  {o.label}
                  {o.hint && (<><br /><span style={{ fontSize: 11.5, color: 'var(--yb-muted, #5b6472)' }}>{o.hint}</span></>)}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--yb-subtle, #94a3b8)' }}>
            Sem registos associados detectados — só este registo será apagado.
          </p>
        )}

        {/* Código de servidor */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--yb-muted, #5b6472)', marginBottom: 6 }}>
          Código de segurança do servidor
        </label>
        <input
          type="password"
          value={code}
          autoFocus
          placeholder="Introduza o código para confirmar"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) onConfirm(code.trim(), checked); }}
          style={{ width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 9, border: '1px solid var(--yb-border, #dde1e8)', background: 'var(--yb-card-2, #f4f6f9)', padding: '0 12px', fontSize: 14, color: 'var(--yb-fg, #1a2332)', outline: 'none' }}
        />
        {error && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#dc2626', fontWeight: 600 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--yb-border, #dde1e8)', background: 'transparent', color: 'var(--yb-muted, #5b6472)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(code.trim(), checked)}
            disabled={!canConfirm}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: canConfirm ? 'pointer' : 'default', opacity: canConfirm ? 1 : 0.6 }}
          >
            {busy ? 'A apagar…' : (anyChecked ? 'Apagar selecionados' : 'Apagar')}
          </button>
        </div>
      </div>
    </div>
  );
}
