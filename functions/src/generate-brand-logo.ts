import * as admin from "firebase-admin";
import type { Bucket } from "@google-cloud/storage";
import { getOrEnsureBrandLogo } from "./brand-logo-cache";
import { getOpenAiApiKey } from "./brand-logo-openai";

export {
  countVisibleLogoPixels,
  generateBrandLogoPng,
  getOpenAiApiKey,
  researchBrandLogoBrief,
  resolveBrandFromDescription,
} from "./brand-logo-openai";

export {
  BRAND_LOGOS_COLLECTION,
  clearBrandLogoCache,
  getOrEnsureBrandLogo,
  isSharedBrandLogoPath,
  normalizeBrandKey,
  sharedBrandLogoPath,
} from "./brand-logo-cache";

export function vehicleBrandLogoPath(userId: string, vehicleId: string): string {
  return `users/${userId}/vehicles/${vehicleId}/brand-logo.png`;
}

export async function ensureVehicleBrandLogoForDoc(
  vehicleId: string,
  data: admin.firestore.DocumentData,
  db: admin.firestore.Firestore,
  bucket: Bucket,
): Promise<void> {
  const vehicleRef = db.collection("vehicles").doc(vehicleId);
  const userId = data.userId as string;
  const description = String(data.alias ?? data.plate ?? "").trim();
  if (!userId || !description) return;

  const apiKey = await getOpenAiApiKey();
  await vehicleRef.update({ brandLogoStatus: "generating" });

  try {
    const existingBrand =
      typeof data.brand === "string" && data.brand.trim() ? data.brand.trim() : undefined;
    const { brand, brandKey, logoPath } = await getOrEnsureBrandLogo(
      description,
      apiKey,
      db,
      bucket,
      { brand: existingBrand },
    );

    await vehicleRef.update({
      brand,
      brandLogoKey: brandKey,
      brandLogoPath: logoPath,
      brandLogoStatus: "ready",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`Brand logo failed for vehicle ${vehicleId}:`, err);
    await vehicleRef.update({ brandLogoStatus: "failed" });
  }
}

export function shouldGenerateBrandLogo(
  before: admin.firestore.DocumentData | undefined,
  after: admin.firestore.DocumentData,
): boolean {
  if (after.brandLogoPath) return false;
  if (after.brandLogoStatus === "generating") return false;

  const description = String(after.alias ?? after.plate ?? "").trim();
  const brand = String(after.brand ?? "").trim();
  if (!description && !brand) return false;

  if (!before) return true;

  if (after.brandLogoStatus === "failed") return false;

  const prevDescription = String(before.alias ?? before.plate ?? "").trim();
  const prevBrand = String(before.brand ?? "").trim();
  return prevDescription !== description || prevBrand !== brand;
}
