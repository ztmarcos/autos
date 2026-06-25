/**
 * Move Zontes from dev-carcontrol-local to casinseguros@gmail.com
 * Run: node scripts/migrate-zontes-casinseguros.cjs (from functions/)
 */
const { execSync } = require("child_process");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  serverTimestamp,
} = require("firebase/firestore");

const BUCKET = "autos-fa58f.firebasestorage.app";
const FROM_USER = "dev-carcontrol-local";
const TO_USER = "7e965827a55cc2f07aecdc095491";
const VEHICLE_ID = "Y5bOXTdQcn8XSvJqP5rB";

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
  const vehicleRef = doc(db, "vehicles", VEHICLE_ID);
  const vehicleSnap = await getDoc(vehicleRef);
  const vehicleData = vehicleSnap.data() ?? {};
  if (vehicleData?.brandLogoPath) {
    vehiclePatch.brandLogoPath = remapPath(vehicleData.brandLogoPath);
  }

  console.log("Updating vehicle owner…");
  await updateDoc(vehicleRef, vehiclePatch);

  console.log("Removing old storage…");
  execSync(`gsutil -m rm -r "${FROM_PREFIX}"`, { stdio: "inherit" });

  console.log("Done. Zontes now belongs to casinseguros@gmail.com", TO_USER);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
