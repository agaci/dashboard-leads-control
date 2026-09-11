'use client';

import { useMemo, useState } from 'react';
import { DISTRITOS_MAPA, MAPA_ALTURA, MAPA_LARGURA } from '@/lib/crm/mapa-distritos';
import { degrau } from '@/lib/crm/escala';

/**
 * Portugal por distritos, pintado por um valor e clicável para filtrar.
 *
 * As fronteiras são as da CAOP (ver lib/crm/mapa-distritos.ts) e cruzam-se com as zonas
 * dos parceiros pelo `id`, que é o mesmo slug de lib/crm/zonas.ts.
 *
 * **O zero não é a cor mais clara da escala — é outra coisa.** Um distrito sem ninguém é
 * precisamente o que interessa ver, e se fosse só "um tom abaixo de um" perdia-se entre
 * os fracos. Fica riscado: lê-se como buraco e não como pouco.
 *
 * **Sem números no desenho.** Dezoito rótulos a esta largura sobrepõem-se uns aos outros
 * e nenhum se lê. O valor aparece na tira por baixo, ao passar por cima ou ao tocar —
 * que funciona igual no telemóvel, onde não há "passar por cima".
 *
 * Açores e Madeira não vêm na carta continental e desenham-se em caixa à parte, como em
 * qualquer mapa do país. São clicáveis na mesma: um parceiro que sirva as ilhas tem de
 * poder ser encontrado.
 */

export type ModoMapa = 'cobertura' | 'procura';

const ILHAS = [
  { id: 'acores', nome: 'Açores' },
  { id: 'madeira', nome: 'Madeira' },
];

/**
 * Os cinco tons de cada modo. O vazio trata-se à parte, fora da escala.
 *
 * A rampa começa alta de propósito. Sobre este fundo escuro, uma opacidade baixa
 * dissolve-se no cartão e o degrau mais fraco fica indistinguível do nada — que é
 * precisamente a distinção que este mapa existe para mostrar.
 */
const ESCALA: Record<ModoMapa, string[]> = {
  cobertura: [
    'rgba(34,197,220,0.22)', 'rgba(30,199,222,0.38)', 'rgba(24,201,224,0.54)',
    'rgba(16,203,226,0.70)', 'rgba(8,205,228,0.88)',
  ],
  procura: [
    'rgba(234,179,8,0.24)', 'rgba(240,150,20,0.42)', 'rgba(249,115,22,0.58)',
    'rgba(248,90,80,0.74)', 'rgba(248,80,80,0.92)',
  ],
};

const TRACO: Record<ModoMapa, string> = {
  cobertura: 'rgba(0,188,212,0.85)',
  procura: 'rgba(248,113,113,0.9)',
};

/** O centro aproximado de um distrito, para lá ancorar o número de quem está em foco. */
function centro(d: string): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const par of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
    sx += Number(par[1]);
    sy += Number(par[2]);
    n++;
  }
  return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

export default function MapaPortugal({
  valores, seleccionadas, aoClicar, modo = 'cobertura', unidade = 'parceiro', foraDoMapa = 0,
}: {
  valores: Record<string, number>;
  seleccionadas: string[];
  aoClicar: (zona: string) => void;
  modo?: ModoMapa;
  unidade?: string;
  /**
   * Quantos ficaram de fora por não se saber o distrito.
   *
   * Existe porque um mapa cala o que não consegue desenhar, e um total que não bate
   * certo com a realidade é pior do que não haver total nenhum: quem o lê decide com
   * ele. Se houver, diz-se.
   */
  foraDoMapa?: number;
}) {
  const [sobre, setSobre] = useState<string | null>(null);

  const centros = useMemo(
    () => Object.fromEntries(DISTRITOS_MAPA.map((d) => [d.id, centro(d.d)])),
    [],
  );

  const maximo = useMemo(() => Math.max(0, ...Object.values(valores ?? {})), [valores]);

  const escolhido = (id: string) => seleccionadas.includes(id);
  const valor = (id: string) => valores?.[id] ?? 0;

  function preencher(id: string): string {
    const g = degrau(valor(id), maximo);
    // Riscado e não apenas mais escuro: sobre um fundo escuro, "mais escuro" é o que o
    // olho lê como fundo. Um distrito sem ninguém tem de se ver à primeira, porque é a
    // única coisa neste mapa sobre a qual há uma decisão a tomar.
    return g < 0 ? 'url(#yb-vazio)' : ESCALA[modo][g];
  }

  function contorno(id: string): { stroke: string; largura: number; tracejado?: string } {
    if (escolhido(id)) return { stroke: TRACO[modo], largura: 1.6 };
    if (valor(id) <= 0) return { stroke: 'rgba(255,255,255,0.30)', largura: 0.7 };
    return { stroke: 'rgba(10,18,35,0.55)', largura: 0.7 };
  }

  // Em foco: o que está sob o rato, ou o único distrito escolhido. Com dois ou mais
  // escolhidos não há um "o" distrito, e a tira volta ao resumo.
  const activo = sobre ?? (seleccionadas.length === 1 ? seleccionadas[0] : null);

  const nomeDe = (id: string) => DISTRITOS_MAPA.find((d) => d.id === id)?.nome
    ?? ILHAS.find((i) => i.id === id)?.nome ?? id;

  const total = Object.values(valores ?? {}).reduce((s, v) => s + v, 0);
  const vazios = [...DISTRITOS_MAPA.map((d) => d.id), ...ILHAS.map((i) => i.id)]
    .filter((id) => valor(id) <= 0).length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${MAPA_LARGURA} ${MAPA_ALTURA + 74}`}
        style={{ width: '100%', maxWidth: 236, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Mapa de Portugal por distrito"
      >
        <defs>
          <pattern id="yb-vazio" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={5} height={5} fill="rgba(255,255,255,0.02)" />
            <line x1={0} y1={0} x2={0} y2={5} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
          </pattern>
        </defs>

        {DISTRITOS_MAPA.map((d) => {
          const c = contorno(d.id);
          return (
            <path
              key={d.id}
              d={d.d}
              fill={preencher(d.id)}
              stroke={c.stroke}
              strokeWidth={c.largura}
              strokeDasharray={c.tracejado}
              strokeLinejoin="round"
              onMouseEnter={() => setSobre(d.id)}
              onMouseLeave={() => setSobre(null)}
              onClick={() => aoClicar(d.id)}
              style={{
                cursor: 'pointer',
                transition: 'fill .12s',
                filter: sobre === d.id ? 'brightness(1.6)' : undefined,
              }}
            >
              <title>{`${d.nome} — ${valor(d.id)}`}</title>
            </path>
          );
        })}

        {activo && centros[activo] && (
          <text
            x={centros[activo].x}
            y={centros[activo].y}
            textAnchor="middle"
            dominantBaseline="middle"
            stroke="rgba(0,0,0,0.75)"
            strokeWidth={2.6}
            paintOrder="stroke"
            style={{ fontSize: 10, fontWeight: 700, fill: '#fff', pointerEvents: 'none' }}
          >
            {valor(activo)}
          </text>
        )}

        {/* As ilhas, em caixa. Sem geometria: à escala do país seriam dois pontos. */}
        <g transform={`translate(0 ${MAPA_ALTURA + 14})`}>
          {ILHAS.map((ilha, i) => {
            const c = contorno(ilha.id);
            const x = i * (MAPA_LARGURA / 2);
            return (
              <g
                key={ilha.id}
                onMouseEnter={() => setSobre(ilha.id)}
                onMouseLeave={() => setSobre(null)}
                onClick={() => aoClicar(ilha.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={x + 4}
                  y={0}
                  width={MAPA_LARGURA / 2 - 8}
                  height={42}
                  rx={7}
                  fill={preencher(ilha.id)}
                  stroke={c.stroke}
                  strokeWidth={c.largura}
                  strokeDasharray={c.tracejado}
                  style={{ filter: sobre === ilha.id ? 'brightness(1.6)' : undefined }}
                />
                <text
                  x={x + MAPA_LARGURA / 4}
                  y={16}
                  textAnchor="middle"
                  style={{ fontSize: 9, fill: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }}
                >
                  {ilha.nome}
                </text>
                <text
                  x={x + MAPA_LARGURA / 4}
                  y={33}
                  textAnchor="middle"
                  style={{ fontSize: 13, fontWeight: 700, fill: '#fff', pointerEvents: 'none' }}
                >
                  {valor(ilha.id)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* A tira de leitura. Fixa por baixo e não a flutuar: não se corta na margem do
          cartão e funciona igual ao toque, onde não existe "passar por cima". */}
      <div
        style={{
          marginTop: 10, minHeight: 36, borderTop: '1px solid var(--yb-border)',
          paddingTop: 8, fontSize: 11, color: 'var(--yb-muted)', lineHeight: 1.5,
        }}
      >
        {activo ? (
          <>
            <strong style={{ color: 'var(--yb-fg)' }}>{nomeDe(activo)}</strong>
            {' — '}
            {valor(activo)} {unidade}{valor(activo) === 1 ? '' : 's'}
            <span style={{ display: 'block', color: 'var(--yb-subtle)', fontSize: 10 }}>
              {escolhido(activo) ? 'clique outra vez para tirar o filtro' : 'clique para filtrar por este distrito'}
            </span>
          </>
        ) : (
          <>
            {total} {unidade}{total === 1 ? '' : 's'} no mapa
            {foraDoMapa > 0 && (
              <span style={{ display: 'block', color: 'var(--yb-aviso, #eab308)', fontSize: 10 }}>
                mais {foraDoMapa} sem distrito conhecido, que o mapa não mostra.
              </span>
            )}
            {vazios > 0 && (
              <span style={{ display: 'block', color: 'var(--yb-subtle)', fontSize: 10 }}>
                {vazios} distrito{vazios === 1 ? '' : 's'} riscado{vazios === 1 ? '' : 's'}: sem ninguém.
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
