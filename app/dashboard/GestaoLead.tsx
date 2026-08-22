'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Card de gestão de uma lead — estado, prioridade, follow-up, notas, tags e comentários.
 *
 * Escreve na colecção `leadsMetadata`, a mesma do card "Gestão" do leadsBoard da YourBox.
 * Ver lib/leads/gestao.ts para o porquê de partilharmos a colecção.
 */

type Comentario = { id: string; timestamp: string; user: string; userId: string | null; text: string };

type Gestao = {
  leadId: string;
  status: 'novo' | 'contactado' | 'fechado' | 'perdido';
  priority: 'alta' | 'normal' | 'baixa';
  notes: string;
  followUpDate: string | null;
  tags: string[];
  comments: Comentario[];
  updatedAt: string | null;
  updatedBy: string | null;
};

const ESTADOS: Gestao['status'][] = ['novo', 'contactado', 'fechado', 'perdido'];
const PRIORIDADES: Gestao['priority'][] = ['alta', 'normal', 'baixa'];

const CORES_ESTADO: Record<Gestao['status'], string> = {
  novo:       'bg-cyan-soft text-cyan',
  contactado: 'bg-warning-soft text-warning',
  fechado:    'bg-success-soft text-success',
  perdido:    'bg-secondary text-destructive',
};

const rotulo = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function dataInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function GestaoLead({ leadId }: { leadId: string }) {
  const [g, setG] = useState<Gestao | null>(null);
  const [notas, setNotas] = useState('');
  const [novaTag, setNovaTag] = useState('');
  const [comentario, setComentario] = useState('');
  const [aGravar, setAGravar] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/gestao`);
      const data = await res.json();
      if (data.success) { setG(data.gestao); setNotas(data.gestao.notes ?? ''); }
      else setErro(data.error ?? 'Não foi possível carregar');
    } catch { setErro('Erro de ligação'); }
  }, [leadId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function gravar(campos: Partial<Gestao>) {
    setAGravar(true); setErro(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/gestao`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos),
      });
      const data = await res.json();
      if (data.success) {
        setG(data.gestao);
        setGuardado(true);
        setTimeout(() => setGuardado(false), 1800);
      } else setErro(data.error ?? 'Não foi possível guardar');
    } catch { setErro('Erro de ligação'); }
    finally { setAGravar(false); }
  }

  async function comentar() {
    const t = comentario.trim();
    if (!t) return;
    setAGravar(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/gestao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      const data = await res.json();
      if (data.success) { setG(data.gestao); setComentario(''); }
      else setErro(data.error ?? 'Não foi possível comentar');
    } catch { setErro('Erro de ligação'); }
    finally { setAGravar(false); }
  }

  async function apagarComentario(cid: string) {
    setAGravar(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/gestao?comentario=${encodeURIComponent(cid)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setG(data.gestao);
    } catch { setErro('Erro de ligação'); }
    finally { setAGravar(false); }
  }

  if (!g) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-card">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Gestão</div>
        <p className="mt-2 text-sm text-muted-foreground">{erro ?? 'A carregar...'}</p>
      </div>
    );
  }

  const campoBase = 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground';

  return (
    <div className="rounded-xl bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Gestão</div>
        <div className="flex items-center gap-2">
          {guardado && <span className="text-xs font-semibold text-success">Guardado</span>}
          {g.updatedBy && (
            <span className="text-[11px] text-muted-foreground">
              por {g.updatedBy}{g.updatedAt ? ` · ${new Date(g.updatedAt).toLocaleString('pt-PT')}` : ''}
            </span>
          )}
        </div>
      </div>

      {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}

      {/* Estado e prioridade guardam ao mudar — sao a accao mais frequente */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Estado</label>
          <select
            className={campoBase}
            value={g.status}
            disabled={aGravar}
            onChange={(e) => gravar({ status: e.target.value as Gestao['status'] })}
          >
            {ESTADOS.map((s) => <option key={s} value={s}>{rotulo(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Prioridade</label>
          <select
            className={campoBase}
            value={g.priority}
            disabled={aGravar}
            onChange={(e) => gravar({ priority: e.target.value as Gestao['priority'] })}
          >
            {PRIORIDADES.map((p) => <option key={p} value={p}>{rotulo(p)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Data de follow-up</label>
          <input
            type="date"
            className={campoBase}
            value={dataInput(g.followUpDate)}
            disabled={aGravar}
            onChange={(e) => gravar({ followUpDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Notas</label>
        <textarea
          className={`${campoBase} min-h-[80px]`}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          onBlur={() => { if (notas !== g.notes) gravar({ notes: notas }); }}
          placeholder="Notas sobre esta lead..."
        />
        <p className="mt-1 text-[11px] text-muted-foreground">Guarda ao sair do campo.</p>
      </div>

      <div className="mt-3">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Etiquetas</label>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {g.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
              {t}
              <button
                onClick={() => gravar({ tags: g.tags.filter((x) => x !== t) })}
                className="cursor-pointer border-none bg-transparent text-muted-foreground hover:text-foreground"
                title="Remover"
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="rounded-lg border border-border bg-input px-2.5 py-1 text-xs text-foreground"
            value={novaTag}
            onChange={(e) => setNovaTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const t = novaTag.trim();
                if (t && !g.tags.includes(t)) gravar({ tags: [...g.tags, t] });
                setNovaTag('');
              }
            }}
            placeholder="Escreve e carrega Enter"
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Comentários</label>

        {g.comments.length > 0 && (
          <div className="mt-2 grid gap-2">
            {g.comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-secondary/60 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{c.user}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(c.timestamp).toLocaleString('pt-PT')}
                    <button
                      onClick={() => apagarComentario(c.id)}
                      className="ml-2 cursor-pointer border-none bg-transparent text-muted-foreground hover:text-destructive"
                      title="Apagar comentário"
                    >
                      ×
                    </button>
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-foreground whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <input
            className={campoBase}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); comentar(); } }}
            placeholder="Escreve um comentário..."
          />
          <button
            onClick={comentar}
            disabled={aGravar || !comentario.trim()}
            className="shrink-0 rounded-lg bg-cyan px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer border-none"
          >
            Adicionar
          </button>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Visível no portal do parceiro quando a lead vem de um widget.
      </p>

      <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CORES_ESTADO[g.status]}`}>
        {rotulo(g.status)}
      </span>
    </div>
  );
}
