import type { MxVehicleRule, UrgencyStatus } from "@/lib/types";
import { parseVehicleDateLiteral } from "@/lib/dates";

export const MX_STATES = [
  { code: "CDMX", name: "Ciudad de México" },
  { code: "EDOMEX", name: "Estado de México" },
  { code: "JAL", name: "Jalisco" },
  { code: "NL", name: "Nuevo León" },
  { code: "PUE", name: "Puebla" },
  { code: "AGS", name: "Aguascalientes" },
  { code: "BC", name: "Baja California" },
  { code: "BCS", name: "Baja California Sur" },
  { code: "CAMP", name: "Campeche" },
  { code: "CHIS", name: "Chiapas" },
  { code: "CHIH", name: "Chihuahua" },
  { code: "COAH", name: "Coahuila" },
  { code: "COL", name: "Colima" },
  { code: "DGO", name: "Durango" },
  { code: "GTO", name: "Guanajuato" },
  { code: "GRO", name: "Guerrero" },
  { code: "HGO", name: "Hidalgo" },
  { code: "MICH", name: "Michoacán" },
  { code: "MOR", name: "Morelos" },
  { code: "NAY", name: "Nayarit" },
  { code: "OAX", name: "Oaxaca" },
  { code: "QRO", name: "Querétaro" },
  { code: "QR", name: "Quintana Roo" },
  { code: "SLP", name: "San Luis Potosí" },
  { code: "SIN", name: "Sinaloa" },
  { code: "SON", name: "Sonora" },
  { code: "TAB", name: "Tabasco" },
  { code: "TAMPS", name: "Tamaulipas" },
  { code: "TLAX", name: "Tlaxcala" },
  { code: "VER", name: "Veracruz" },
  { code: "YUC", name: "Yucatán" },
  { code: "ZAC", name: "Zacatecas" },
] as const;

export function getStateName(stateCode: string): string {
  return MX_STATES.find((s) => s.code === stateCode)?.name ?? stateCode;
}

export const MX_RULES_SEED: MxVehicleRule[] = [
  {
    stateCode: "CDMX",
    stateName: "Ciudad de México",
    verificationSchedule: {
      "5,6": "enero",
      "7,8": "febrero",
      "3,4": "marzo–abril",
      "1,2": "mayo–junio",
      "0,9": "julio–agosto",
      "00,01,02,03,04,05,06,07,08,09": "consultar calendario",
    },
    tenenciaNote: "Tenencia eliminada para vehículos particulares. Aplica refrendo anual.",
    officialSourceUrl: "https://www.semovi.cdmx.gob.mx/",
    lastUpdated: "2026-01-01",
  },
  {
    stateCode: "EDOMEX",
    stateName: "Estado de México",
    verificationSchedule: {
      "5,6": "enero–febrero",
      "7,8": "marzo–abril",
      "3,4": "mayo–junio",
      "1,2": "julio–agosto",
      "9,0": "septiembre–octubre",
    },
    tenenciaNote: "Tenencia según tabulador estatal. Consultar fechas de pago.",
    officialSourceUrl: "https://tenencia.edomex.gob.mx/",
    lastUpdated: "2026-01-01",
  },
];

export function getPlateLastDigit(plate: string): string {
  const cleaned = plate.replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.slice(-1);
}

/** Last month (1–12) of the verification window for the plate’s last digit. */
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

/** Next verification-window end date (YYYY-MM-DD) from plate + CDMX/EdoMex calendar. */
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

export function getVerificationPeriod(
  plate: string,
  stateCode: string,
  rules: MxVehicleRule[],
): string | null {
  const rule = rules.find((r) => r.stateCode === stateCode);
  if (!rule) return null;

  const digit = getPlateLastDigit(plate);
  if (!digit) return null;

  for (const [digits, period] of Object.entries(rule.verificationSchedule)) {
    const list = digits.split(",").map((d) => d.trim());
    if (list.includes(digit)) return period;
  }

  return null;
}

export function getRuleSummary(
  plate: string,
  stateCode: string,
  rules: MxVehicleRule[],
): { summary: string; sourceUrl: string; tenenciaNote: string } | null {
  const rule = rules.find((r) => r.stateCode === stateCode);
  if (!rule) return null;

  const period = getVerificationPeriod(plate, stateCode, rules);
  const digit = getPlateLastDigit(plate);

  return {
    summary: period
      ? `Terminación ${digit} → ${period}`
      : "Consulta calendario por terminación de placa",
    sourceUrl: rule.officialSourceUrl,
    tenenciaNote: rule.tenenciaNote,
  };
}

export function computeDaysUntil(dateStr: string): number {
  const normalized = parseVehicleDateLiteral(dateStr) ?? dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.NaN;
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDaysLabel(days: number): string {
  if (days < 0) return "vencida";
  if (days === 0) return "hoy";
  if (days === 1) return "en 1 día";
  return `en ${days} días`;
}

export function getUrgencyStatus(days: number): UrgencyStatus {
  if (days < 0) return "danger";
  if (days <= 7) return "warning";
  return "ok";
}

export function getUrgencyLabel(days: number): string {
  if (days < 0) return "Vencida";
  if (days === 0) return "Vence hoy";
  if (days <= 7) return "Vence pronto";
  return "Al día";
}
