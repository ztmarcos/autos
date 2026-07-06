import type { DocumentData } from "firebase-admin/firestore";

export interface VehicleEmailSummary {
  displayName: string;
  plate: string;
  state: string;
  stateName: string;
  brand?: string;
  verificationDate?: string;
  tenenciaDate?: string;
  refrendoDate?: string;
  modelYear?: number;
  serviceDate?: string;
  insuranceExpiryDate?: string;
}

const STATE_NAMES: Record<string, string> = {
  CDMX: "Ciudad de México",
  EDOMEX: "Estado de México",
  JAL: "Jalisco",
  NL: "Nuevo León",
  PUE: "Puebla",
};

/** Solo estos correos reciben alertas automáticas por ahora. */
export const NOTIFICATION_EMAIL_ALLOWLIST = [
  "z.t.marcos@gmail.com",
] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function vehicleFromFirestore(data: DocumentData): VehicleEmailSummary {
  const plate = String(data.plate ?? "");
  const alias = data.alias as string | undefined;
  const state = String(data.state ?? "");
  return {
    displayName: alias?.trim() || plate,
    plate,
    state,
    stateName: STATE_NAMES[state] ?? state,
    brand: data.brand as string | undefined,
    verificationDate: data.verificationDate as string | undefined,
    tenenciaDate: data.tenenciaDate as string | undefined,
    refrendoDate: data.refrendoDate as string | undefined,
    modelYear: data.modelYear as number | undefined,
    serviceDate: data.serviceDate as string | undefined,
    insuranceExpiryDate: data.insuranceExpiryDate as string | undefined,
  };
}

export function vehicleDetailLines(vehicle: VehicleEmailSummary): string[] {
  const lines = [`Placa: ${vehicle.plate}`, `Estado: ${vehicle.stateName}`];
  if (vehicle.brand) lines.push(`Marca: ${vehicle.brand}`);
  if (vehicle.verificationDate) {
    lines.push(`Verificación: ${vehicle.verificationDate}`);
  }
  if (vehicle.tenenciaDate) lines.push(`Tenencia: ${vehicle.tenenciaDate}`);
  if (vehicle.refrendoDate) lines.push(`Refrendo: ${vehicle.refrendoDate}`);
  if (vehicle.modelYear) lines.push(`Modelo: ${vehicle.modelYear}`);
  if (vehicle.serviceDate) lines.push(`Servicio: ${vehicle.serviceDate}`);
  if (vehicle.insuranceExpiryDate) {
    lines.push(`Póliza: ${vehicle.insuranceExpiryDate}`);
  }
  return lines;
}

export function isDeliverableEmail(email: string | null | undefined): boolean {
  if (!email?.includes("@")) return false;
  const normalized = normalizeEmail(email);
  if (normalized.endsWith("@carcontrol.local")) return false;
  if (normalized === "demo@carcontrol.app") return false;
  return NOTIFICATION_EMAIL_ALLOWLIST.some(
    (allowed) => normalizeEmail(allowed) === normalized,
  );
}
