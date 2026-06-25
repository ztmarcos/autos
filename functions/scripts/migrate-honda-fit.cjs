/**
 * Move Honda Fit from dev-carcontrol-local to z.t.marcos@gmail.com
 * Run: node scripts/migrate-honda-fit.cjs
 */
const { execSync } = require("child_process");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  doc,
  getDocs,
  collection,
  updateDoc,
  serverTimestamp,
} = require("firebase/firestore");

const BUCKET = "autos-fa58f.firebasestorage.app";
const FROM_USER = "dev-carcontrol-local";
const TO_USER = "R4rQxOx7sJex2hE8LVtAX09cxci2";
const VEHICLE_ID = "VSoeypB0hv8ln1K7JG4E";

const FROM_PREFIX = `gs://${BUCKET}/users/${FROM_USER}/vehicles/${VEHICLE_ID}`;
const TO_PREFIX = `gs://${BUCKET}/users/${TO_USER}/vehicles/${VEHICLE_ID}`;

function remapPath(path) {
  if (!path || typeof path !== "string") return path;
  return path.replace(`users/${FROM_USER}/`, `users/${TO_USER}/`);
}

async function main() {
  console.log("Copying storage…");
  execSync(`gsutil -m cp -r "${FROM_PREFIX}" "${TO_PREFIX}"`, {
    stdio: "inherit",
  });

  const app = initializeApp({
    apiKey: "AIzaSyA1hgeELWEpyTt5y84HLOFuVmqzkdbmw4s",
    projectId: "autos-fa58f",
  });
  const db = getFirestore(app);

  const docsSnap = await getDocs(
    collection(db, "vehicles", VEHICLE_ID, "documents"),
  );

  console.log(`Updating ${docsSnap.size} document(s)…`);
  for (const docSnap of docsSnap.docs) {
    const data = docSnap.data();
    const patch = {
      storagePath: remapPath(data.storagePath),
      updatedAt: serverTimestamp(),
    };
    if (data.thumbnailPath) {
      patch.thumbnailPath = remapPath(data.thumbnailPath);
    }
    await updateDoc(doc(db, "vehicles", VEHICLE_ID, "documents", docSnap.id), patch);
    console.log("  doc", docSnap.id);
  }

  const vehiclePatch = {
    userId: TO_USER,
    updatedAt: serverTimestamp(),
  };
  const vehicleSnap = await getDocs(collection(db, "vehicles"));
  const vehicleData = vehicleSnap.docs
    .find((d) => d.id === VEHICLE_ID)
    ?.data();
  if (vehicleData?.brandLogoPath) {
    vehiclePatch.brandLogoPath = remapPath(vehicleData.brandLogoPath);
  }

  console.log("Updating vehicle owner…");
  await updateDoc(doc(db, "vehicles", VEHICLE_ID), vehiclePatch);

  console.log("Removing old storage…");
  execSync(`gsutil -m rm -r "${FROM_PREFIX}"`, { stdio: "inherit" });

  console.log("Done. Honda Fit now belongs to", TO_USER);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
