import type { Firestore } from "firebase-admin/firestore";

export async function getInsuranceExpiryFromDocuments(
  db: Firestore,
  vehicleId: string,
): Promise<string | undefined> {
  const snap = await db
    .collection("vehicles")
    .doc(vehicleId)
    .collection("documents")
    .where("status", "==", "ready")
    .get();

  const polizas = snap.docs
    .map((doc) => doc.data())
    .filter((data) => data.detectedType === "poliza_seguro")
    .sort((a, b) => docTimestamp(b) - docTimestamp(a));

  for (const poliza of polizas) {
    const fields = poliza.extractedFields as Record<string, unknown> | undefined;
    const expiry = fields?.vigencia_fin;
    if (expiry != null && String(expiry).trim()) {
      return String(expiry).trim();
    }
  }

  return undefined;
}

function docTimestamp(data: Record<string, unknown>): number {
  const processedAt = data.processedAt as { toMillis?: () => number } | undefined;
  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  return processedAt?.toMillis?.() ?? createdAt?.toMillis?.() ?? 0;
}

export async function resolveInsuranceExpiry(
  db: Firestore,
  vehicleId: string,
  vehicleData: Record<string, unknown>,
): Promise<string | undefined> {
  const cached = vehicleData.insuranceExpiryDate as string | undefined;
  if (cached?.trim()) return cached.trim();

  const expiry = await getInsuranceExpiryFromDocuments(db, vehicleId);
  if (expiry) {
    await db.collection("vehicles").doc(vehicleId).update({
      insuranceExpiryDate: expiry,
    });
  }
  return expiry;
}

export async function syncInsuranceExpiryOnVehicle(
  db: Firestore,
  vehicleId: string,
  extractedFields?: Record<string, string | number | null>,
): Promise<void> {
  const fromFields = extractedFields?.vigencia_fin;
  if (fromFields != null && String(fromFields).trim()) {
    await db.collection("vehicles").doc(vehicleId).update({
      insuranceExpiryDate: String(fromFields).trim(),
    });
    return;
  }

  const expiry = await getInsuranceExpiryFromDocuments(db, vehicleId);
  if (expiry) {
    await db.collection("vehicles").doc(vehicleId).update({
      insuranceExpiryDate: expiry,
    });
  }
}
