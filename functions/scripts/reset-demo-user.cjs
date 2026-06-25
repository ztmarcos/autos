/**
 * Clears demo notifications, notified_state_news, and syncs calcomania from fleet template.
 * Run: npm run reset:demo (from functions/)
 */
const admin = require("firebase-admin");

const DEMO_USER_ID = "demo-carcontrol";
const BATCH_SIZE = 400;

const DEMO_VEHICLES = [
  { plate: "G96AAW", niv: "4JGDA7EBXFA453008", calcomania: "1" },
  { plate: "AZM5139", niv: "WBA2W3106KMJ53210", calcomania: "1" },
  { plate: "X76AYS", niv: "MEX512603KT030091", calcomania: "1" },
  { plate: "U90BLP", niv: "WAUAYEGY6PA115712", calcomania: "1" },
  { plate: "320WLF", niv: "4JGBB86E09A475509", calcomania: "2" },
  { plate: "T89ARX", niv: "WBAPA71066WB15419", calcomania: "2" },
  { plate: "182YCB", niv: "WBAUC9107CVM05059", calcomania: "1" },
];

function normalizePlate(plate) {
  return String(plate).replace(/\s+/g, "").toUpperCase();
}

function findTemplate(data) {
  const dataNiv = String(data.niv ?? "").toUpperCase();
  const dataPlate = normalizePlate(String(data.plate ?? ""));

  return DEMO_VEHICLES.find((template) => {
    if (dataNiv && dataNiv === template.niv.toUpperCase()) return true;
    return dataPlate && dataPlate === normalizePlate(template.plate);
  });
}

admin.initializeApp({ projectId: "autos-fa58f" });
const db = admin.firestore();

async function deleteQueryBatch(query) {
  const snap = await query.get();
  if (snap.empty) return 0;

  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

async function main() {
  const notificationsDeleted = await deleteQueryBatch(
    db.collection("notifications").where("userId", "==", DEMO_USER_ID),
  );
  console.log(`Deleted ${notificationsDeleted} notification(s)`);

  const notifiedDeleted = await deleteQueryBatch(
    db.collection("notified_state_news").where("userId", "==", DEMO_USER_ID),
  );
  console.log(`Deleted ${notifiedDeleted} notified_state_news record(s)`);

  const vehicles = await db
    .collection("vehicles")
    .where("userId", "==", DEMO_USER_ID)
    .get();

  const now = admin.firestore.FieldValue.serverTimestamp();
  let vehiclesUpdated = 0;
  for (const vehicleDoc of vehicles.docs) {
    const data = vehicleDoc.data();
    const template = findTemplate(data);
    if (!template || data.calcomania === template.calcomania) continue;
    await vehicleDoc.ref.update({
      calcomania: template.calcomania,
      updatedAt: now,
    });
    vehiclesUpdated += 1;
    console.log(
      `Set calcomania ${template.calcomania} on ${data.alias ?? data.plate}`,
    );
  }

  console.log(`Updated ${vehiclesUpdated} vehicle(s)`);
  console.log("Demo user reset complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
