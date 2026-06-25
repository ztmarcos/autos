import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

const ADMIN_SECRET_KEY = "carcontrol_admin_secret";

export interface CasinClientVehicle {
  id: string;
  alias?: string;
  plate: string;
  state?: string;
  brand?: string;
  modelYear?: number;
  ownerName?: string;
}

export interface CasinClientRow {
  userId: string;
  clientName: string;
  email?: string;
  token: string;
  link: string;
  revoked: boolean;
  vehicles: CasinClientVehicle[];
}

export function getStoredAdminSecret(): string | null {
  if (typeof window === "undefined") return null;
  const secret = sessionStorage.getItem(ADMIN_SECRET_KEY)?.trim();
  return secret || null;
}

export function storeAdminSecret(secret: string): void {
  sessionStorage.setItem(ADMIN_SECRET_KEY, secret.trim());
}

export function clearAdminSecret(): void {
  sessionStorage.removeItem(ADMIN_SECRET_KEY);
}

export async function fetchCasinClients(
  adminSecret: string,
): Promise<CasinClientRow[]> {
  const listClients = httpsCallable<
    { adminSecret: string },
    { clients: CasinClientRow[] }
  >(functions, "listCasinClients");

  const result = await listClients({ adminSecret: adminSecret.trim() });
  return result.data.clients ?? [];
}

export function formatVehicleLabel(vehicle: CasinClientVehicle): string {
  const title = vehicle.alias?.trim() || vehicle.plate;
  const bits = [vehicle.plate];
  if (vehicle.brand) bits.push(vehicle.brand);
  if (vehicle.modelYear) bits.push(String(vehicle.modelYear));
  return `${title} · ${bits.join(" · ")}`;
}
