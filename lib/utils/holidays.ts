// Utilitários de feriados nacionais portugueses

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Algoritmo de Gregorius anónimo (preciso para qualquer ano)
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getPortugueseHolidays(year: number): Date[] {
  const easter = easterDate(year);
  return [
    new Date(year, 0, 1),    // Ano Novo
    new Date(year, 3, 25),   // Liberdade
    new Date(year, 4, 1),    // Trabalhador
    new Date(year, 5, 10),   // Portugal
    new Date(year, 7, 15),   // Assunção
    new Date(year, 9, 5),    // República
    new Date(year, 10, 1),   // Todos os Santos
    new Date(year, 11, 1),   // Restauração
    new Date(year, 11, 8),   // Imaculada Conceição
    new Date(year, 11, 25),  // Natal
    addDays(easter, -47),    // Carnaval (Terça-feira)
    addDays(easter, -2),     // Sexta-feira Santa
    easter,                  // Domingo de Páscoa
    addDays(easter, 60),     // Corpo de Deus
  ];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function getLisbonNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
}

export function isPortugueseHoliday(date: Date): boolean {
  return getPortugueseHolidays(date.getFullYear()).some(h => isSameDay(h, date));
}

export function isNonWorkingDay(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6 || isPortugueseHoliday(date);
}

// Primeiro dia útil APÓS a data fornecida
export function getNextWorkingDay(from: Date): Date {
  const next = addDays(from, 1);
  while (isNonWorkingDay(next)) next.setDate(next.getDate() + 1);
  return next;
}

export type OohInfo = { multiplier: number; note: string | null };

// Calcula suplemento OOH para serviços directos (1h/4h)
// ooh = settings.outOfHoursFees do documento do calculator na BD
export function getOohInfo(date: Date, ooh: any): OohInfo {
  if (isPortugueseHoliday(date)) {
    const pct: number = ooh?.flatRateHolidays ?? ooh?.flatRateSundays ?? 30;
    return { multiplier: 1 + pct / 100, note: `Suplemento de feriado nacional incluído (+${pct}%)` };
  }
  const dow = date.getDay();
  if (dow === 6) {
    const pct: number = ooh?.flatRateSaturdays ?? 30;
    return { multiplier: 1 + pct / 100, note: `Suplemento de sábado incluído (+${pct}%)` };
  }
  if (dow === 0) {
    const pct: number = ooh?.flatRateSundays ?? 30;
    return { multiplier: 1 + pct / 100, note: `Suplemento de domingo incluído (+${pct}%)` };
  }
  return { multiplier: 1, note: null };
}

const WEEKDAYS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function formatWeekdayPT(date: Date): string {
  return WEEKDAYS_PT[date.getDay()];
}

// Cabeçalho e nota de prazo para preço 24h — partilhado por ambas as rotas
export function build24hPriceHeader(kg: number): { header: string; cutoffNote: string } {
  const now = getLisbonNow();
  const afterCutoff = now.getHours() >= 16;

  // Dia não útil hoje (fim-de-semana ou feriado)
  if (isNonWorkingDay(now)) {
    const collectionDay = getNextWorkingDay(now);
    const deliveryDay = getNextWorkingDay(collectionDay);
    const reason = isPortugueseHoliday(now) ? 'hoje é feriado nacional' : 'é fim de semana';
    return {
      header: `*Entrega YourBox — ${formatWeekdayPT(deliveryDay)} — ${kg} kg*`,
      cutoffNote: `\n\n_Nota: como ${reason}, a recolha será na *${formatWeekdayPT(collectionDay)}*, com entrega na *${formatWeekdayPT(deliveryDay)}*._`,
    };
  }

  // Dia útil antes do cutoff das 16h
  if (!afterCutoff) {
    const deliveryDay = getNextWorkingDay(now);
    if (isSameDay(deliveryDay, addDays(now, 1))) {
      // Amanhã é dia útil — entrega amanhã
      return {
        header: `*Entrega YourBox Amanhã — ${kg} kg*`,
        cutoffNote: `\n\n_Nota: confirme antes das *16h00* para garantir recolha hoje._`,
      };
    }
    // Amanhã é feriado/fim-de-semana — indicar dia exacto
    return {
      header: `*Entrega YourBox — ${formatWeekdayPT(deliveryDay)} — ${kg} kg*`,
      cutoffNote: `\n\n_Nota: confirme antes das *16h00* para garantir recolha hoje. Entrega na *${formatWeekdayPT(deliveryDay)}* (amanhã é dia não útil)._`,
    };
  }

  // Dia útil após o cutoff das 16h
  const collectionDay = getNextWorkingDay(now);
  const deliveryDay = getNextWorkingDay(collectionDay);
  const tomorrowWorking = isSameDay(collectionDay, addDays(now, 1));

  return {
    header: `*Entrega YourBox — ${formatWeekdayPT(deliveryDay)} — ${kg} kg*`,
    cutoffNote: tomorrowWorking
      ? `\n\n⚠️ *Atenção:* após as 16h00, a recolha hoje já não é possível. A carga ficará agendada para *amanhã de manhã*, com entrega na *${formatWeekdayPT(deliveryDay)}*.`
      : `\n\n⚠️ *Atenção:* após as 16h00 e com amanhã a ser dia não útil, a recolha será na *${formatWeekdayPT(collectionDay)}*, com entrega na *${formatWeekdayPT(deliveryDay)}*.`,
  };
}
