import type { MxVehicleRule, UrgencyStatus } from "@/lib/types";
import { parseVehicleDateLiteral } from "@/lib/dates";

export const MX_STATES = [
  { code: "CDMX", name: "Ciudad de México" },
  { code: "EDOMEX", name: "Estado de México" },
  { code: "JAL", name: "Jalisco" },
  { code: "NL", name: "Nuevo León" },
  { code: "PUE", name: "Puebla" },
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
