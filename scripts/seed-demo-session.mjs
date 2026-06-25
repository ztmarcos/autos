/**
 * Seeds demo-carcontrol user + vehicles from fleet table sample.
 * Run: node scripts/seed-demo-session.mjs
 */
import admin from "firebase-admin";

const DEMO_USER_ID = "demo-carcontrol";

const DEMO_VEHICLES = [
  {
    alias: "Mercedes ML 63 AMG",
    plate: "G96AAW",
    state: "CDMX",
    niv: "4JGDA7EBXFA453008",
    cylinders: 8,
    currentKm: 78420,
    verificationDate: "2026-08-15",
    tenenciaDate: "2026-03-01",
    serviceDate: "2026-01-10",
    serviceKm: 76000,
  },
  {
    alias: "BMW 120i Sport Line",
    plate: "AZM5139",
    state: "CDMX",
    niv: "WBA2W3106KMJ53210",
    cylinders: 4,
    currentKm: 42180,
    verificationDate: "2026-11-20",
    tenenciaDate: "2026-04-15",
    serviceDate: "2025-12-05",
    serviceKm: 40000,
  },
  {
    alias: "VW Vento Startline",
    plate: "X76AYS",
    state: "CDMX",
    niv: "MEX512603KT030091",
    cylinders: 4,
    currentKm: 55300,
    verificationDate: "2026-06-30",
    tenenciaDate: "2026-02-28",
    serviceDate: "2026-02-01",
    serviceKm: 54000,
  },
];

admin.initializeApp({ projectId: "autos-fa58f" });
const db = admin.firestore();

async function main() {
  const userRef = db.collection("users").doc(DEMO_USER_ID);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({
      email: "demo@carcontrol.app",
      displayName: "Demo",
      preferences: {
        emailEnabled: false,
        weeklySummary: false,
        monthlyReport: false,
        localNotifications: true,
        calendarSync: false,
        pushEnabled: false,
        defaultReminderDays: [7, 1],
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("Created demo user profile");
  } else {
    console.log("Demo user profile already exists");
  }

  const existing = await db
    .collection("vehicles")
    .where("userId", "==", DEMO_USER_ID)
    .get();

  if (!existing.empty) {
    console.log(`Demo already has ${existing.size} vehicle(s), skipping seed`);
    return;
  }

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const vehicle of DEMO_VEHICLES) {
    const ref = db.collection("vehicles").doc();
    batch.set(ref, {
      ...vehicle,
      userId: DEMO_USER_ID,
      reminderDays: [7, 1],
      localNotifications: true,
      calendarSync: false,
      includeInEmail: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Queued ${vehicle.alias} (${vehicle.plate})`);
  }

  await batch.commit();
  console.log(`Seeded ${DEMO_VEHICLES.length} demo vehicles`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
