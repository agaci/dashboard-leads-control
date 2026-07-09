'use client';

// Modal de confirmação reutilizável para ações destrutivas.
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Apagar', onConfirm, onCancel, busy = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--yb-card, #fff)', borderRadius: 14, padding: '22px 24px',
          maxWidth: 400, width: '100%', boxShadow: '0 12px 44px rgba(0,0,0,0.28)',
          border: '1px solid var(--yb-border, #dde1e8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(220,38,38,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--yb-fg, #1a2332)' }}>{title}</h3>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--yb-muted, #5b6472)', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--yb-border, #dde1e8)', background: 'transparent', color: 'var(--yb-muted, #5b6472)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'A apagar…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
