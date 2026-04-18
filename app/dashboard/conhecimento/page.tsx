'use client';

import { useEffect, useState } from 'react';

type Situacao = {
  _id: string;
  id: string;
  titulo: string;
  categoria: string;
  frequencia: string;
  sinais_deteccao: string[];
  script_resposta: Record<string, string>;
  escalamento_humano: string[];
  active: boolean;
};

const CATEGORIAS = ['preco', 'agregacao', 'urgencia', 'viatura', 'faq', 'objecao', 'parceiro', 'outro'];
const FREQUENCIAS = ['constante', 'muito_alta', 'alta', 'media', 'baixa'];

const FREQ_COLORS: Record<string, string> = {
  constante: 'bg-red-100 text-red-700',
  muito_alta: 'bg-orange-100 text-orange-700',
  alta: 'bg-amber-100 text-amber-700',
  media: 'bg-blue-100 text-blue-700',
  baixa: 'bg-gray-100 text-gray-500',
};

const empty: Omit<Situacao, '_id'> = {
  id: '',
  titulo: '',
  categoria: 'faq',
  frequencia: 'media',
  sinais_deteccao: [],
  script_resposta: { abertura: '' },
  escalamento_humano: [],
  active: true,
};

export default function ConhecimentoPage() {
  const [items, setItems] = useState<Situacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState<Partial<Situacao> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/knowledge');
    const data = await res.json();
    if (data.success) setItems(data.items);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter((s) => {
    const matchCat = !catFilter || s.categoria === catFilter;
    const matchSearch = !search || s.titulo.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  async function save() {
    if (!editing) return;
    setSaving(true);
    if (editing._id) {
      await fetch(`/api/knowledge/${editing._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
    } else {
      await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
    }
    setSaving(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Eliminar esta situação?')) return;
    setDeleting(id);
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    setDeleting(null);
    load();
  }

  async function toggleActive(item: Situacao) {
    await fetch(`/api/knowledge/${item._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    });
    load();
  }

  return (
    <div className="flex h-full">
      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--neu-fg)' }}>
                Base de Conhecimento
              </h2>
              <p className="text-sm text-[--neu-muted]">{items.length} situações · injectadas no assistente IA</p>
            </div>
            <button
              onClick={() => setEditing({ ...empty })}
              className="neu-btn-primary px-4 py-2 rounded-xl text-sm font-medium text-white"
            >
              + Nova situação
            </button>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="neu-input rounded-xl px-3 py-1.5 text-sm flex-1 min-w-48"
            />
            <button
              onClick={() => setCatFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${!catFilter ? 'neu-pill-active' : 'neu-pill text-[--neu-muted]'}`}
            >
              Todas
            </button>
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() => setCatFilter(catFilter === c ? '' : c)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all capitalize ${catFilter === c ? 'neu-pill-active' : 'neu-pill text-[--neu-muted]'}`}
              >
                {c}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center text-[--neu-muted] py-12 text-sm">A carregar...</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <div
                  key={s._id}
                  className={`neu-raised rounded-2xl px-5 py-4 flex items-start gap-4 transition-all ${!s.active ? 'opacity-40' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-[--neu-muted]">{s.id}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{s.categoria}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${FREQ_COLORS[s.frequencia] ?? 'bg-gray-100 text-gray-500'}`}>
                        {s.frequencia?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--neu-fg)' }}>{s.titulo}</p>
                    {s.script_resposta?.abertura && (
                      <p className="text-xs text-[--neu-muted] mt-1 line-clamp-2">{s.script_resposta.abertura}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(s)}
                      title={s.active ? 'Desactivar' : 'Activar'}
                      className={`w-8 h-8 rounded-lg neu-raised-sm flex items-center justify-center text-xs transition-all ${s.active ? 'text-green-600' : 'text-gray-400'}`}
                    >
                      {s.active ? '●' : '○'}
                    </button>
                    <button
                      onClick={() => setEditing({ ...s })}
                      className="w-8 h-8 rounded-lg neu-raised-sm flex items-center justify-center text-[--neu-muted] hover:text-[--neu-fg] text-sm"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => remove(s._id)}
                      disabled={deleting === s._id}
                      className="w-8 h-8 rounded-lg neu-raised-sm flex items-center justify-center text-red-400 hover:text-red-600 text-sm disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-[--neu-muted] py-12 text-sm">Sem resultados</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Painel de edição */}
      {editing && (
        <div className="w-[480px] shrink-0 neu-bg border-l border-[rgba(163,177,198,0.3)] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-base" style={{ color: 'var(--neu-fg)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {editing._id ? 'Editar situação' : 'Nova situação'}
              </h3>
              <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-full neu-raised-sm flex items-center justify-center text-[--neu-muted] hover:text-[--neu-fg]">×</button>
            </div>

            <div className="space-y-4">
              <Field label="Título">
                <input
                  className="neu-input rounded-xl px-3 py-2 text-sm w-full"
                  value={editing.titulo ?? ''}
                  onChange={(e) => setEditing((p) => ({ ...p!, titulo: e.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria">
                  <select
                    className="neu-input rounded-xl px-3 py-2 text-sm w-full"
                    value={editing.categoria ?? 'faq'}
                    onChange={(e) => setEditing((p) => ({ ...p!, categoria: e.target.value }))}
                  >
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Frequência">
                  <select
                    className="neu-input rounded-xl px-3 py-2 text-sm w-full"
                    value={editing.frequencia ?? 'media'}
                    onChange={(e) => setEditing((p) => ({ ...p!, frequencia: e.target.value }))}
                  >
                    {FREQUENCIAS.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Sinais de detecção (uma por linha)">
                <textarea
                  className="neu-input rounded-xl px-3 py-2 text-sm w-full h-24 resize-none"
                  value={(editing.sinais_deteccao ?? []).join('\n')}
                  onChange={(e) => setEditing((p) => ({ ...p!, sinais_deteccao: e.target.value.split('\n').filter(Boolean) }))}
                />
              </Field>

              <Field label="Resposta — abertura">
                <textarea
                  className="neu-input rounded-xl px-3 py-2 text-sm w-full h-28 resize-none"
                  value={editing.script_resposta?.abertura ?? ''}
                  onChange={(e) => setEditing((p) => ({
                    ...p!,
                    script_resposta: { ...(p!.script_resposta ?? {}), abertura: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Quando escalar para humano (uma por linha)">
                <textarea
                  className="neu-input rounded-xl px-3 py-2 text-sm w-full h-20 resize-none"
                  value={(editing.escalamento_humano ?? []).join('\n')}
                  onChange={(e) => setEditing((p) => ({ ...p!, escalamento_humano: e.target.value.split('\n').filter(Boolean) }))}
                />
              </Field>

              <div className="flex items-center gap-3">
                <label className="text-sm text-[--neu-muted]">Activa</label>
                <button
                  onClick={() => setEditing((p) => ({ ...p!, active: !p!.active }))}
                  style={{ width: 48, height: 28, position: 'relative', borderRadius: 14, border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, background: editing.active ? 'transparent' : 'transparent' }}
                >
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 14, background: editing.active ? 'hsl(13 100% 65%)' : 'hsl(240 10% 82%)', transition: 'background .2s' }} />
                  <span style={{ position: 'absolute', top: 4, left: editing.active ? 24 : 4, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'left .2s' }} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={save}
                disabled={saving || !editing.titulo}
                className="flex-1 neu-btn-primary py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? 'A guardar...' : 'Guardar'}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2.5 rounded-xl text-sm text-[--neu-muted] neu-raised-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[--neu-muted] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
