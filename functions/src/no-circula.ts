import type { StateNewsAlert } from "./state-news-sources";

export type VehicleType = "auto" | "moto";

export interface VehicleTypeHint {
  vehicleType?: string;
  alias?: string;
  brand?: string;
}

function normalizeVehicleText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function textLooksLikeMoto(raw: string): boolean {
  return (
    raw.includes("motocicleta") ||
    raw.includes("motociclet") ||
    raw.includes("motoneta") ||
    raw.includes("ciclomotor") ||
    /\bmoto\b/.test(raw) ||
    raw.includes("scooter") ||
    raw.includes("cuatrimoto") ||
    raw.includes("trimoto") ||
    raw.includes("motocross") ||
    raw.includes("mototaxi") ||
    /\d{2,4}\s*c\.?c\.?\b/.test(raw) ||
    /\b(zontes|italika|bajaj|benelli|ducati|ktm|harley|vespa|piaggio|cfmoto|keeway|motomel|triumph|kawasaki|enfield|carabela)\b/.test(
      raw,
    ) ||
    /\bbmw\s*k\s*\d/.test(raw) ||
    /\bbmw\s+(r|s|f|g|c)\s*\d/.test(raw) ||
    /\bbmw\s+\w*\bgs\b/.test(raw) ||
    /\bhonda\s+(cb|cbr|crf|nc|sh|pcx|elite|wave|tornado|africa)\b/.test(raw) ||
    /\bafrica twin\b/.test(raw) ||
    /\b(gsx|cbr|crf|yzf|ninja|goldwing|sportster|panigale|vstrom|nmax|k1600)\b/.test(
      raw,
    )
  );
}

function textLooksLikeAuto(raw: string): boolean {
  return (
    raw.includes("automovil") ||
    raw.includes("autoparticular") ||
    raw.includes("auto particular") ||
    raw.includes("camioneta") ||
    raw.includes("pick up") ||
    raw.includes("pickup")
  );
}

export function inferVehicleTypeFromText(
  ...texts: (string | null | undefined)[]
): VehicleType | undefined {
  const normalized = texts
    .map((text) => (text?.trim() ? normalizeVehicleText(text) : ""))
    .filter(Boolean);

  // Motos first: CASIN marks bikes as "Particular", same as cars.
  if (normalized.some(textLooksLikeMoto)) return "moto";
  if (normalized.some(textLooksLikeAuto)) return "auto";
  return undefined;
}

export function resolveVehicleType(
  ...texts: (string | number | null | undefined)[]
): VehicleType {
  for (const text of texts) {
    const inferred = inferVehicleTypeFromText(
      text == null ? undefined : String(text),
    );
    if (inferred) return inferred;
  }
  return "auto";
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

  const inferred =
    inferVehicleTypeFromText(vehicle.alias) ??
    inferVehicleTypeFromText(vehicle.brand);
  if (inferred === "moto") return true;

  return false;
}

export function vehicleRequiresVerification(vehicle: VehicleTypeHint): boolean {
  return !isMotoVehicle(vehicle);
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

export function isNoCirculaRelatedAlert(alert: StateNewsAlert): boolean {
  if (alert.category === "no_circula") return true;
  const text = `${alert.title} ${alert.summary}`.toLowerCase();
  return (
    text.includes("no circula") ||
    text.includes("contingencia ambiental") ||
    text.includes("contingencia")
  );
}

function alertAffectsCalcomania(
  alert: StateNewsAlert,
  calcomania?: string,
): boolean {
  if (!calcomania?.trim()) return false;
  if (isExemptCalcomania(calcomania)) return false;

  const affected =
    alert.affectedHolograms ??
    (isContingencyAlert(alert) ? ["1", "2"] : undefined);
  if (!affected?.length) return true;

  return affected.includes(calcomania);
}

export function alertAppliesToVehicle(
  alert: StateNewsAlert,
  vehicle: VehicleTypeHint & { state: string; plate: string; calcomania?: string },
): boolean {
  if (!alert.stateCodes.includes(vehicle.state)) return false;

  if (isNoCirculaRelatedAlert(alert)) {
    if (!isNoCirculaEligibleVehicle(vehicle)) return false;
    if (!alertAffectsCalcomania(alert, vehicle.calcomania)) return false;
  }

  if (!alert.plateDigits?.length) return true;

  const digit = getPlateLastDigit(vehicle.plate);
  if (!digit) return true;

  return alert.plateDigits.includes(digit);
}

export function getPlateLastDigit(plate: string): string {
  const cleaned = plate.replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.slice(-1);
}
