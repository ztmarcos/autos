/**
 * Regenerate a vehicle brand logo (reuses cache when possible).
 * Usage:
 *   node scripts/repair-brand-logo.cjs <vehicleId>
 *   node scripts/repair-brand-logo.cjs <vehicleId> --force-brand
 */
const admin = require("firebase-admin");
const {
  ensureVehicleBrandLogoForDoc,
  clearBrandLogoCache,
  normalizeBrandKey,
} = require("../lib/generate-brand-logo");

const vehicleId = process.argv[2];
const forceBrand = process.argv.includes("--force-brand");

if (!vehicleId) {
  console.error("Usage: node scripts/repair-brand-logo.cjs <vehicleId> [--force-brand]");
  process.exit(1);
}

admin.initializeApp({ projectId: "autos-fa58f" });

async function main() {
  const db = admin.firestore();
  const bucket = admin.storage().bucket("autos-fa58f.firebasestorage.app");
  const ref = db.collection("vehicles").doc(vehicleId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error(`Vehicle ${vehicleId} not found`);
  }

  const data = snap.data();
  console.log("Vehicle:", data.alias ?? data.plate, "| user:", data.userId);
  console.log("Current logo:", data.brandLogoPath ?? "(none)", data.brandLogoStatus ?? "");

  if (forceBrand && data.brand) {
    const brandKey = normalizeBrandKey(data.brand);
    console.log("Clearing brand cache:", brandKey);
    await clearBrandLogoCache(db, bucket, brandKey);
  }

  await ref.update({
    brandLogoPath: admin.firestore.FieldValue.delete(),
    brandLogoStatus: admin.firestore.FieldValue.delete(),
    brandLogoKey: admin.firestore.FieldValue.delete(),
  });

  const fresh = (await ref.get()).data();
  await ensureVehicleBrandLogoForDoc(vehicleId, fresh, db, bucket);

  const after = (await ref.get()).data();
  console.log("Done:", after.brandLogoStatus, after.brandLogoPath, after.brandLogoKey ?? "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
