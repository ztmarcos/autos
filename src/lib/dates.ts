const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T\s]/;
const MX_SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const MX_DASH_DATE = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/;
const MX_DOT_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
const MX_COMPACT_DATE = /^(\d{2})(\d{2})(\d{4})$/;
const MX_TEXT_MONTH_DATE =
  /^(\d{1,2})[\s/.-]+([a-záéíóúñ]+)[\s/.-]+(\d{2,4})$/i;
const MX_TEXT_MONTH_DE_DATE =
  /^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\s+(?:de\s+)?(\d{2,4})$/i;

const SPANISH_MONTHS: Record<string, string> = {
  ene: "01",
  enero: "01",
  feb: "02",
  febrero: "02",
  mar: "03",
  marzo: "03",
  abr: "04",
  abril: "04",
  may: "05",
  mayo: "05",
  jun: "06",
  junio: "06",
  jul: "07",
  julio: "07",
  ago: "08",
  agosto: "08",
  sep: "09",
  sept: "09",
  septiembre: "09",
  setiembre: "09",
  oct: "10",
  octubre: "10",
  nov: "11",
  noviembre: "11",
  dic: "12",
  diciembre: "12",
};

function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function toIsoDate(year: string, month: string, day: string): string | undefined {
  const iso = `${normalizeYear(year)}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : undefined;
}

function normalizeYear(year: string): string {
  if (year.length === 2) {
    const n = parseInt(year, 10);
    return String(n >= 50 ? 1900 + n : 2000 + n);
  }
  return year;
}

function normalizeMonthToken(token: string): string | undefined {
  const key = token
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return SPANISH_MONTHS[key];
}

function stripTimeComponent(raw: string): string {
  return raw
    .replace(
      /\s+[Tt]?\d{1,2}:\d{2}(:\d{2})?(\s*(hrs?|h|am|pm|a\.?\s*m\.?|p\.?\s*m\.?))?.*$/i,
      "",
    )
    .trim();
}

function parseDayMonthYear(
  day: string,
  month: string,
  year: string,
): string | undefined {
  const monthNum = /^\d{1,2}$/.test(month)
    ? month
    : normalizeMonthToken(month);
  if (!monthNum) return undefined;
  return toIsoDate(year, monthNum, day);
}

function parseTextMonthDate(raw: string): string | undefined {
  const deMatch = raw.match(MX_TEXT_MONTH_DE_DATE);
  if (deMatch) {
    const [, day, month, year] = deMatch;
    return parseDayMonthYear(day, month, year);
  }

  const match = raw.match(MX_TEXT_MONTH_DATE);
  if (match) {
    const [, day, month, year] = match;
    return parseDayMonthYear(day, month, year);
  }

  return undefined;
}

/**
 * Normaliza fechas de vehículo a YYYY-MM-DD.
 * Acepta ISO, DD/MM/YYYY, DDMMAAAA, mes en texto (abr, abril) y hora (12:00).
 */
export function parseVehicleDateLiteral(
  value: string | number | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  let raw = String(value).trim();
  if (!raw || raw === "Invalid Date") return undefined;

  const isoDateTime = raw.match(ISO_DATE_TIME);
  if (isoDateTime) {
    return isValidIsoDate(isoDateTime[1]) ? isoDateTime[1] : undefined;
  }

  if (ISO_DATE.test(raw)) {
    return isValidIsoDate(raw) ? raw : undefined;
  }

  raw = stripTimeComponent(raw);

  const slash = raw.match(MX_SLASH_DATE);
  if (slash) {
    const [, day, month, year] = slash;
    return parseDayMonthYear(day, month, year);
  }

  const dash = raw.match(MX_DASH_DATE);
  if (dash) {
    const [, day, month, year] = dash;
    return parseDayMonthYear(day, month, year);
  }

  const dot = raw.match(MX_DOT_DATE);
  if (dot) {
    const [, day, month, year] = dot;
    return parseDayMonthYear(day, month, year);
  }

  const compact = raw.match(MX_COMPACT_DATE);
  if (compact) {
    const [, day, month, year] = compact;
    return parseDayMonthYear(day, month, year);
  }

  return parseTextMonthDate(raw);
}
