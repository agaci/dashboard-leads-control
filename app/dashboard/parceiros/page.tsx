'use client';

import { useEffect, useState } from 'react';
import type { PartnerTariff, WeightTier, DimensionalSurcharge } from '@/types/partner';

export default function ParceirosPage() {
  const [tariffs, setTariffs] = useState<PartnerTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PartnerTariff | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function fetchTariffs() {
    setLoading(true);
    const res = await fetch('/api/parceiros');
    const data = await res.json();
    if (data.success) setTariffs(data.tariffs.map((t: any) => ({ ...t, _id: t._id?.toString() })));
    setLoading(false);
  }

  useEffect(() => { fetchTariffs(); }, []);

  async function saveSelected() {
    if (!selected?._id) return;
    setSaving(true);
    await fetch(`/api/parceiros/${selected._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selected),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    fetchTariffs();
  }

  async function toggleActive(tariff: PartnerTariff) {
    await fetch(`/api/parceiros/${tariff._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !tariff.active }),
    });
    fetchTariffs();
    if (selected?._id === tariff._id) setSelected({ ...selected, active: !selected.active });
  }

  const partners = [...new Set(tariffs.map((t) => t.partner))];

  return (
    <div className="flex h-full neu-bg">
      {/* Lista */}
      <div className="w-80 flex flex-col neu-bg" style={{ borderRight: '1px solid hsl(240 10% 88%)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid hsl(240 10% 88%)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--neu-fg)', fontFamily: 'Space Grotesk, sans-serif' }}>Tarifas de Parceiros</h2>
          <p className="text-xs text-[--neu-muted] mt-0.5">{tariffs.length} tarifas · {partners.join(', ')}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-[--neu-muted]">A carregar...</p>}
          {partners.map((partner) => (
            <div key={partner}>
              <div className="px-4 py-2" style={{ background: 'hsl(240 10% 93%)', borderBottom: '1px solid hsl(240 10% 88%)' }}>
                <span className="text-xs font-semibold text-[--neu-muted] uppercase tracking-wide">{partner}</span>
              </div>
              {tariffs.filter((t) => t.partner === partner).map((t) => (
                <button
                  key={t._id}
                  onClick={() => setSelected({ ...t })}
                  className={`w-full text-left px-4 py-3 transition-all ${
                    selected?._id === t._id ? 'neu-pressed border-l-3 border-l-orange-500' : 'hover:neu-raised-sm'
                  }`}
                  style={{ borderBottom: '1px solid hsl(240 10% 88%)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--neu-fg)' }}>{t.serviceLabelShort}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="text-xs text-[--neu-muted]">{t.zone} · Markup: {((t.markup ?? 1.35) * 100 - 100).toFixed(0)}%</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Detalhe / Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-[--neu-muted] text-sm">
            Seleccione uma tarifa para editar
          </div>
        ) : (
          <TariffEditor
            tariff={selected}
            onChange={setSelected}
            onSave={saveSelected}
            onToggleActive={() => toggleActive(selected)}
            saving={saving}
            saved={saved}
          />
        )}
      </div>
    </div>
  );
}

function TariffEditor({
  tariff, onChange, onSave, onToggleActive, saving, saved,
}: {
  tariff: PartnerTariff;
  onChange: (t: PartnerTariff) => void;
  onSave: () => void;
  onToggleActive: () => void;
  saving: boolean;
  saved: boolean;
}) {
  function set<K extends keyof PartnerTariff>(key: K, val: PartnerTariff[K]) {
    onChange({ ...tariff, [key]: val });
  }

  function updateTier(i: number, field: keyof WeightTier, val: string) {
    const tiers = [...tariff.weightTiers];
    tiers[i] = { ...tiers[i], [field]: parseFloat(val) || 0 };
    set('weightTiers', tiers);
  }

  function updateDim(i: number, field: keyof DimensionalSurcharge, val: string) {
    const dims = [...tariff.dimensionalSurcharges];
    dims[i] = { ...dims[i], [field]: parseFloat(val) || 0 };
    set('dimensionalSurcharges', dims);
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs neu-pressed px-2 py-0.5 rounded-lg font-mono text-[--neu-muted]">{tariff.partner}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tariff.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {tariff.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--neu-fg)', fontFamily: 'Space Grotesk, sans-serif' }}>{tariff.serviceLabel}</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onToggleActive}
            className={`px-3 py-1.5 text-sm rounded-xl neu-raised-sm transition-all ${
              tariff.active ? 'text-red-500' : 'text-green-600'
            }`}
          >
            {tariff.active ? 'Desactivar' : 'Activar'}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-1.5 neu-btn-primary text-sm rounded-xl disabled:opacity-50"
          >
            {saving ? 'A guardar...' : saved ? 'Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Info básica */}
      <section className="neu-raised rounded-2xl p-5 mb-4 space-y-3">
        <h3 className="text-xs font-semibold text-[--neu-muted] uppercase tracking-wide">Informação</h3>
        <Field label="Etiqueta (cliente vê)">
          <input
            value={tariff.serviceLabel}
            onChange={(e) => set('serviceLabel', e.target.value)}
            className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
          />
        </Field>
        <Field label="Etiqueta curta">
          <input
            value={tariff.serviceLabelShort}
            onChange={(e) => set('serviceLabelShort', e.target.value)}
            className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
          />
        </Field>
        <Field label="Descrição de entrega">
          <input
            value={tariff.deliveryDescription}
            onChange={(e) => set('deliveryDescription', e.target.value)}
            className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Janela">
            <input
              value={tariff.deliveryWindow}
              onChange={(e) => set('deliveryWindow', e.target.value)}
              className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label="Markup (ex: 1.35)">
            <input
              type="number" step="0.01" min="1" max="3"
              value={tariff.markup ?? 1.35}
              onChange={(e) => set('markup', parseFloat(e.target.value))}
              className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label="Ordem">
            <input
              type="number" min="1"
              value={tariff.sortOrder}
              onChange={(e) => set('sortOrder', parseInt(e.target.value))}
              className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
            />
          </Field>
        </div>
      </section>

      {/* Tabela de pesos */}
      <section className="neu-raised rounded-2xl p-5 mb-4">
        <h3 className="text-xs font-semibold text-[--neu-muted] uppercase tracking-wide mb-3">Tabela de Pesos (€)</h3>
        <div className="space-y-2">
          {tariff.weightTiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-center text-sm">
              <div className="text-[--neu-muted]">
                {tier.maxKg !== undefined ? `Até ${tier.maxKg} kg` : 'Adicional por kg'}
              </div>
              <div className="col-span-2">
                <input
                  type="number" step="0.01"
                  value={tier.price}
                  onChange={(e) => updateTier(i, 'price', e.target.value)}
                  className="w-full neu-input rounded-xl px-3 py-1 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Suplementos dimensionais */}
      <section className="neu-raised rounded-2xl p-5 mb-4">
        <h3 className="text-xs font-semibold text-[--neu-muted] uppercase tracking-wide mb-3">Suplementos Dimensionais (C+A+L em cm)</h3>
        <div className="space-y-2">
          {tariff.dimensionalSurcharges.map((dim, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-center text-sm">
              <div className="text-[--neu-muted]">{dim.minCm}–{dim.maxCm} cm</div>
              <div className="col-span-2">
                <input
                  type="number" step="0.01"
                  value={dim.surcharge}
                  onChange={(e) => updateDim(i, 'surcharge', e.target.value)}
                  className="w-full neu-input rounded-xl px-3 py-1 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Suplementos base */}
      <section className="neu-raised rounded-2xl p-5 mb-4">
        <h3 className="text-xs font-semibold text-[--neu-muted] uppercase tracking-wide mb-3">Suplementos Base (€)</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sábado">
            <input
              type="number" step="0.01"
              value={tariff.supplements.saturday ?? 0}
              onChange={(e) => set('supplements', { ...tariff.supplements, saturday: parseFloat(e.target.value) })}
              className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label="Acima 25km">
            <input
              type="number" step="0.01"
              value={tariff.supplements.above25km ?? 0}
              onChange={(e) => set('supplements', { ...tariff.supplements, above25km: parseFloat(e.target.value) })}
              className="w-full neu-input rounded-xl px-3 py-1.5 text-sm"
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[--neu-muted] block mb-1">{label}</label>
      {children}
    </div>
  );
}
