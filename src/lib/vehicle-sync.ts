import type { DocumentType, Vehicle, VehicleDocument } from "@/lib/types";
import {
  mapEntidadToStateCode,
  normalizeCardDateLiteral,
  normalizeCalcomania,
  parseModelYear,
  resolveCalcomaniaFromVerificacionFields,
} from "@/lib/vehicle-card-map";
import { isMotoVehicle, resolveVehicleTypeFromFields } from "@/lib/no-circula";
import { getLatestReadyDocument } from "@/lib/vehicle-data";
import { readPolizaExpiryFromFields } from "@/lib/documents";
import { listDocumentsForVehicle } from "@/lib/documents";
import { updateVehicle } from "@/lib/vehicles";

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

function fillIfEmpty<K extends keyof Vehicle>(
  patch: Partial<Vehicle>,
  vehicle: Vehicle,
  key: K,
  value: Vehicle[K] | undefined,
): void {
  if (value == null || value === "") return;
  if (!isUnset(vehicle[key])) return;
  patch[key] = value;
}

function applyVehicleTypeFields(
  patch: Partial<Vehicle>,
  vehicle: Vehicle,
  fields: Record<string, string | number | null>,
): void {
  const resolved = resolveVehicleTypeFromFields(fields);
  if (!resolved) return;

  const currentType = vehicle.vehicleType;
  if (resolved === "moto" || !currentType) {
    patch.vehicleType = resolved;
  }

  if (resolved === "moto") {
    patch.calcomania = undefined;
    patch.verificationDate = undefined;
  }
}

function applyTarjetaFields(
  patch: Partial<Vehicle>,
  vehicle: Vehicle,
  fields: Record<string, string | number | null>,
): void {
  const plate = fields.placa ? String(fields.placa).trim().toUpperCase() : undefined;
  if (plate && (isUnset(vehicle.plate) || vehicle.plate === "PENDIENTE")) {
    patch.plate = plate;
  }

  fillIfEmpty(
    patch,
    vehicle,
    "niv",
    fields.niv ? String(fields.niv).trim().toUpperCase() : undefined,
  );
  fillIfEmpty(
    patch,
    vehicle,
    "brand",
    fields.marca ? String(fields.marca).trim() : undefined,
  );
  fillIfEmpty(
    patch,
    vehicle,
    "ownerName",
    fields.nombre
      ? String(fields.nombre).trim()
      : fields.propietario
        ? String(fields.propietario).trim()
        : undefined,
  );
  fillIfEmpty(patch, vehicle, "cylinders", parseCylinders(fields.cilindros));
  fillIfEmpty(
    patch,
    vehicle,
    "cardIssueDate",
    normalizeCardDateLiteral(fields.fecha_expedicion),
  );
  fillIfEmpty(
    patch,
    vehicle,
    "cardExpiryDate",
    normalizeCardDateLiteral(fields.fecha_vencimiento),
  );
  fillIfEmpty(patch, vehicle, "modelYear", parseModelYear(fields.anio ?? fields.modelo));

  const marca = fields.marca ? String(fields.marca).trim() : "";
  const submarca = fields.submarca ? String(fields.submarca).trim() : "";
  const modelo = fields.modelo ? String(fields.modelo).trim() : "";
  const line = submarca || (modelo && !parseModelYear(modelo) ? modelo : "");
  const alias = [marca, line].filter(Boolean).join(" ");
  fillIfEmpty(patch, vehicle, "alias", alias || undefined);

  if (isUnset(vehicle.state) && fields.entidad) {
    const state = mapEntidadToStateCode(String(fields.entidad));
    if (state) patch.state = state;
  }

  applyVehicleTypeFields(patch, { ...vehicle, ...patch }, fields);
}

function applyPolizaFields(
  patch: Partial<Vehicle>,
  vehicle: Vehicle,
  fields: Record<string, string | number | null>,
): void {
  fillIfEmpty(
    patch,
    vehicle,
    "modelYear",
    parseModelYear(fields.anio ?? fields.modelo),
  );
  fillIfEmpty(
    patch,
    vehicle,
    "brand",
    fields.marca ? String(fields.marca).trim() : undefined,
  );
  fillIfEmpty(
    patch,
    vehicle,
    "insuranceExpiryDate",
    readPolizaExpiryFromFields(fields),
  );

  const marca = fields.marca ? String(fields.marca).trim() : "";
  const submarca = fields.submarca ? String(fields.submarca).trim() : "";
  const modelo = fields.modelo ? String(fields.modelo).trim() : "";
  const line = submarca || (modelo && !parseModelYear(modelo) ? modelo : "");
  const alias = [marca, line].filter(Boolean).join(" ");
  fillIfEmpty(patch, vehicle, "alias", alias || undefined);
  applyVehicleTypeFields(patch, { ...vehicle, ...patch }, fields);
}

function applyVerificacionFields(
  patch: Partial<Vehicle>,
  vehicle: Vehicle,
  fields: Record<string, string | number | null>,
): void {
  if (isMotoVehicle(vehicle)) return;

  fillIfEmpty(
    patch,
    vehicle,
    "verificationDate",
    normalizeCardDateLiteral(fields.fecha),
  );
  const calcomania = resolveCalcomaniaFromVerificacionFields(fields);
  const current = normalizeCalcomania(vehicle.calcomania);
  if (calcomania && current !== calcomania) {
    patch.calcomania = calcomania;
  }
}

function applyTenenciaFields(
  patch: Partial<Vehicle>,
  vehicle: Vehicle,
  fields: Record<string, string | number | null>,
): void {
  fillIfEmpty(
    patch,
    vehicle,
    "refrendoDate",
    normalizeCardDateLiteral(fields.fecha_pago),
  );
  fillIfEmpty(
    patch,
    vehicle,
    "tenenciaDate",
    normalizeCardDateLiteral(fields.fecha_pago),
  );
}

function applyDocumentFields(
  patch: Partial<Vehicle>,
  vehicle: Vehicle,
  detectedType: DocumentType,
  fields: Record<string, string | number | null>,
): void {
  const merged = { ...vehicle, ...patch };
  if (detectedType === "tarjeta_circulacion") {
    applyTarjetaFields(patch, merged, fields);
    return;
  }
  if (detectedType === "poliza_seguro") {
    applyPolizaFields(patch, merged, fields);
    return;
  }
  if (detectedType === "verificacion") {
    applyVerificacionFields(patch, merged, fields);
    return;
  }
  if (detectedType === "tenencia") {
    applyTenenciaFields(patch, merged, fields);
  }
}

export function buildVehicleGeneralPatch(
  vehicle: Vehicle,
  documents: VehicleDocument[],
): Partial<Vehicle> {
  const patch: Partial<Vehicle> = {};
  const sources: Array<{ type: DocumentType; doc?: VehicleDocument }> = [
    { type: "tarjeta_circulacion", doc: getLatestReadyDocument(documents, "tarjeta_circulacion") },
    { type: "poliza_seguro", doc: getLatestReadyDocument(documents, "poliza_seguro") },
    { type: "verificacion", doc: getLatestReadyDocument(documents, "verificacion") },
    { type: "tenencia", doc: getLatestReadyDocument(documents, "tenencia") },
  ];

  for (const { type, doc } of sources) {
    if (!doc?.extractedFields) continue;
    applyDocumentFields(patch, { ...vehicle, ...patch }, type, doc.extractedFields);
  }

  return patch;
}

export function buildVehicleGeneralPatchFromDocument(
  vehicle: Vehicle,
  detectedType: DocumentType,
  extractedFields: Record<string, string | number | null>,
): Partial<Vehicle> {
  const patch: Partial<Vehicle> = {};
  applyDocumentFields(patch, vehicle, detectedType, extractedFields);
  return patch;
}

export function vehiclePatchDiffers(
  vehicle: Vehicle,
  patch: Partial<Vehicle>,
): boolean {
  return Object.entries(patch).some(([key, value]) => {
    if (key === "calcomania") {
      return normalizeCalcomania(vehicle.calcomania) !== normalizeCalcomania(value);
    }
    return vehicle[key as keyof Vehicle] !== value;
  });
}

export async function syncVehicleGeneral(vehicle: Vehicle): Promise<Vehicle> {
  const documents = await listDocumentsForVehicle(vehicle.id);
  const patch = buildVehicleGeneralPatch(vehicle, documents);
  if (!vehiclePatchDiffers(vehicle, patch)) return vehicle;
  await updateVehicle(vehicle.id, patch);
  return { ...vehicle, ...patch };
}

export async function syncAllVehiclesGeneral(
  vehicles: Vehicle[],
): Promise<Vehicle[]> {
  return Promise.all(vehicles.map((vehicle) => syncVehicleGeneral(vehicle)));
}
