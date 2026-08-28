export type VerificationWindow = {
  startMonth: number;
  endMonth: number;
  label: string;
};

/** CDMX / EdoMex windows by last plate digit. Months are 1–12. */
export const VERIFICATION_WINDOWS: Record<
  string,
  Record<string, VerificationWindow>
> = {
  CDMX: {
    "5": { startMonth: 1, endMonth: 1, label: "enero" },
    "6": { startMonth: 1, endMonth: 1, label: "enero" },
    "7": { startMonth: 2, endMonth: 2, label: "febrero" },
    "8": { startMonth: 2, endMonth: 2, label: "febrero" },
    "3": { startMonth: 3, endMonth: 4, label: "marzo–abril" },
    "4": { startMonth: 3, endMonth: 4, label: "marzo–abril" },
    "1": { startMonth: 5, endMonth: 6, label: "mayo–junio" },
    "2": { startMonth: 5, endMonth: 6, label: "mayo–junio" },
    "0": { startMonth: 7, endMonth: 8, label: "julio–agosto" },
    "9": { startMonth: 7, endMonth: 8, label: "julio–agosto" },
  },
  EDOMEX: {
    "5": { startMonth: 1, endMonth: 2, label: "enero–febrero" },
    "6": { startMonth: 1, endMonth: 2, label: "enero–febrero" },
    "7": { startMonth: 3, endMonth: 4, label: "marzo–abril" },
    "8": { startMonth: 3, endMonth: 4, label: "marzo–abril" },
    "3": { startMonth: 5, endMonth: 6, label: "mayo–junio" },
    "4": { startMonth: 5, endMonth: 6, label: "mayo–junio" },
    "1": { startMonth: 7, endMonth: 8, label: "julio–agosto" },
    "2": { startMonth: 7, endMonth: 8, label: "julio–agosto" },
    "9": { startMonth: 9, endMonth: 10, label: "septiembre–octubre" },
    "0": { startMonth: 9, endMonth: 10, label: "septiembre–octubre" },
  },
};

export type VerificationPeriod = {
  year: number;
  startMonth: number;
  endMonth: number;
  startIso: string;
  endIso: string;
  label: string;
  state: string;
  digit: string;
};

function getPlateLastDigit(plate: string): string {
  const cleaned = plate.replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.slice(-1);
}

function lastDayOfMonthIso(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function firstDayOfMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function mexicoCityYmd(now = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const num = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day") };
}

export function getVerificationWindow(
  plate: string | undefined,
  stateCode: string | undefined,
): { state: string; digit: string; window: VerificationWindow } | null {
  if (!plate) return null;
  const state = (stateCode || "").toUpperCase();
  const digit = getPlateLastDigit(plate);
  if (!digit) return null;
  const window = VERIFICATION_WINDOWS[state]?.[digit];
  if (!window) return null;
  return { state, digit, window };
}

export function periodForYear(
  year: number,
  window: VerificationWindow,
  state: string,
  digit: string,
): VerificationPeriod {
  return {
    year,
    startMonth: window.startMonth,
    endMonth: window.endMonth,
    startIso: firstDayOfMonthIso(year, window.startMonth),
    endIso: lastDayOfMonthIso(year, window.endMonth),
    label: window.label,
    state,
    digit,
  };
}

/** Current or next verification window. Does not invent a citation date. */
export function inferNextVerificationPeriod(
  plate: string | undefined,
  stateCode: string | undefined,
  now = new Date(),
): VerificationPeriod | null {
  const found = getVerificationWindow(plate, stateCode);
  if (!found) return null;
  const today = mexicoCityYmd(now);
  let year = today.year;
  const thisYear = periodForYear(year, found.window, found.state, found.digit);
  const [, endM, endD] = thisYear.endIso.split("-").map(Number);
  if (today.month > endM || (today.month === endM && today.day > endD)) {
    year += 1;
  }
  return periodForYear(year, found.window, found.state, found.digit);
}

/** @deprecated Prefer inferNextVerificationPeriod; last day is only the window end. */
export function inferNextVerificationDate(
  plate: string | undefined,
  stateCode: string | undefined,
  now = new Date(),
): string | null {
  return inferNextVerificationPeriod(plate, stateCode, now)?.endIso ?? null;
}

export type VerificationPeriodPhase =
  | "opens"
  | "mid"
  | "last_month"
  | "due"
  | "overdue";

export function verificationPeriodPhase(
  period: VerificationPeriod,
  now = new Date(),
): VerificationPeriodPhase | null {
  const today = mexicoCityYmd(now);
  if (today.year < period.year) return null;

  const endDay = Number(period.endIso.slice(-2));
  const afterEnd =
    today.year > period.year ||
    today.month > period.endMonth ||
    (today.month === period.endMonth && today.day > endDay);

  if (afterEnd) {
    const isNextDay =
      today.year === period.year &&
      today.month === period.endMonth &&
      today.day === endDay + 1;
    const isFirstOfNextMonth =
      period.endMonth === 12
        ? today.year === period.year + 1 && today.month === 1 && today.day === 1
        : today.year === period.year &&
          today.month === period.endMonth + 1 &&
          today.day === 1;
    return isNextDay || isFirstOfNextMonth ? "overdue" : null;
  }

  if (today.year !== period.year) return null;
  if (today.month < period.startMonth) return null;
  if (today.month === period.endMonth) {
    if (today.day === endDay) return "due";
    if (today.day === 1) return "last_month";
    return null;
  }
  if (today.month === period.startMonth && today.day === 1) return "opens";
  const span = period.endMonth - period.startMonth;
  if (span >= 1) {
    const midMonth = period.startMonth + Math.floor(span / 2);
    if (today.month === midMonth && today.day === 15) return "mid";
  }
  return null;
}

export function formatVerificationPeriodLabel(period: VerificationPeriod): string {
  const monthNames: Record<number, string> = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
  };
  if (period.startMonth === period.endMonth) {
    return `${monthNames[period.startMonth]} ${period.year}`;
  }
  return `${monthNames[period.startMonth]}–${monthNames[period.endMonth]} ${period.year}`;
}
