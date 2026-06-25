import { MX_STATES } from "@/lib/mx-rules";
import { resolveVehicleTypeFromFields } from "@/lib/no-circula";
import type { VehicleType } from "@/lib/types";

export interface VehicleCardFields {
  placa?: string | null;
  niv?: string | null;
  marca?: string | null;
  submarca?: string | null;
  modelo?: string | null;
  anio?: string | number | null;
  color?: string | null;
  entidad?: string | null;
  nombre?: string | null;
  propietario?: string | null;
  cilindros?: string | number | null;
  tipo_vehiculo?: string | null;
  fecha_expedicion?: string | null;
  fecha_vencimiento?: string | null;
}

export interface VehicleCardScanResult {
  confidence: number;
  extractedFields: VehicleCardFields;
  mapped: {
    plate?: string;
    alias?: string;
    state?: string;
    niv?: string;
    cylinders?: number;
    ownerName?: string;
    cardIssueDate?: string;
    cardExpiryDate?: string;
    brand?: string;
    modelYear?: number;
    vehicleType?: VehicleType;
  };
}

const ENTIDAD_ALIASES: Record<string, string> = {
  cdmx: "CDMX",
  "ciudad de mexico": "CDMX",
  "ciudad de méxico": "CDMX",
  df: "CDMX",
  "distrito federal": "CDMX",
  edomex: "EDOMEX",
  "estado de mexico": "EDOMEX",
  "estado de méxico": "EDOMEX",
  mex: "EDOMEX",
  jalisco: "JAL",
  jal: "JAL",
  "nuevo leon": "NL",
  "nuevo león": "NL",
  nl: "NL",
  puebla: "PUE",
  pue: "PUE",
};

export function normalizeCardDateLiteral(
  value: string | number | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  return raw || undefined;
}

function parseCylinders(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const n = parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseModelYear(
  value: string | number | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  if (/^\d{4}$/.test(raw)) {
    const year = parseInt(raw, 10);
    if (year >= 1950 && year <= 2100) return year;
    return undefined;
  }

  if (/^\d{2}$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n >= 50 ? 1900 + n : 2000 + n;
  }

  const match = raw.match(/\b(19\d{2}|20\d{2})\b/);
  if (match) return parseInt(match[1], 10);

  return undefined;
}

export type CalcomaniaValue = "0" | "00" | "1" | "2";

export function normalizeCalcomania(
  value: unknown,
): CalcomaniaValue | undefined {
  if (value == null || value === "") return undefined;
  const raw = String(value).trim();
  if (raw === "0" || raw === "00" || raw === "1" || raw === "2") return raw;
  return undefined;
}

function indicatesExemption(raw: string): boolean {
  if (raw.includes("sin restricción") || raw.includes("sin restriccion")) {
    return true;
  }
  if (/\bno\s+exento\b/.test(raw)) return false;
  if (/\bno\s+(?:es|est[aá]?|cumple|aplica)\b[^.]{0,48}\bexento\b/.test(raw)) {
    return false;
  }
  return /\bexento\b/.test(raw);
}

export function parseCalcomaniaFromHolograma(
  value: string | number | null | undefined,
): CalcomaniaValue | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return undefined;

  if (raw === "00" || raw.includes("doble cero") || raw.includes("doble-cero")) {
    return "00";
  }

  if (
    raw === "2" ||
    raw.includes("holograma 2") ||
    raw.includes("tipo 2") ||
    /holograma\s*[:.]?\s*2\b/.test(raw) ||
    /\bengomado\s*2\b/.test(raw) ||
    /\bcalcoman[ií]a\s*2\b/.test(raw)
  ) {
    return "2";
  }
  if (
    raw === "1" ||
    raw.includes("holograma 1") ||
    raw.includes("tipo 1") ||
    /holograma\s*[:.]?\s*1\b/.test(raw) ||
    /\bengomado\s*1\b/.test(raw) ||
    /\bcalcoman[ií]a\s*1\b/.test(raw)
  ) {
    return "1";
  }

  if (raw === "0" || (/^0\b/.test(raw) && !raw.startsWith("00"))) return "0";
  if (/^2\b/.test(raw) || /^2\s*[-–]/.test(raw)) return "2";
  if (/^1\b/.test(raw) || /^1\s*[-–]/.test(raw)) return "1";
  if (indicatesExemption(raw)) return "0";

  const digit = raw.replace(/\D/g, "");
  if (digit === "00") return "00";
  if (digit === "0") return "0";
  if (digit === "1") return "1";
  if (digit === "2") return "2";

  const trailing = raw.match(/(?:holograma|engomado|calcoman[ií]a)\s*[:.]?\s*([012])\b/);
  if (trailing?.[1] === "2") return "2";
  if (trailing?.[1] === "1") return "1";
  if (trailing?.[1] === "0") return "0";

  return undefined;
}

export function resolveCalcomaniaFromVerificacionFields(
  fields: Record<string, string | number | null | undefined>,
): CalcomaniaValue | undefined {
  const prioritized = [fields.holograma, fields.resultado];
  let zeroCandidate: CalcomaniaValue | undefined;

  for (const value of prioritized) {
    const parsed = parseCalcomaniaFromHolograma(value);
    if (!parsed) continue;
    if (parsed === "1" || parsed === "2" || parsed === "00") return parsed;
    zeroCandidate = "0";
  }

  for (const value of Object.values(fields)) {
    const parsed = parseCalcomaniaFromHolograma(value);
    if (parsed === "1" || parsed === "2" || parsed === "00") return parsed;
  }

  return zeroCandidate;
}

export function mapEntidadToStateCode(entidad: string): string | undefined {
  const normalized = entidad.trim().toLowerCase();
  if (!normalized) return undefined;

  const direct = MX_STATES.find(
    (s) =>
      s.code.toLowerCase() === normalized ||
      s.name.toLowerCase() === normalized,
  );
  if (direct) return direct.code;

  for (const [alias, code] of Object.entries(ENTIDAD_ALIASES)) {
    if (normalized.includes(alias)) return code;
  }

  return undefined;
}

export function mapCardFieldsToVehicle(
  fields: VehicleCardFields,
): VehicleCardScanResult["mapped"] {
  const plate = fields.placa ? String(fields.placa).trim().toUpperCase() : undefined;
  const marca = fields.marca ? String(fields.marca).trim() : "";
  const submarca = fields.submarca ? String(fields.submarca).trim() : "";
  const modelo = fields.modelo ? String(fields.modelo).trim() : "";
  const line = submarca || (modelo && !parseModelYear(modelo) ? modelo : "");
  const alias =
    marca || line ? [marca, line].filter(Boolean).join(" ") : undefined;
  const state = fields.entidad
    ? mapEntidadToStateCode(String(fields.entidad))
    : undefined;
  const niv = fields.niv ? String(fields.niv).trim().toUpperCase() : undefined;
  const ownerNameRaw = fields.nombre ?? fields.propietario;
  const ownerName = ownerNameRaw ? String(ownerNameRaw).trim() : undefined;
  const vehicleType = resolveVehicleTypeFromFields(
    fields as Record<string, string | number | null | undefined>,
  );

  return {
    plate,
    alias,
    state,
    niv,
    cylinders: parseCylinders(fields.cilindros),
    ownerName,
    cardIssueDate: normalizeCardDateLiteral(fields.fecha_expedicion),
    cardExpiryDate: normalizeCardDateLiteral(fields.fecha_vencimiento),
    brand: marca || undefined,
    modelYear: parseModelYear(fields.anio ?? fields.modelo),
    vehicleType,
  };
}

export function applyScanToForm(fields: VehicleCardFields): {
  plate: string;
  alias: string;
  state: string;
  niv: string;
  cylinders: string;
  ownerName: string;
  cardIssueDate: string;
  cardExpiryDate: string;
  modelYear: string;
  vehicleType: VehicleType;
} {
  const mapped = mapCardFieldsToVehicle(fields);
  return {
    plate: mapped.plate ?? "",
    alias: mapped.alias ?? "",
    state: mapped.state ?? "CDMX",
    niv: mapped.niv ?? "",
    cylinders: mapped.cylinders?.toString() ?? "",
    ownerName: mapped.ownerName ?? "",
    cardIssueDate: mapped.cardIssueDate ?? "",
    cardExpiryDate: mapped.cardExpiryDate ?? "",
    modelYear: mapped.modelYear?.toString() ?? "",
    vehicleType: mapped.vehicleType ?? "auto",
  };
}
