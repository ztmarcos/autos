import { getPlateLastDigit } from "@/lib/mx-rules";
import type { StateNewsAlert, VehicleType } from "@/lib/types";

export type NoCirculaStatus = "circula" | "no_circula" | "unknown";

export interface NoCirculaInfo {
  status: NoCirculaStatus;
  title: string;
  detail: string;
  appliesToday: boolean;
  sourceUrl?: string;
}

export interface VehicleTypeHint {
  vehicleType?: string;
  alias?: string;
  brand?: string;
}

export function inferVehicleTypeFromText(
  ...texts: (string | null | undefined)[]
): VehicleType | undefined {
  for (const text of texts) {
    if (!text?.trim()) continue;
    const raw = text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (
      raw.includes("automovil") ||
      raw.includes("autoparticular") ||
      raw.includes("auto particular") ||
      raw.includes("camioneta") ||
      raw.includes("pick up") ||
      raw.includes("pickup")
    ) {
      return "auto";
    }

    if (
      raw.includes("motocicleta") ||
      raw.includes("motociclet") ||
      raw.includes("motoneta") ||
      raw.includes("ciclomotor") ||
      /\bmoto\b/.test(raw) ||
      raw.includes("scooter") ||
      raw.includes("cuatrimoto") ||
      raw.includes("trimoto") ||
      raw.includes("motocross") ||
      raw.includes("mototaxi")
    ) {
      return "moto";
    }
  }

  return undefined;
}

export function resolveVehicleTypeFromFields(
  fields: Record<string, string | number | null | undefined>,
): VehicleType | undefined {
  const candidates = [
    fields.tipo_vehiculo,
    fields.tipo_de_vehiculo,
    fields.descripcion,
    fields.modelo,
    fields.submarca,
    fields.marca,
  ];

  for (const value of candidates) {
    if (value == null || value === "") continue;
    const inferred = inferVehicleTypeFromText(String(value));
    if (inferred) return inferred;
  }

  return undefined;
}

export function isNoCirculaEligibleVehicle(
  vehicle: VehicleTypeHint & { calcomania?: string },
): boolean {
  if (isMotoVehicle(vehicle)) return false;
  return Boolean(vehicle.calcomania?.trim());
}

export function isMotoVehicle(vehicle: VehicleTypeHint): boolean {
  if (vehicle.vehicleType === "moto") return true;
  if (vehicle.vehicleType === "auto") return false;

  const inferred =
    inferVehicleTypeFromText(vehicle.alias) ??
    inferVehicleTypeFromText(vehicle.brand);
  return inferred === "moto";
}

export interface NoCirculaOptions extends VehicleTypeHint {
  calcomania?: string;
  hasContingency?: boolean;
  contingencyAlert?: Pick<
    StateNewsAlert,
    "title" | "summary" | "sourceUrl" | "affectedHolograms"
  >;
  now?: Date;
}

const CDMX_WEEKDAY_RESTRICTIONS: Record<number, string[]> = {
  1: ["5", "6"],
  2: ["7", "8"],
  3: ["3", "4"],
  4: ["1", "2"],
  5: ["9", "0"],
};

/** Color del engomado de verificación según terminación de placa (CDMX / EdoMex). */
export type EngomadoColor = "amarillo" | "rosa" | "rojo" | "verde" | "azul";

const ENGOMADO_RULES: Array<{
  color: EngomadoColor;
  digits: string[];
  weekday: string;
}> = [
  { color: "amarillo", digits: ["5", "6"], weekday: "lunes" },
  { color: "rosa", digits: ["7", "8"], weekday: "martes" },
  { color: "rojo", digits: ["3", "4"], weekday: "miércoles" },
  { color: "verde", digits: ["1", "2"], weekday: "jueves" },
  { color: "azul", digits: ["9", "0"], weekday: "viernes" },
];

const ENGOMADO_COLORS: Record<
  EngomadoColor,
  { background: string; border: string; label: string }
> = {
  amarillo: {
    background: "#e8c547",
    border: "#c9a832",
    label: "Amarillo",
  },
  rosa: {
    background: "#e878a8",
    border: "#c95688",
    label: "Rosa",
  },
  rojo: {
    background: "#d94a6a",
    border: "#b83855",
    label: "Rojo",
  },
  verde: {
    background: "#4caf7a",
    border: "#3d9363",
    label: "Verde",
  },
  azul: {
    background: "#4a90d9",
    border: "#3570b0",
    label: "Azul",
  },
};

export function usesEngomadoByPlate(stateCode: string): boolean {
  return stateCode === "CDMX" || stateCode === "EDOMEX";
}

export function getEngomadoFromPlate(plate: string): EngomadoColor | null {
  const digit = getPlateLastDigit(plate);
  if (!digit) return null;
  const rule = ENGOMADO_RULES.find((entry) => entry.digits.includes(digit));
  return rule?.color ?? null;
}

export function getEngomadoWeekday(engomado: EngomadoColor): string {
  return ENGOMADO_RULES.find((entry) => entry.color === engomado)?.weekday ?? "";
}

export function formatEngomadoLabel(
  engomado: EngomadoColor,
  plate?: string,
): string {
  const weekday = getEngomadoWeekday(engomado);
  const digit = plate ? getPlateLastDigit(plate) : "";
  const colorLabel = ENGOMADO_COLORS[engomado].label;
  if (weekday && digit) {
    return `Engomado ${colorLabel} — no circula ${weekday} (terminación ${digit})`;
  }
  if (weekday) return `Engomado ${colorLabel} — no circula ${weekday}`;
  return `Engomado ${colorLabel}`;
}

export function getEngomadoColors(engomado: EngomadoColor): {
  background: string;
  border: string;
} {
  const colors = ENGOMADO_COLORS[engomado];
  return { background: colors.background, border: colors.border };
}

function getMexicoCityDate(now = new Date()): Date {
  return new Date(
    now.toLocaleString("en-US", { timeZone: "America/Mexico_City" }),
  );
}

function isRestrictedHour(hour: number): boolean {
  return hour >= 5 && hour < 22;
}

function isAlertFromToday(alert: StateNewsAlert, now = new Date()): boolean {
  const local = getMexicoCityDate(now);
  local.setHours(0, 0, 0, 0);
  const published = new Date(alert.publishedAt);
  published.setHours(0, 0, 0, 0);
  return published.getTime() >= local.getTime();
}

export function isExemptCalcomania(calcomania?: string): boolean {
  return calcomania === "0" || calcomania === "00";
}

export function isContingencyAlert(alert: StateNewsAlert): boolean {
  const text = `${alert.title} ${alert.summary}`.toLowerCase();
  if (!text.includes("contingencia")) return false;
  return (
    text.includes("activ") ||
    text.includes("fase i") ||
    text.includes("fase ii") ||
    text.includes("fase 1") ||
    text.includes("fase 2") ||
    text.includes("declar") ||
    text.includes("mantiene") ||
    text.includes("suspende") ||
    text.includes("levanta")
  );
}

export function getActiveContingencyAlerts(
  alerts: StateNewsAlert[],
  stateCode = "CDMX",
  now = new Date(),
): StateNewsAlert[] {
  return alerts.filter((alert) => {
    if (!alert.stateCodes.includes(stateCode)) return false;
    if (!isContingencyAlert(alert)) return false;
    return isAlertFromToday(alert, now);
  });
}

export function hasCdmxContingency(
  alerts: StateNewsAlert[],
  stateCode = "CDMX",
  now = new Date(),
): boolean {
  return getActiveContingencyAlerts(alerts, stateCode, now).length > 0;
}

function formatContingencyDetail(
  alert?: Pick<StateNewsAlert, "title" | "summary">,
): string {
  if (!alert) {
    return "Hay contingencia ambiental activa en CDMX.";
  }
  const summary = alert.summary?.trim();
  if (summary && summary.length > 20) return summary;
  return alert.title.trim() || "Hay contingencia ambiental activa en CDMX.";
}

function getExemptContingencyInfo(
  calcomania: string,
  contingencyAlert?: NoCirculaOptions["contingencyAlert"],
): NoCirculaInfo {
  const label = calcomania === "00" ? "Calcomanía 00" : "Calcomanía 0";
  const contingencyDetail = formatContingencyDetail(contingencyAlert);

  return {
    status: "circula",
    title: "Contingencia ambiental",
    detail: `${contingencyDetail} Con ${label.toLowerCase()} estás exento: puedes circular hoy. En contingencia la restricción aplica a hologramas 1 y 2.`,
    appliesToday: true,
    sourceUrl: contingencyAlert?.sourceUrl,
  };
}

function getContingencyRestrictionInfo(
  calcomania: string,
  hour: number,
  contingencyAlert: NoCirculaOptions["contingencyAlert"],
  affectedHolograms: string[],
): NoCirculaInfo | null {
  if (!affectedHolograms.includes(calcomania)) return null;

  const contingencyDetail = formatContingencyDetail(contingencyAlert);

  if (!isRestrictedHour(hour)) {
    return {
      status: "circula",
      title: "Contingencia ambiental",
      detail: `${contingencyDetail} Con holograma ${calcomania} no circulas de 5:00 a 22:00 en CDMX.`,
      appliesToday: true,
      sourceUrl: contingencyAlert?.sourceUrl,
    };
  }

  return {
    status: "no_circula",
    title: "Contingencia ambiental",
    detail: `${contingencyDetail} Holograma ${calcomania}: restricción vigente de 5:00 a 22:00 en CDMX.`,
    appliesToday: true,
    sourceUrl: contingencyAlert?.sourceUrl,
  };
}

function getContingencyAffectedHolograms(
  contingencyAlert?: NoCirculaOptions["contingencyAlert"],
): string[] {
  const fromAlert = contingencyAlert?.affectedHolograms?.filter(Boolean);
  if (fromAlert?.length) return fromAlert;
  return ["1", "2"];
}

export function getNoCirculaInfo(
  plate: string,
  stateCode: string,
  options: NoCirculaOptions = {},
): NoCirculaInfo | null {
  if (stateCode !== "CDMX") return null;
  if (isMotoVehicle(options)) return null;

  const now = options.now ?? new Date();
  const local = getMexicoCityDate(now);
  const day = local.getDay();
  const hour = local.getHours();
  const digit = getPlateLastDigit(plate);
  const exempt = isExemptCalcomania(options.calcomania);
  const hasContingency = options.hasContingency ?? false;

  if (exempt) {
    if (!hasContingency) return null;
    return getExemptContingencyInfo(options.calcomania!, options.contingencyAlert);
  }

  if (hasContingency && (options.calcomania === "1" || options.calcomania === "2")) {
    const contingencyInfo = getContingencyRestrictionInfo(
      options.calcomania,
      hour,
      options.contingencyAlert,
      getContingencyAffectedHolograms(options.contingencyAlert),
    );
    if (contingencyInfo) return contingencyInfo;
  }

  if (!digit) return null;

  if (day === 0 || day === 6) return null;

  const restrictedDigits = CDMX_WEEKDAY_RESTRICTIONS[day] ?? [];
  const restrictedToday = restrictedDigits.includes(digit);

  if (!restrictedToday) return null;

  if (!isRestrictedHour(hour)) {
    return {
      status: "circula",
      title: "Restricción más tarde hoy",
      detail: `Placa terminación ${digit}. Hoy no circulas de 5:00 a 22:00 en CDMX.`,
      appliesToday: true,
    };
  }

  return {
    status: "no_circula",
    title: "Hoy no circula",
    detail: `Placa terminación ${digit}. Restricción de 5:00 a 22:00 en CDMX.`,
    appliesToday: true,
  };
}

export function formatCalcomaniaLabel(calcomania: string | number): string {
  const normalized = String(calcomania).trim();
  switch (normalized) {
    case "0":
      return "Holograma 0 — Exento";
    case "00":
      return "Holograma 00 — Eléctrico / híbrido";
    case "1":
      return "Holograma 1 — Normal";
    case "2":
      return "Holograma 2 — Mayor restricción";
    default:
      return normalized;
  }
}

/** Colores del holograma de verificación (0, 00, 1, 2) — distinto del engomado por placa. */
export function getCalcomaniaColors(calcomania: string | number): {
  background: string;
  border: string;
} | null {
  const normalized = String(calcomania).trim();
  switch (normalized) {
    case "0":
      return { background: "#e8c547", border: "#c9a832" };
    case "00":
      return { background: "#4caf7a", border: "#3d9363" };
    case "1":
      return { background: "#4a90d9", border: "#3570b0" };
    case "2":
      return { background: "#d94a6a", border: "#b83855" };
    default:
      return null;
  }
}
