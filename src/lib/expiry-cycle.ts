import { parseVehicleDateLiteral } from "@/lib/dates";
import {
  computeDaysUntil,
  inferNextVerificationDate,
} from "@/lib/mx-rules";
import { isMotoVehicle } from "@/lib/no-circula";
import type { Vehicle } from "@/lib/types";

const TENENCIA_MONTH = 3;
const TENENCIA_DAY = 31;

function isoFromParts(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function mexicoCityYear(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
  }).formatToParts(now);
  return Number(parts.find((part) => part.type === "year")?.value);
}

/** Same month/day, advanced year by year until the date is today or later. */
export function nextAnnualOccurrence(
  isoDate: string,
  now = new Date(),
): string | null {
  const parsed = parseVehicleDateLiteral(isoDate);
  if (!parsed) return null;
  const [yearRaw, monthRaw, dayRaw] = parsed.split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) return null;

  let year = yearRaw;
  for (let i = 0; i < 12; i += 1) {
    const iso = isoFromParts(year, monthRaw, dayRaw);
    const days = computeDaysUntil(iso);
    if (Number.isFinite(days) && days >= 0) return iso;
    year += 1;
  }
  return isoFromParts(year, monthRaw, dayRaw);
}

export function inferNextTenenciaDate(now = new Date()): string {
  return (
    nextAnnualOccurrence(
      isoFromParts(mexicoCityYear(now), TENENCIA_MONTH, TENENCIA_DAY),
      now,
    ) ?? isoFromParts(mexicoCityYear(now) + 1, TENENCIA_MONTH, TENENCIA_DAY)
  );
}

export function resolveVerificationDate(
  vehicle: Pick<Vehicle, "plate" | "state" | "verificationDate" | "vehicleType" | "alias" | "brand">,
  now = new Date(),
): string | undefined {
  if (isMotoVehicle(vehicle)) return undefined;
  const inferred =
    inferNextVerificationDate(vehicle.plate, vehicle.state, now) ?? undefined;
  const stored = parseVehicleDateLiteral(vehicle.verificationDate);
  if (!stored) return inferred;
  const days = computeDaysUntil(stored);
  if (Number.isFinite(days) && days >= 0) return stored;
  return inferred ?? nextAnnualOccurrence(stored, now) ?? undefined;
}

export function resolveTenenciaDate(
  stored: string | undefined,
  now = new Date(),
): string | undefined {
  const iso = parseVehicleDateLiteral(stored);
  if (!iso) return inferNextTenenciaDate(now);
  const days = computeDaysUntil(iso);
  if (Number.isFinite(days) && days >= 0) return iso;
  return nextAnnualOccurrence(iso, now) ?? inferNextTenenciaDate(now);
}

export function resolveRefrendoDate(
  stored: string | undefined,
  now = new Date(),
): string | undefined {
  const iso = parseVehicleDateLiteral(stored);
  if (!iso) return undefined;
  const days = computeDaysUntil(iso);
  if (Number.isFinite(days) && days >= 0) return iso;
  return nextAnnualOccurrence(iso, now) ?? undefined;
}

export function buildExpiryRolloverPatch(
  vehicle: Vehicle,
  now = new Date(),
): Partial<Vehicle> {
  const patch: Partial<Vehicle> = {};

  if (isMotoVehicle(vehicle)) {
    if (vehicle.verificationDate) patch.verificationDate = undefined;
  } else {
    const verificationDate = resolveVerificationDate(vehicle, now);
    if (verificationDate && verificationDate !== vehicle.verificationDate) {
      patch.verificationDate = verificationDate;
    }
  }

  const tenenciaDate = resolveTenenciaDate(vehicle.tenenciaDate, now);
  if (tenenciaDate && tenenciaDate !== vehicle.tenenciaDate) {
    patch.tenenciaDate = tenenciaDate;
  }

  if (vehicle.refrendoDate) {
    const refrendoDate = resolveRefrendoDate(vehicle.refrendoDate, now);
    if (refrendoDate && refrendoDate !== vehicle.refrendoDate) {
      patch.refrendoDate = refrendoDate;
    }
  }

  return patch;
}
