'use client';

import { useEffect, useState } from 'react';

type Precedence = { priceMin: number; priceKm: number; pricePoint: number };
type VehicleType = { precedence1: Precedence; precedence4: Precedence };
type GlobalParams = { distance2To50: number; distance4To1: number; discountUp2Points: number; discount4To1: number };
type OutOfHours = {
  timeWindow1: number; timeWindow2: number; timeWindow3: number; timeWindow4: number;
  flatRate1: number; flatRate2: number; flatRate3: number; flatRate4: number;
  flatRateSaturdays: number; flatRateSundays: number; flatRateHolidays: number;
  additionalKmsFee1: number; additionalKmsFee2: number; additionalKmsFee3: number; additionalKmsFee4: number;
  additionalKmsFeeSaturdays: number; additionalKmsFeeSundays: number; additionalKmsFeeHolidays: number;
  distanceTariffsPercentageTotal: number; percentageTotalWorsening: number;
};
type Calculator = {
  discountPercent: number;
  type2: VehicleType; type50: VehicleType; type150: VehicleType; type300: VehicleType;
  globalParameters: GlobalParams;
  outOfHoursFees: OutOfHours;
  percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox: number;
  percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox: number;
};

const CARD: React.CSSProperties = { background: 'var(--yb-card)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '18px 20px', marginBottom: 14 };
const TITLE: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--yb-subtle)', marginBottom: 14 };
const INPUT = 'w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-400';

function Num({ label, value, onChange, step = 0.001 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input type="number" step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={INPUT}
        style={{ background: 'var(--yb-input)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--yb-fg)', colorScheme: 'inherit' as const }}
      />
    </div>
  );
}

function PrecedenceEditor({ label, data, onChange }: { label: string; data: Precedence; onChange: (d: Precedence) => void }) {
  return (
    <div style={{ background: 'var(--yb-card-2)', borderRadius: 10, padding: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--yb-muted)', marginBottom: 8 }}>{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <Num label="Preço/km (€)" value={data.priceKm} onChange={(v) => onChange({ ...data, priceKm: v })} />
        <Num label="Preço mín (€)" value={data.priceMin} onChange={(v) => onChange({ ...data, priceMin: v })} />
        <Num label="Preço/ponto (€)" value={data.pricePoint} onChange={(v) => onChange({ ...data, pricePoint: v })} />
      </div>
    </div>
  );
}

function VehicleEditor({ label, data, onChange }: { label: string; data: VehicleType; onChange: (d: VehicleType) => void }) {
  return (
    <div style={CARD}>
      <p style={TITLE}>{label}</p>
      <div className="space-y-2">
        <PrecedenceEditor label="1 Hora" data={data.precedence1} onChange={(v) => onChange({ ...data, precedence1: v })} />
        <PrecedenceEditor label="4 Horas" data={data.precedence4} onChange={(v) => onChange({ ...data, precedence4: v })} />
      </div>
    </div>
  );
}

export default function PrecosPage() {
  const [calc, setCalc] = useState<Calculator | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeCalcName, setActiveCalcName] = useState<string>('');
  const [availableCalcs, setAvailableCalcs] = useState<{ name: string }[]>([]);
  const [switching, setSwitching] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneMsg, setCloneMsg] = useState<string | null>(null);

  function loadCalc() {
    fetch('/api/settings/calculator')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.success) {
          const raw = d.calculator ?? {};
          const defPrec: Precedence = { priceKm: 0, priceMin: 0, pricePoint: 0 };
          const defVeh: VehicleType = { precedence1: defPrec, precedence4: defPrec };
          const defGlobal: GlobalParams = { distance2To50: 0, distance4To1: 0, discountUp2Points: 0, discount4To1: 0 };
          const defOoh: OutOfHours = {
            timeWindow1: 9, timeWindow2: 20, timeWindow3: 23, timeWindow4: 0,
            flatRate1: 0, flatRate2: 0, flatRate3: 0, flatRate4: 0,
            flatRateSaturdays: 0, flatRateSundays: 0, flatRateHolidays: 0,
            additionalKmsFee1: 0, additionalKmsFee2: 0, additionalKmsFee3: 0, additionalKmsFee4: 0,
            additionalKmsFeeSaturdays: 0, additionalKmsFeeSundays: 0, additionalKmsFeeHolidays: 0,
            distanceTariffsPercentageTotal: 0, percentageTotalWorsening: 0,
          };
          setCalc({
            discountPercent: 0.1,
            percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox: 0,
            percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox: 0,
            ...raw,
            type2:   { ...defVeh, ...raw.type2 },
            type50:  { ...defVeh, ...raw.type50 },
            type150: { ...defVeh, ...raw.type150 },
            type300: { ...defVeh, ...raw.type300 },
            globalParameters: { ...defGlobal, ...raw.globalParameters },
            outOfHoursFees:   { ...defOoh,    ...raw.outOfHoursFees   },
          });
          setActiveCalcName(d.name ?? '');
        } else {
          setLoadError(d.error ?? 'Calculadora não encontrada');
        }
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err.message ?? 'Erro ao carregar calculadora');
        setLoading(false);
      });
  }

  function loadAvailable() {
    fetch('/api/settings/calculators')
      .then((r) => r.json())
      .then((d) => { if (d.success) setAvailableCalcs(d.calculators ?? []); })
      .catch(() => {});
  }

  useEffect(() => {
    loadCalc();
    loadAvailable();
  }, []);

  async function save() {
    if (!calc) return;
    setSaving(true);
    await fetch('/api/settings/calculator', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calc),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function switchCalc(name: string) {
    if (name === activeCalcName) return;
    setSwitching(true);
    await fetch('/api/routing-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calcPriceMachine: name }),
    });
    setSwitching(false);
    setLoading(true);
    loadCalc();
  }

  async function cloneToCalc1() {
    if (!activeCalcName) return;
    setCloning(true);
    setCloneMsg(null);
    const res = await fetch('/api/settings/calculators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceName: activeCalcName, targetName: 'calculator_1' }),
    });
    const data = await res.json();
    if (data.success) {
      setCloneMsg('calculator_1 criada com sucesso.');
      loadAvailable();
    } else {
      setCloneMsg(data.error ?? 'Erro ao clonar.');
    }
    setCloning(false);
  }

  function setOoh(field: keyof OutOfHours, val: number) {
    if (!calc) return;
    setCalc({ ...calc, outOfHoursFees: { ...calc.outOfHoursFees, [field]: val } });
  }

  function setGlobal(field: keyof GlobalParams, val: number) {
    if (!calc) return;
    setCalc({ ...calc, globalParameters: { ...calc.globalParameters, [field]: val } });
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">A carregar...</div>;
  if (loadError) return <div className="p-8 text-sm text-red-400">Erro ao carregar: {loadError}</div>;
  if (!calc) return <div className="p-8 text-sm text-red-400">Calculadora não encontrada.</div>;

  const discountPct = Math.round((calc.discountPercent ?? 0.1) * 100);

  return (
    <div className="overflow-y-auto h-full p-6" style={{ background: 'var(--yb-bg)' }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--yb-fg)', fontFamily: 'Space Grotesk, sans-serif' }}>Preços & Calculadora</h1>
            <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginTop: 2 }}>{activeCalcName || '—'}</p>
          </div>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: saving ? '#aaa' : saved ? '#22c55e' : '#00bcd4' }}>
            {saving ? 'A guardar...' : saved ? '✓ Guardado' : 'Guardar alterações'}
          </button>
        </div>

        {/* Selecção de calculadora */}
        <div style={CARD}>
          <p style={TITLE}>Calculadora activa</p>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {availableCalcs.map((c) => (
              <button
                key={c.name}
                onClick={() => switchCalc(c.name)}
                disabled={switching}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                style={{
                  background: c.name === activeCalcName ? 'hsl(var(--cyan-soft))' : 'var(--yb-card-2)',
                  color: c.name === activeCalcName ? 'hsl(var(--cyan))' : 'var(--yb-muted)',
                  borderColor: c.name === activeCalcName ? 'hsl(var(--cyan))' : 'transparent',
                  opacity: switching ? 0.6 : 1,
                }}>
                {c.name}
              </button>
            ))}
          </div>
          {!availableCalcs.some((c) => c.name === 'calculator_1') && (
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={cloneToCalc1}
                disabled={cloning}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--yb-card-2)', color: 'var(--yb-subtle)', opacity: cloning ? 0.6 : 1 }}>
                {cloning ? 'A criar...' : 'Criar calculator_1 (cópia da actual)'}
              </button>
              {cloneMsg && <span style={{ fontSize: 11, color: cloneMsg.includes('sucesso') ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>{cloneMsg}</span>}
            </div>
          )}
          {cloneMsg && availableCalcs.some((c) => c.name === 'calculator_1') && (
            <p style={{ fontSize: 11, color: 'hsl(var(--success))', marginTop: 4 }}>{cloneMsg}</p>
          )}
        </div>

        {/* Desconto */}
        <div style={CARD}>
          <p style={TITLE}>Desconto global apresentado no chat</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input type="range" min={0} max={50} step={1}
                value={discountPct}
                onChange={(e) => setCalc({ ...calc, discountPercent: parseInt(e.target.value) / 100 })}
                className="w-full accent-cyan-400" />
              <div className="flex justify-between mt-1" style={{ fontSize: 11, color: 'var(--yb-subtle)' }}><span>0%</span><span>50%</span></div>
            </div>
            <div className="text-center min-w-[70px]">
              <span className="text-3xl font-bold" style={{ color: '#00bcd4' }}>{discountPct}%</span>
              <p style={{ fontSize: 11, color: 'var(--yb-subtle)' }}>desconto</p>
            </div>
            <div style={{ fontSize: 11, color: 'var(--yb-muted)', background: 'var(--yb-card-2)', borderRadius: 8, padding: 12, minWidth: 140 }}>
              <p style={{ fontWeight: 600, color: 'var(--yb-muted)', marginBottom: 4 }}>Exemplo</p>
              <p>Base: <b>€100.00</b></p>
              <p>Desconto: <b style={{ color: '#e53e3e' }}>-€{discountPct}.00</b></p>
              <p>Final: <b style={{ color: '#22c55e' }}>€{100 - discountPct}.00</b></p>
            </div>
          </div>
        </div>

        {/* Multiplicadores globais */}
        <div style={CARD}>
          <p style={TITLE}>Multiplicadores globais</p>
          <div className="grid grid-cols-2 gap-3">
            <Num label="% Máximo (percentPlusMax)" step={0.01}
              value={calc.percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox}
              onChange={(v) => setCalc({ ...calc, percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox: v })} />
            <Num label="% Mínimo (percentPlusMin)" step={0.01}
              value={calc.percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox}
              onChange={(v) => setCalc({ ...calc, percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox: v })} />
          </div>
        </div>

        {/* Parâmetros globais */}
        <div style={CARD}>
          <p style={TITLE}>Parâmetros de Roteamento</p>
          <div className="grid grid-cols-2 gap-3">
            <Num label="Dist. moto→ligeiro (km)" step={1} value={calc.globalParameters.distance2To50} onChange={(v) => setGlobal('distance2To50', v)} />
            <Num label="Dist. 4h→1h (km)" step={1} value={calc.globalParameters.distance4To1} onChange={(v) => setGlobal('distance4To1', v)} />
          </div>
        </div>

        {/* Tabela de preços por viatura */}
        <VehicleEditor label="Moto (até 2 kg)" data={calc.type2} onChange={(v) => setCalc({ ...calc, type2: v })} />
        <VehicleEditor label="Ligeiro (até 50 kg)" data={calc.type50} onChange={(v) => setCalc({ ...calc, type50: v })} />
        <VehicleEditor label="Furgão C1 (até 150 kg)" data={calc.type150} onChange={(v) => setCalc({ ...calc, type150: v })} />
        <VehicleEditor label="Furgão C2 (até 300 kg)" data={calc.type300} onChange={(v) => setCalc({ ...calc, type300: v })} />

        {/* Fora de horas */}
        <div style={CARD}>
          <p style={TITLE}>Suplementos Fora de Horas (%)</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--yb-muted)', gridColumn: 'span 2', marginBottom: 4 }}>Janelas horárias</p>
            <Num label="Início horário principal (h)" step={1} value={calc.outOfHoursFees.timeWindow1} onChange={(v) => setOoh('timeWindow1', v)} />
            <Num label="Início noite (h)" step={1} value={calc.outOfHoursFees.timeWindow2} onChange={(v) => setOoh('timeWindow2', v)} />
            <Num label="Noite tarde (h)" step={1} value={calc.outOfHoursFees.timeWindow3} onChange={(v) => setOoh('timeWindow3', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--yb-muted)', gridColumn: 'span 2' }}>Suplemento fixo (%)</p>
            <Num label="Horário principal" step={1} value={calc.outOfHoursFees.flatRate1} onChange={(v) => setOoh('flatRate1', v)} />
            <Num label="Início noite" step={1} value={calc.outOfHoursFees.flatRate2} onChange={(v) => setOoh('flatRate2', v)} />
            <Num label="Noite tarde" step={1} value={calc.outOfHoursFees.flatRate3} onChange={(v) => setOoh('flatRate3', v)} />
            <Num label="Madrugada" step={1} value={calc.outOfHoursFees.flatRate4} onChange={(v) => setOoh('flatRate4', v)} />
            <Num label="Sábado" step={1} value={calc.outOfHoursFees.flatRateSaturdays} onChange={(v) => setOoh('flatRateSaturdays', v)} />
            <Num label="Domingo" step={1} value={calc.outOfHoursFees.flatRateSundays} onChange={(v) => setOoh('flatRateSundays', v)} />
            <Num label="Feriado" step={1} value={calc.outOfHoursFees.flatRateHolidays} onChange={(v) => setOoh('flatRateHolidays', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--yb-muted)', gridColumn: 'span 2' }}>Suplemento km (%)</p>
            <Num label="Horário principal" step={1} value={calc.outOfHoursFees.additionalKmsFee1} onChange={(v) => setOoh('additionalKmsFee1', v)} />
            <Num label="Início noite" step={1} value={calc.outOfHoursFees.additionalKmsFee2} onChange={(v) => setOoh('additionalKmsFee2', v)} />
            <Num label="Noite tarde" step={1} value={calc.outOfHoursFees.additionalKmsFee3} onChange={(v) => setOoh('additionalKmsFee3', v)} />
            <Num label="Madrugada" step={1} value={calc.outOfHoursFees.additionalKmsFee4} onChange={(v) => setOoh('additionalKmsFee4', v)} />
            <Num label="Sábado" step={1} value={calc.outOfHoursFees.additionalKmsFeeSaturdays} onChange={(v) => setOoh('additionalKmsFeeSaturdays', v)} />
            <Num label="Domingo" step={1} value={calc.outOfHoursFees.additionalKmsFeeSundays} onChange={(v) => setOoh('additionalKmsFeeSundays', v)} />
            <Num label="Feriado" step={1} value={calc.outOfHoursFees.additionalKmsFeeHolidays} onChange={(v) => setOoh('additionalKmsFeeHolidays', v)} />
          </div>
        </div>

      </div>
    </div>
  );
}
