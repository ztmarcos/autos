/**
 * Seeds demo-carcontrol user + vehicles from fleet table sample.
 * Run: npm run seed:demo (from functions/)
 */
const admin = require("firebase-admin");

const DEMO_USER_ID = "demo-carcontrol";

const DEMO_VEHICLES = [
  {
    alias: "Mercedes ML 63 AMG",
    plate: "G96AAW",
    state: "CDMX",
    niv: "4JGDA7EBXFA453008",
    brand: "MERCEDES BENZ",
    cylinders: 8,
    modelYear: 2015,
    currentKm: 78420,
    verificationDate: "2026-08-15",
    tenenciaDate: "2026-03-01",
    serviceDate: "2026-01-10",
    serviceKm: 76000,
    insuranceExpiryDate: "23/12/2026",
    calcomania: "1",
  },
  {
    alias: "BMW 120i Sport Line",
    plate: "AZM5139",
    state: "CDMX",
    niv: "WBA2W3106KMJ53210",
    brand: "BMW",
    cylinders: 4,
    modelYear: 2019,
    currentKm: 42180,
    verificationDate: "2026-11-20",
    tenenciaDate: "2026-04-15",
    serviceDate: "2025-12-05",
    serviceKm: 40000,
    insuranceExpiryDate: "05/11/2026",
    calcomania: "1",
  },
  {
    alias: "VW Vento Startline",
    plate: "X76AYS",
    state: "CDMX",
    niv: "MEX512603KT030091",
    brand: "VOLKSWAGEN",
    cylinders: 4,
    modelYear: 2019,
    currentKm: 55300,
    verificationDate: "2026-06-30",
    tenenciaDate: "2026-02-28",
    serviceDate: "2026-02-01",
    serviceKm: 54000,
    insuranceExpiryDate: "01/10/2026",
    calcomania: "1",
  },
  {
    alias: "Audi A3 35 TFSI Dynamic",
    plate: "U90BLP",
    state: "CDMX",
    niv: "WAUAYEGY6PA115712",
    brand: "AUDI",
    cylinders: 4,
    modelYear: 2023,
    currentKm: 28400,
    verificationDate: "2027-06-25",
    tenenciaDate: "2026-03-01",
    serviceDate: "2026-01-15",
    serviceKm: 27000,
    insuranceExpiryDate: "25/06/2026",
    calcomania: "1",
  },
  {
    alias: "Mercedes ML 350 Lujo",
    plate: "320WLF",
    state: "CDMX",
    niv: "4JGBB86E09A475509",
    brand: "MERCEDES BENZ",
    cylinders: 6,
    modelYear: 2009,
    currentKm: 142800,
    verificationDate: "2026-08-08",
    tenenciaDate: "2026-03-01",
    serviceDate: "2025-11-20",
    serviceKm: 141000,
    insuranceExpiryDate: "08/08/2026",
    calcomania: "2",
  },
  {
    alias: "BMW X3 2.5i",
    plate: "T89ARX",
    state: "CDMX",
    niv: "WBAPA71066WB15419",
    brand: "BMW",
    cylinders: 6,
    modelYear: 2006,
    currentKm: 198500,
    verificationDate: "2026-11-21",
    tenenciaDate: "2026-02-28",
    serviceDate: "2025-10-10",
    serviceKm: 196000,
    insuranceExpiryDate: "21/11/2026",
    calcomania: "2",
  },
  {
    alias: "BMW 135i M Sport",
    plate: "182YCB",
    state: "CDMX",
    niv: "WBAUC9107CVM05059",
    brand: "BMW",
    cylinders: 6,
    modelYear: 2012,
    currentKm: 96700,
    verificationDate: "2027-01-31",
    tenenciaDate: "2026-04-15",
    serviceDate: "2025-12-20",
    serviceKm: 94000,
    insuranceExpiryDate: "31/01/2027",
    calcomania: "1",
  },
];

function normalizePlate(plate) {
  return String(plate).replace(/\s+/g, "").toUpperCase();
}

function matchesVehicle(data, template) {
  const dataNiv = String(data.niv ?? "").toUpperCase();
  const templateNiv = template.niv.toUpperCase();
  if (dataNiv && templateNiv) return dataNiv === templateNiv;

  const dataPlate = normalizePlate(String(data.plate ?? ""));
  const templatePlate = normalizePlate(template.plate);
  return Boolean(dataPlate && templatePlate && dataPlate === templatePlate);
}

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

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  let queued = 0;

  for (const vehicle of DEMO_VEHICLES) {
    const found = existing.docs.some((doc) => matchesVehicle(doc.data(), vehicle));
    if (found) continue;

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
    queued += 1;
    console.log(`Queued ${vehicle.alias} (${vehicle.plate})`);
  }

  if (queued === 0) {
    console.log(`Demo already has all ${DEMO_VEHICLES.length} vehicle(s)`);
    return;
  }

  await batch.commit();
  console.log(`Seeded ${queued} new demo vehicle(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
