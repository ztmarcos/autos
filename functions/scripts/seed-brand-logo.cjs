/**
 * Register an existing vehicle logo in the shared brand_logos cache.
 * Usage: node scripts/seed-brand-logo.cjs <brandName> [sourceStoragePath]
 *
 * Example:
 *   node scripts/seed-brand-logo.cjs Zontes \
 *     users/7e965827.../vehicles/Y5bOXTdQcn8XSvJqP5rB/brand-logo.png
 */
const { execSync } = require("child_process");
const admin = require("firebase-admin");
const {
  normalizeBrandKey,
  sharedBrandLogoPath,
  BRAND_LOGOS_COLLECTION,
} = require("../lib/brand-logo-cache");

const BUCKET = "autos-fa58f.firebasestorage.app";

const brandName = process.argv[2];
const sourcePath = process.argv[3];

if (!brandName) {
  console.error("Usage: node scripts/seed-brand-logo.cjs <brandName> [sourceStoragePath]");
  process.exit(1);
}

admin.initializeApp({ projectId: "autos-fa58f" });

async function main() {
  const brandKey = normalizeBrandKey(brandName);
  const logoPath = sharedBrandLogoPath(brandKey);
  const db = admin.firestore();

  if (sourcePath) {
    const from = `gs://${BUCKET}/${sourcePath}`;
    const to = `gs://${BUCKET}/${logoPath}`;
    console.log("Copying", from, "→", to);
    execSync(`gsutil cp "${from}" "${to}"`, { stdio: "inherit" });
  } else {
    const exists = await admin
      .storage()
      .bucket(BUCKET)
      .file(logoPath)
      .exists();
    if (!exists[0]) {
      throw new Error(`No source path and ${logoPath} does not exist in Storage`);
    }
  }

  await db
    .collection(BRAND_LOGOS_COLLECTION)
    .doc(brandKey)
    .set(
      {
        brand: brandName,
        brandKey,
        logoPath,
        status: "ready",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  console.log("Cached", brandName, "as", brandKey, "→", logoPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
