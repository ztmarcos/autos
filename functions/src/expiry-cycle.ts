import { isMotoVehicle } from "./no-circula";

const TENENCIA_MONTH = 3;
const TENENCIA_DAY = 31;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function mexicoCityToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isoFromParts(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(ISO_DATE);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function daysUntilMexicoCity(isoDate: string, now = new Date()): number {
  const today = mexicoCityToday(now);
  const start = Date.parse(`${today}T00:00:00Z`);
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(target)) return Number.NaN;
  return Math.round((target - start) / (1000 * 60 * 60 * 24));
}

export function nextAnnualOccurrence(
  isoDate: string,
  now = new Date(),
): string | null {
  const parsed = normalizeIso(isoDate);
  if (!parsed) return null;
  const [yearRaw, monthRaw, dayRaw] = parsed.split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) return null;

  let year = yearRaw;
  for (let i = 0; i < 12; i += 1) {
    const iso = isoFromParts(year, monthRaw, dayRaw);
    const days = daysUntilMexicoCity(iso, now);
    if (Number.isFinite(days) && days >= 0) return iso;
    year += 1;
  }
  return isoFromParts(year, monthRaw, dayRaw);
}

export function inferNextTenenciaDate(now = new Date()): string {
  const year = Number(mexicoCityToday(now).slice(0, 4));
  return (
    nextAnnualOccurrence(isoFromParts(year, TENENCIA_MONTH, TENENCIA_DAY), now) ??
    isoFromParts(year + 1, TENENCIA_MONTH, TENENCIA_DAY)
  );
}

export function resolveVerificationDate(
  vehicle: {
    plate?: string;
    state?: string;
    verificationDate?: unknown;
    vehicleType?: unknown;
    alias?: unknown;
    brand?: unknown;
  },
): string | null {
  if (
    isMotoVehicle({
      vehicleType: typeof vehicle.vehicleType === "string" ? vehicle.vehicleType : undefined,
      alias: typeof vehicle.alias === "string" ? vehicle.alias : undefined,
      brand: typeof vehicle.brand === "string" ? vehicle.brand : undefined,
    })
  ) {
    return null;
  }

  return normalizeIso(vehicle.verificationDate);
}

export function resolveTenenciaDate(
  stored: unknown,
  now = new Date(),
): string | null {
  const iso = normalizeIso(stored);
  if (!iso) return inferNextTenenciaDate(now);
  const days = daysUntilMexicoCity(iso, now);
  if (Number.isFinite(days) && days >= 0) return iso;
  return nextAnnualOccurrence(iso, now) ?? inferNextTenenciaDate(now);
}

export function resolveRefrendoDate(
  stored: unknown,
  now = new Date(),
): string | null {
  const iso = normalizeIso(stored);
  if (!iso) return null;
  const days = daysUntilMexicoCity(iso, now);
  if (Number.isFinite(days) && days >= 0) return iso;
  return nextAnnualOccurrence(iso, now);
}

export function buildExpiryRolloverPatch(
  vehicle: Record<string, unknown>,
  now = new Date(),
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  const moto = isMotoVehicle({
    vehicleType: typeof vehicle.vehicleType === "string" ? vehicle.vehicleType : undefined,
    alias: typeof vehicle.alias === "string" ? vehicle.alias : undefined,
    brand: typeof vehicle.brand === "string" ? vehicle.brand : undefined,
  });

  if (moto) {
    if (vehicle.verificationDate) patch.verificationDate = null;
  }

  const tenenciaDate = resolveTenenciaDate(vehicle.tenenciaDate, now);
  if (tenenciaDate && tenenciaDate !== normalizeIso(vehicle.tenenciaDate)) {
    patch.tenenciaDate = tenenciaDate;
  }

  if (vehicle.refrendoDate) {
    const refrendoDate = resolveRefrendoDate(vehicle.refrendoDate, now);
    if (refrendoDate && refrendoDate !== normalizeIso(vehicle.refrendoDate)) {
      patch.refrendoDate = refrendoDate;
    }
  }

  return patch;
}

export function userHasOpenedApp(userData: Record<string, unknown>): boolean {
  return userData.appOpenedAt != null && userData.appOpenedAt !== "";
}
