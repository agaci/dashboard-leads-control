// ============================================================================
// Formatação do CSV de conversões offline do Google Ads.
//
// Isolado numa unidade pura porque é a parte mais frágil de todo o fluxo: o Google
// rejeita o ficheiro inteiro por um cabeçalho trocado ou uma data mal formatada, e
// o erro só aparece horas depois na consola. Testes em lib/conversions/csv.test.ts.
//
// Referência: Ferramentas > Conversões > Importações > "Conversões de cliques".
// ============================================================================

export const CONVERSION_TIMEZONE = 'Europe/Lisbon';

/** Que identificador de clique este ficheiro transporta. */
export type ClickIdKind = 'gclid' | 'wbraid' | 'gbraid';

// O Google exige uma coluna diferente por tipo de identificador — não se podem
// misturar gclid e wbraid no mesmo ficheiro.
const ID_COLUMN: Record<ClickIdKind, string> = {
  gclid: 'Google Click ID',
  wbraid: 'WBRAID',
  gbraid: 'GBRAID',
};

export type ConversionRow = {
  /** O identificador de clique, do tipo declarado no ficheiro. */
  clickId: string;
  /** Nome EXACTO da acção de conversão no Google Ads. */
  conversionName: string;
  /** Momento da conversão (criação da lead). */
  conversionTime: Date;
  /** Valor monetário; 0 é aceite. */
  value: number;
  currency: string;
};

/**
 * Data no formato que o Google exige — `yyyy-MM-dd HH:mm:ss` — expressa na
 * timezone declarada no cabeçalho do ficheiro.
 *
 * Feito com Intl em vez de aritmética de offsets para que a mudança de hora de
 * Verão fique certa sem tabelas próprias.
 */
export function formatConversionTime(d: Date, timeZone = CONVERSION_TIMEZONE): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) throw new Error('Data de conversão inválida');

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // hourCycle h23 pode devolver "24" à meia-noite em alguns runtimes.
  const hour = get('hour') === '24' ? '00' : get('hour');

  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}

/** Escape CSV: aspas duplicadas e envolvidas quando o valor tem vírgula, aspas ou newline. */
export function csvCell(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Garante que a conversão é posterior ao clique. O Google rejeita a linha se não
 * for, e isso acontece na prática quando o relógio do browser está adiantado
 * (o `clickedAt` vem do cookie, escrito do lado do cliente no fallback JS).
 *
 * Empurra um minuto para a frente em vez de descartar a linha — a alternativa é
 * perder uma conversão real por causa de um relógio mal acertado.
 */
export function ensureAfterClick(conversionTime: Date, clickedAt: Date | null | undefined): Date {
  if (!clickedAt || isNaN(clickedAt.getTime())) return conversionTime;
  if (conversionTime.getTime() > clickedAt.getTime()) return conversionTime;
  return new Date(clickedAt.getTime() + 60_000);
}

/**
 * Constrói o ficheiro completo. As duas primeiras linhas são literais e têm de
 * sair exactamente assim.
 */
export function buildConversionsCsv(
  rows: ConversionRow[],
  opts: { kind?: ClickIdKind; timeZone?: string } = {},
): string {
  const kind = opts.kind ?? 'gclid';
  const timeZone = opts.timeZone ?? CONVERSION_TIMEZONE;

  const lines: string[] = [
    `Parameters:TimeZone=${timeZone}`,
    [ID_COLUMN[kind], 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency'].join(','),
  ];

  for (const r of rows) {
    lines.push([
      csvCell(r.clickId),
      csvCell(r.conversionName),
      csvCell(formatConversionTime(r.conversionTime, timeZone)),
      csvCell(Number.isFinite(r.value) ? r.value.toFixed(2) : '0.00'),
      csvCell(r.currency || 'EUR'),
    ].join(','));
  }

  // O Google tolera ambos os finais de linha; \r\n é o que o Sheets exporta.
  return lines.join('\r\n') + '\r\n';
}
