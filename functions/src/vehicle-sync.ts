import type { Firestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { parseModelYear, normalizeCalcomania, resolveCalcomaniaFromVerificacionFields } from "./model-year";
import { isMotoVehicle, resolveVehicleTypeFromFields } from "./no-circula";

function parseCylinders(
  value: string | number | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const n = parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isUnset(value: unknown): boolean {
  return value == null || value === "";
}

const ENTIDAD_ALIASES: Record<string, string> = {
  cdmx: "CDMX",
  "ciudad de mexico": "CDMX",
  "ciudad de méxico": "CDMX",
  df: "CDMX",
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

function mapEntidadToStateCode(entidad: string): string | undefined {
  const normalized = entidad.trim().toLowerCase();
  if (!normalized) return undefined;

  for (const [alias, code] of Object.entries(ENTIDAD_ALIASES)) {
    if (normalized.includes(alias)) return code;
  }

  const upper = entidad.trim().toUpperCase();
  if (["CDMX", "EDOMEX", "JAL", "NL", "PUE"].includes(upper)) return upper;
  return undefined;
}

function normalizeDateLiteral(
  value: string | number | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  return raw || undefined;
}

function buildAlias(
  fields: Record<string, string | number | null>,
): string | undefined {
  const marca = fields.marca ? String(fields.marca).trim() : "";
  const submarca = fields.submarca ? String(fields.submarca).trim() : "";
  const modelo = fields.modelo ? String(fields.modelo).trim() : "";
  const line = submarca || (modelo && !parseModelYear(modelo) ? modelo : "");
  const alias = [marca, line].filter(Boolean).join(" ");
  return alias || undefined;
}

function applyVehicleTypeFields(
  patch: Record<string, unknown>,
  vehicle: Record<string, unknown>,
  fields: Record<string, string | number | null>,
): void {
  const resolved = resolveVehicleTypeFromFields(fields);
  if (!resolved) return;

  const currentType = vehicle.vehicleType as string | undefined;
  if (resolved === "moto" || isUnset(currentType)) {
    patch.vehicleType = resolved;
  }

  if (resolved === "moto") {
    patch.calcomania = null;
    patch.verificationDate = null;
  }
}

function applyTarjetaFields(
  patch: Record<string, unknown>,
  vehicle: Record<string, unknown>,
  fields: Record<string, string | number | null>,
): void {
  const plate = fields.placa ? String(fields.placa).trim().toUpperCase() : undefined;
  if (plate && (isUnset(vehicle.plate) || vehicle.plate === "PENDIENTE")) {
    patch.plate = plate;
  }

  if (isUnset(vehicle.niv) && fields.niv) {
    patch.niv = String(fields.niv).trim().toUpperCase();
  }
  if (isUnset(vehicle.brand) && fields.marca) {
    patch.brand = String(fields.marca).trim();
  }
  if (isUnset(vehicle.ownerName) && (fields.nombre || fields.propietario)) {
    patch.ownerName = String(fields.nombre ?? fields.propietario).trim();
  }
  if (isUnset(vehicle.cylinders)) {
    const cylinders = parseCylinders(fields.cilindros);
    if (cylinders) patch.cylinders = cylinders;
  }
  if (isUnset(vehicle.cardIssueDate) && fields.fecha_expedicion) {
    patch.cardIssueDate = normalizeDateLiteral(fields.fecha_expedicion);
  }
  if (isUnset(vehicle.cardExpiryDate) && fields.fecha_vencimiento) {
    patch.cardExpiryDate = normalizeDateLiteral(fields.fecha_vencimiento);
  }
  if (isUnset(vehicle.modelYear)) {
    const year = parseModelYear(fields.anio ?? fields.modelo);
    if (year) patch.modelYear = year;
  }

  const alias = buildAlias(fields);
  if (isUnset(vehicle.alias) && alias) {
    patch.alias = alias;
  }

  if (isUnset(vehicle.state) && fields.entidad) {
    const state = mapEntidadToStateCode(String(fields.entidad));
    if (state) patch.state = state;
  }

  applyVehicleTypeFields(patch, { ...vehicle, ...patch }, fields);
}

function applyPolizaFields(
  patch: Record<string, unknown>,
  vehicle: Record<string, unknown>,
  fields: Record<string, string | number | null>,
): void {
  if (isUnset(vehicle.modelYear)) {
    const year = parseModelYear(fields.anio ?? fields.modelo);
    if (year) patch.modelYear = year;
  }
  if (isUnset(vehicle.brand) && fields.marca) {
    patch.brand = String(fields.marca).trim();
  }

  const alias = buildAlias(fields);
  if (isUnset(vehicle.alias) && alias) {
    patch.alias = alias;
  }

  applyVehicleTypeFields(patch, { ...vehicle, ...patch }, fields);
}

function applyVerificacionFields(
  patch: Record<string, unknown>,
  vehicle: Record<string, unknown>,
  fields: Record<string, string | number | null>,
): void {
  if (isMotoVehicle(vehicle)) return;

  if (isUnset(vehicle.verificationDate) && fields.fecha) {
    patch.verificationDate = normalizeDateLiteral(fields.fecha);
  }
  const calcomania = resolveCalcomaniaFromVerificacionFields(fields);
  const current = normalizeCalcomania(vehicle.calcomania);
  if (calcomania && current !== calcomania) {
    patch.calcomania = calcomania;
  }
}

function applyTenenciaFields(
  patch: Record<string, unknown>,
  vehicle: Record<string, unknown>,
  fields: Record<string, string | number | null>,
): void {
  if (isUnset(vehicle.refrendoDate) && fields.fecha_pago) {
    patch.refrendoDate = normalizeDateLiteral(fields.fecha_pago);
  }
  if (isUnset(vehicle.tenenciaDate) && fields.fecha_pago) {
    patch.tenenciaDate = normalizeDateLiteral(fields.fecha_pago);
  }
}

export async function syncVehicleGeneralOnDocument(
  db: Firestore,
  vehicleId: string,
  detectedType: string,
  extractedFields?: Record<string, string | number | null>,
): Promise<void> {
  if (!extractedFields) return;

  const syncTypes = new Set([
    "tarjeta_circulacion",
    "poliza_seguro",
    "verificacion",
    "tenencia",
  ]);
  if (!syncTypes.has(detectedType)) return;

  const vehicleRef = db.collection("vehicles").doc(vehicleId);
  const snap = await vehicleRef.get();
  if (!snap.exists) return;

  const vehicle = snap.data() as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const merged = { ...vehicle, ...patch };

  switch (detectedType) {
    case "tarjeta_circulacion":
      applyTarjetaFields(patch, merged, extractedFields);
      break;
    case "poliza_seguro":
      applyPolizaFields(patch, merged, extractedFields);
      break;
    case "verificacion":
      applyVerificacionFields(patch, merged, extractedFields);
      break;
    case "tenencia":
      applyTenenciaFields(patch, merged, extractedFields);
      break;
  }

  if (Object.keys(patch).length === 0) return;

  await vehicleRef.update({
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
