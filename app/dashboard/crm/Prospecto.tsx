'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * A ficha de angariação de um parceiro.
 *
 * É onde a gerente de conta trabalha todos os dias enquanto a empresa ainda não é
 * parceira: escrever o que aconteceu, mudar o estado com um motivo, e enviar a carta.
 *
 * Vive dentro da ficha do parceiro que já existe, e não num ecrã novo. Um prospecto é um
 * parceiro num estado inicial — separá-los obrigaria a migrar o registo no momento em que
 * ele adere, perdendo o historial da angariação exactamente quando ele passa a valer
 * alguma coisa.
 */

type Campo = { id: string; label: string; obrigatorio: boolean; tipo: 'texto' | 'numero'; exemplo: string; nota?: string };
type Carta = { id: string; nome: string; quando: string; assunto: string; campos: Campo[] };
type Proximo = { id: string; label: string; nota: string };
type Interaccao = {
  _id: string; tipo: string; em: string; actor: string; resumo: string;
  email?: { para: string; versao: string; motivo?: string; enviado: boolean };
};

const CARD: React.CSSProperties = {
  background: 'var(--yb-card)', borderRadius: 12,
  border: '1px solid var(--yb-border)', padding: '15px 17px', marginBottom: 12,
};
const TITULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--yb-subtle)', marginBottom: 10,
};
const CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7,
  border: '1px solid var(--yb-border)', background: 'var(--yb-input)',
  color: 'var(--yb-fg)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
};
const BOTAO = (tom: 'primario' | 'neutro' = 'primario'): React.CSSProperties => ({
  background: tom === 'primario' ? 'rgba(0,188,212,0.15)' : 'var(--yb-input)',
  color: tom === 'primario' ? 'var(--yb-cyan)' : 'var(--yb-muted)',
  border: `1px solid ${tom === 'primario' ? 'rgba(0,188,212,0.35)' : 'var(--yb-border)'}`,
  borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
});

const ICONE: Record<string, string> = {
  chamada: '·', email: '@', reuniao: '§', nota: '—', formulario: '#',
};
const ROTULO_TIPO: Record<string, string> = {
  chamada: 'Chamada', email: 'Email', reuniao: 'Reunião', nota: 'Nota', formulario: 'Formulário',
};

export default function Prospecto({ parceiro, aoMudar }: {
  parceiro: { _id: string; nome: string; estado: string; email?: string; motivoSaida?: string };
  aoMudar: () => void;
}) {
  const [interaccoes, setInteraccoes] = useState<Interaccao[]>([]);
  const [proximos, setProximos] = useState<Proximo[]>([]);
  const [painel, setPainel] = useState<'nada' | 'nota' | 'estado' | 'carta'>('nada');

  const carregar = useCallback(async () => {
    const [i, e] = await Promise.all([
      fetch(`/api/crm/parceiros/${parceiro._id}/interaccoes`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
      fetch(`/api/crm/parceiros/${parceiro._id}/estado`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
    ]);
    if (i?.success) setInteraccoes(i.interaccoes);
    if (e?.success) setProximos(e.proximos);
  }, [parceiro._id]);

  useEffect(() => { carregar(); }, [carregar]);

  const opos = parceiro.estado === 'opos_se';

  return (
    <div style={{ ...CARD, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ ...TITULO, marginBottom: 0 }}>Angariação</p>
        {!opos && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button onClick={() => setPainel(painel === 'nota' ? 'nada' : 'nota')} style={BOTAO('neutro')}>
              Registar contacto
            </button>
            <button onClick={() => setPainel(painel === 'carta' ? 'nada' : 'carta')} style={BOTAO('neutro')}>
              Enviar carta
            </button>
            {proximos.length > 0 && (
              <button onClick={() => setPainel(painel === 'estado' ? 'nada' : 'estado')} style={BOTAO('primario')}>
                Mudar estado
              </button>
            )}
          </div>
        )}
      </div>

      {opos && (
        <p style={{
          fontSize: 12, color: '#f87171', margin: '0 0 12px', lineHeight: 1.6,
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.28)',
          borderRadius: 9, padding: '10px 12px',
        }}>
          Esta empresa pediu para não receber mais contactos de angariação.
          {parceiro.motivoSaida ? ` ${parceiro.motivoSaida}` : ''}
          <br />
          <span style={{ color: 'var(--yb-subtle)' }}>
            Se vier a ser parceira por outra via, continua a receber as leads que compra —
            a oposição é só à angariação.
          </span>
        </p>
      )}

      {painel === 'nota' && (
        <RegistarContacto partnerId={parceiro._id}
          aoGravar={() => { setPainel('nada'); carregar(); }} aoFechar={() => setPainel('nada')} />
      )}
      {painel === 'estado' && (
        <MudarEstado partnerId={parceiro._id} proximos={proximos}
          aoGravar={() => { setPainel('nada'); carregar(); aoMudar(); }} aoFechar={() => setPainel('nada')} />
      )}
      {painel === 'carta' && (
        <EnviarCarta partnerId={parceiro._id} nome={parceiro.nome}
          aoEnviar={() => { setPainel('nada'); carregar(); aoMudar(); }} aoFechar={() => setPainel('nada')} />
      )}

      <LinhaDoTempo interaccoes={interaccoes} />
    </div>
  );
}

// ── linha do tempo ───────────────────────────────────────────────────────────

function LinhaDoTempo({ interaccoes }: { interaccoes: Interaccao[] }) {
  if (!interaccoes.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--yb-subtle)', margin: 0, lineHeight: 1.6 }}>
        Nada registado ainda. Cada chamada, email ou reunião que ficar escrita aqui é uma
        que a próxima pessoa não vai repetir.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {interaccoes.map((i, n) => (
        <div key={i._id} style={{
          display: 'flex', gap: 11, padding: '10px 0',
          borderTop: n ? '1px solid var(--yb-border)' : 'none',
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
            background: i.email?.enviado === false ? 'rgba(248,113,113,0.15)' : 'var(--yb-input)',
            border: `1px solid ${i.email?.enviado === false ? 'rgba(248,113,113,0.4)' : 'var(--yb-border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'var(--yb-subtle)', fontFamily: 'ui-monospace, monospace',
          }}>{ICONE[i.tipo] ?? '—'}</span>

          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 12.5, color: 'var(--yb-fg)', margin: 0, lineHeight: 1.55 }}>
              {i.resumo}
            </p>
            <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '2px 0 0' }}>
              {ROTULO_TIPO[i.tipo] ?? i.tipo} · {new Date(i.em).toLocaleString('pt-PT')} · {i.actor}
              {i.email && (
                <>
                  {' · '}para {i.email.para}
                  {' · '}texto {i.email.versao}
                  {i.email.enviado === false && (
                    <span style={{ color: '#f87171', fontWeight: 700 }}> · NÃO SAIU</span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── registar um contacto ─────────────────────────────────────────────────────

function RegistarContacto({ partnerId, aoGravar, aoFechar }: {
  partnerId: string; aoGravar: () => void; aoFechar: () => void;
}) {
  const [tipo, setTipo] = useState('chamada');
  const [resumo, setResumo] = useState('');
  const [erro, setErro] = useState('');
  const [aGravar, setAGravar] = useState(false);

  async function gravar() {
    setErro('');
    if (!resumo.trim()) { setErro('escreva o que aconteceu'); return; }
    setAGravar(true);
    const r = await fetch(`/api/crm/parceiros/${partnerId}/interaccoes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, resumo }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) aoGravar(); else setErro(r?.error ?? 'não foi possível gravar');
  }

  return (
    <Painel titulo="Registar contacto" aoFechar={aoFechar}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['chamada', 'reuniao', 'email', 'nota'] as const).map((t) => (
          <button key={t} onClick={() => setTipo(t)} style={{
            ...BOTAO(tipo === t ? 'primario' : 'neutro'), padding: '5px 12px', fontSize: 11,
          }}>{ROTULO_TIPO[t]}</button>
        ))}
      </div>
      <textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={2} maxLength={2000}
        placeholder="o que aconteceu? ex.: falei com o Sr. Ricardo, pediu para enviar por escrito"
        style={{ ...CAMPO, resize: 'vertical' }} />
      {erro && <p style={{ fontSize: 11, color: 'var(--yb-error)', margin: '7px 0 0' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={gravar} disabled={aGravar} style={{ ...BOTAO('primario'), opacity: aGravar ? 0.5 : 1 }}>
          {aGravar ? 'a gravar...' : 'Gravar'}
        </button>
      </div>
    </Painel>
  );
}

// ── mudar de estado ──────────────────────────────────────────────────────────

function MudarEstado({ partnerId, proximos, aoGravar, aoFechar }: {
  partnerId: string; proximos: Proximo[]; aoGravar: () => void; aoFechar: () => void;
}) {
  const [estado, setEstado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [aGravar, setAGravar] = useState(false);
  const escolhido = proximos.find((p) => p.id === estado);

  async function gravar() {
    setErro('');
    if (!estado) { setErro('escolha o estado'); return; }
    setAGravar(true);
    const r = await fetch(`/api/crm/parceiros/${partnerId}/estado`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, motivo }),
    }).then((x) => x.json()).catch(() => null);
    setAGravar(false);
    if (r?.success) aoGravar(); else setErro(r?.error ?? 'não foi possível mudar');
  }

  return (
    <Painel titulo="Mudar estado" aoFechar={aoFechar}>
      <div style={{ display: 'grid', gap: 6 }}>
        {proximos.map((p) => (
          <label key={p.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name={`estado-${partnerId}`} checked={estado === p.id}
              onChange={() => setEstado(p.id)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 12.5, color: 'var(--yb-fg)' }}>{p.label}</span>
              <span style={{ fontSize: 11, color: 'var(--yb-subtle)', display: 'block', lineHeight: 1.5 }}>{p.nota}</span>
            </span>
          </label>
        ))}
      </div>

      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500}
        placeholder="porquê? fica no histórico"
        style={{ ...CAMPO, marginTop: 10, resize: 'vertical' }} />
      <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '4px 0 0', lineHeight: 1.45 }}>
        {escolhido && ['descartado', 'opos_se'].includes(escolhido.id)
          ? 'Para sair do funil o motivo tem de ser explícito — um "não" de três letras é indistinguível de um engano daqui a seis meses.'
          : 'Nada muda de estado sem motivo escrito.'}
      </p>

      {erro && <p style={{ fontSize: 11, color: 'var(--yb-error)', margin: '8px 0 0' }}>{erro}</p>}
      <div style={{ marginTop: 10 }}>
        <button onClick={gravar} disabled={aGravar} style={{ ...BOTAO('primario'), opacity: aGravar ? 0.5 : 1 }}>
          {aGravar ? 'a gravar...' : 'Mudar'}
        </button>
      </div>
    </Painel>
  );
}

// ── enviar a carta ───────────────────────────────────────────────────────────

function EnviarCarta({ partnerId, nome, aoEnviar, aoFechar }: {
  partnerId: string; nome: string; aoEnviar: () => void; aoFechar: () => void;
}) {
  const [dados, setDados] = useState<{ cartas: Carta[]; enderecos: string[]; podeEnviar: boolean } | null>(null);
  const [carta, setCarta] = useState('');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [para, setPara] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [feito, setFeito] = useState('');

  useEffect(() => {
    fetch(`/api/crm/parceiros/${partnerId}/apresentacao`, { cache: 'no-store' })
      .then((x) => x.json())
      .then((r) => {
        if (!r?.success) return;
        setDados(r);
        setPara(r.enderecos[0] ?? '');
      })
      .catch(() => {});
  }, [partnerId]);

  const escolhida = useMemo(() => dados?.cartas.find((c) => c.id === carta), [dados, carta]);

  function escolher(id: string) {
    setCarta(id);
    const c = dados?.cartas.find((x) => x.id === id);
    const v: Record<string, string> = {};
    for (const campo of c?.campos ?? []) v[campo.id] = '';
    setValores(v);
  }

  const url = useMemo(() => {
    if (!escolhida) return '';
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(valores)) if (v.trim()) q.set(k, v);
    const s = q.toString();
    return `/api/crm/emails/apresentacao_${escolhida.id}/preview${s ? `?${s}` : ''}`;
  }, [escolhida, valores]);

  async function enviar() {
    setErro('');
    if (!para.trim()) { setErro('para que endereço?'); return; }
    setAEnviar(true);
    const r = await fetch(`/api/crm/parceiros/${partnerId}/apresentacao`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variante: escolhida!.id, valores, para, motivo }),
    }).then((x) => x.json()).catch(() => null);
    setAEnviar(false);
    if (r?.success) { setFeito(`Enviada para ${r.para}.`); setTimeout(aoEnviar, 1400); }
    else setErro(r?.error ?? 'não foi possível enviar');
  }

  if (!dados) return <Painel titulo="Enviar carta" aoFechar={aoFechar}><p style={{ fontSize: 12, color: 'var(--yb-subtle)' }}>a carregar...</p></Painel>;
  if (!dados.podeEnviar) {
    return (
      <Painel titulo="Enviar carta" aoFechar={aoFechar}>
        <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>
          Esta empresa pediu para não receber mais contactos. Não há forma de enviar.
        </p>
      </Painel>
    );
  }

  return (
    <Painel titulo={`Enviar carta a ${nome}`} aoFechar={aoFechar}>
      {feito ? (
        <p style={{ fontSize: 13, color: '#22c55e', margin: 0 }}>{feito}</p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {dados.cartas.map((c) => (
              <label key={c.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name={`carta-${partnerId}`} checked={carta === c.id}
                  onChange={() => escolher(c.id)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontSize: 12.5, color: 'var(--yb-fg)', fontWeight: 600 }}>{c.nome}</span>
                  <span style={{ fontSize: 11, color: 'var(--yb-subtle)', display: 'block', lineHeight: 1.5 }}>{c.quando}</span>
                </span>
              </label>
            ))}
          </div>

          {escolhida && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
                {escolhida.campos.map((c) => (
                  <div key={c.id}>
                    <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 }}>
                      {c.label}{!c.obrigatorio && <span style={{ color: 'var(--yb-subtle)' }}> (opcional)</span>}
                    </label>
                    <input style={CAMPO} type={c.tipo === 'numero' ? 'number' : 'text'}
                      placeholder={c.exemplo} value={valores[c.id] ?? ''}
                      onChange={(e) => setValores({ ...valores, [c.id]: e.target.value })} />
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 }}>
                    Para
                  </label>
                  <input style={CAMPO} value={para} onChange={(e) => setPara(e.target.value)}
                    list={`ends-${partnerId}`} placeholder="endereco@empresa.pt" />
                  <datalist id={`ends-${partnerId}`}>
                    {dados.enderecos.map((e) => <option key={e} value={e} />)}
                  </datalist>
                  <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '3px 0 0', lineHeight: 1.45 }}>
                    Pode ser outro endereço. Um novo fica guardado como contacto da ficha.
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--yb-muted)', display: 'block', marginBottom: 3 }}>
                    Motivo do reenvio
                  </label>
                  <input style={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="ex.: o gerente estava de férias, pediram para reenviar" />
                  <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '3px 0 0', lineHeight: 1.45 }}>
                    Só no segundo envio em diante. É o que explica, daqui a meses, porque é
                    que esta empresa levou três emails.
                  </p>
                </div>
              </div>

              <div style={{
                marginTop: 12, border: '1px solid var(--yb-border)', borderRadius: 9,
                overflow: 'hidden', background: '#f4f6f7',
              }}>
                <iframe key={url} src={url} title="A carta como vai sair"
                  style={{ display: 'block', width: '100%', height: 380, border: 0 }} />
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--yb-subtle)', margin: '5px 0 0' }}>
                É exactamente isto que vai ser enviado.
              </p>

              {erro && <p style={{ fontSize: 11.5, color: 'var(--yb-error)', margin: '9px 0 0' }}>{erro}</p>}
              <div style={{ marginTop: 11 }}>
                <button onClick={enviar} disabled={aEnviar} style={{ ...BOTAO('primario'), opacity: aEnviar ? 0.5 : 1 }}>
                  {aEnviar ? 'a enviar...' : 'Enviar'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Painel>
  );
}

// ── moldura comum dos painéis ────────────────────────────────────────────────

function Painel({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--yb-input)', border: '1px solid var(--yb-border)',
      borderRadius: 10, padding: '12px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 9 }}>
        <p style={{ ...TITULO, marginBottom: 0 }}>{titulo}</p>
        <button onClick={aoFechar} style={{
          marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 11, color: 'var(--yb-subtle)',
        }}>fechar</button>
      </div>
      {children}
    </div>
  );
}
