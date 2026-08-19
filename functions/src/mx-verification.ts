const VERIFICATION_END_MONTH: Record<string, Record<string, number>> = {
  CDMX: {
    "5": 1,
    "6": 1,
    "7": 2,
    "8": 2,
    "3": 4,
    "4": 4,
    "1": 6,
    "2": 6,
    "0": 8,
    "9": 8,
  },
  EDOMEX: {
    "5": 2,
    "6": 2,
    "7": 4,
    "8": 4,
    "3": 6,
    "4": 6,
    "1": 8,
    "2": 8,
    "9": 10,
    "0": 10,
  },
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

function mexicoCityYmd(now = new Date()): { year: number; month: number; day: number } {
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

/** Next verification-window end date from plate + CDMX/EdoMex calendar. */
export function inferNextVerificationDate(
  plate: string | undefined,
  stateCode: string | undefined,
  now = new Date(),
): string | null {
  if (!plate) return null;
  const state = (stateCode || "CDMX").toUpperCase();
  const digit = getPlateLastDigit(plate);
  if (!digit) return null;
  const endMonth = VERIFICATION_END_MONTH[state]?.[digit];
  if (!endMonth) return null;

  const today = mexicoCityYmd(now);
  let year = today.year;
  const thisYearEnd = lastDayOfMonthIso(year, endMonth);
  const [, endM, endD] = thisYearEnd.split("-").map(Number);
  if (today.month > endM || (today.month === endM && today.day > endD)) {
    year += 1;
  }
  return lastDayOfMonthIso(year, endMonth);
}
