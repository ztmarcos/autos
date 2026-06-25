import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";
import { db, functions, storage } from "@/lib/firebase";
import { updateVehicle } from "@/lib/vehicles";
import type { Vehicle } from "@/lib/types";

const requested = new Set<string>();

export function normalizeBrandKey(brand: string): string {
  return (
    brand
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

export function isSharedBrandLogoPath(path: string | undefined): boolean {
  return typeof path === "string" && path.startsWith("brands/");
}

export async function getVehicleBrandLogoUrl(
  vehicle: Vehicle,
): Promise<string | null> {
  if (!vehicle.brandLogoPath) return null;
  try {
    return await getDownloadURL(ref(storage, vehicle.brandLogoPath));
  } catch {
    return null;
  }
}

async function getCachedBrandLogo(
  brand: string,
): Promise<{ brand: string; brandKey: string; logoPath: string } | null> {
  const brandKey = normalizeBrandKey(brand);
  const snap = await getDoc(doc(db, "brand_logos", brandKey));
  if (!snap.exists()) return null;

  const data = snap.data();
  if (data.status !== "ready" || typeof data.logoPath !== "string") return null;

  return {
    brand: typeof data.brand === "string" ? data.brand : brand,
    brandKey,
    logoPath: data.logoPath,
  };
}

export async function attachCachedBrandLogoIfAvailable(
  vehicle: Vehicle,
): Promise<Vehicle | null> {
  if (vehicle.brandLogoPath || !vehicle.brand?.trim()) return null;

  const cached = await getCachedBrandLogo(vehicle.brand);
  if (!cached) return null;

  const patch = {
    brand: cached.brand,
    brandLogoKey: cached.brandKey,
    brandLogoPath: cached.logoPath,
    brandLogoStatus: "ready" as const,
  };
  await updateVehicle(vehicle.id, patch);
  return { ...vehicle, ...patch };
}

export async function attachCachedBrandLogos(
  vehicles: Vehicle[],
): Promise<Vehicle[]> {
  const results = await Promise.all(
    vehicles.map(async (vehicle) => {
      const updated = await attachCachedBrandLogoIfAvailable(vehicle);
      return updated ?? vehicle;
    }),
  );
  return results;
}

export function requestMissingBrandLogos(vehicles: Vehicle[]): void {
  for (const vehicle of vehicles) {
    if (vehicle.brandLogoPath || vehicle.brandLogoStatus === "generating") {
      continue;
    }
    if (requested.has(vehicle.id)) continue;
    requested.add(vehicle.id);

    const call = httpsCallable<{ vehicleId: string }, { ok: boolean }>(
      functions,
      "requestVehicleBrandLogo",
      { timeout: 120_000 },
    );
    void call({ vehicleId: vehicle.id }).catch(() => {
      requested.delete(vehicle.id);
    });
  }
}

export async function syncBrandLogosForVehicles(
  vehicles: Vehicle[],
): Promise<Vehicle[]> {
  const withCache = await attachCachedBrandLogos(vehicles);
  requestMissingBrandLogos(withCache);
  return withCache;
}
