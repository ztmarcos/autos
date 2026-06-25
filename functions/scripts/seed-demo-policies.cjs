/**
 * Seeds GNP policy PDFs for demo-carcontrol vehicles.
 * Run: npm run seed:demo-policies (from functions/)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("firebase-admin");

const DEMO_USER_ID = "demo-carcontrol";
const BUCKET = "autos-fa58f.firebasestorage.app";
const POLICIES_DIR = path.resolve(__dirname, "../../scripts/demo-policies");
const MANIFEST_PATH = path.join(POLICIES_DIR, "manifest.json");

function parseExpiryDate(value) {
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  return new Date(year, month - 1, day);
}

function isExpired(vigenciaFin, today = new Date()) {
  const expiry = parseExpiryDate(vigenciaFin);
  if (!expiry) return false;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return expiry < startOfToday;
}

function normalizePlate(plate) {
  return String(plate).replace(/\s+/g, "").toUpperCase();
}

function matchesVehicle(data, template) {
  const dataNiv = String(data.niv ?? "").toUpperCase();
  const templateNiv = String(template.niv).toUpperCase();
  if (dataNiv && templateNiv) return dataNiv === templateNiv;

  const dataPlate = normalizePlate(String(data.plate ?? ""));
  const templatePlate = normalizePlate(template.plate);
  return Boolean(dataPlate && templatePlate && dataPlate === templatePlate);
}

function policyBelongsToVehicle(fields, vehicle) {
  if (!fields) return false;

  const fieldNiv = String(fields.niv ?? "").toUpperCase();
  const vehicleNiv = String(vehicle.niv ?? "").toUpperCase();
  if (fieldNiv && vehicleNiv) return fieldNiv === vehicleNiv;

  const fieldPlate = normalizePlate(String(fields.placa ?? ""));
  const vehiclePlate = normalizePlate(String(vehicle.plate ?? ""));
  if (fieldPlate && vehiclePlate) return fieldPlate === vehiclePlate;

  return false;
}

function readPolicyNumber(fields) {
  return String(fields?.no_poliza ?? "").trim();
}

function buildExtractedFields(policy, manifest) {
  return {
    aseguradora: manifest.aseguradora,
    no_poliza: policy.no_poliza,
    nombre_asegurado: policy.nombre_asegurado,
    placa: policy.plate,
    niv: policy.niv,
    marca: policy.marca,
    submarca: policy.submarca,
    modelo: policy.modelo,
    anio: policy.anio,
    vigencia_inicio: policy.vigencia_inicio,
    vigencia_fin: policy.vigencia_fin,
    cobertura_responsabilidad: policy.cobertura_responsabilidad,
    telefono_asistencia: manifest.telefono_asistencia,
    telefono_siniestros: manifest.telefono_siniestros,
    telefono_atencion: manifest.telefono_atencion,
  };
}

async function renderPdfThumbnail(buffer) {
  try {
    const { pdf } = await import("pdf-to-img");
    const document = await pdf(buffer, { scale: 1.5 });
    for await (const page of document) {
      return Buffer.from(page);
    }
  } catch (err) {
    console.warn("Thumbnail generation failed:", err.message);
  }
  return null;
}

async function findDemoVehicle(db, policy) {
  const snap = await db
    .collection("vehicles")
    .where("userId", "==", DEMO_USER_ID)
    .get();

  return (
    snap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .find((vehicle) => matchesVehicle(vehicle.data, policy)) ?? null
  );
}

async function deleteDemoPolicyDocument(db, bucket, vehicleId, docSnap) {
  const data = docSnap.data();
  const paths = new Set();
  if (data.storagePath) paths.add(data.storagePath);
  if (data.thumbnailPath && data.thumbnailPath !== data.storagePath) {
    paths.add(data.thumbnailPath);
  }

  await Promise.all(
    [...paths].map(async (storagePath) => {
      try {
        await bucket.file(storagePath).delete();
      } catch {
        // El archivo puede no existir.
      }
    }),
  );

  await db
    .collection("vehicles")
    .doc(vehicleId)
    .collection("documents")
    .doc(docSnap.id)
    .delete();
}

async function removeForeignDemoPolicies(db, bucket, manifest) {
  const vehicles = await db
    .collection("vehicles")
    .where("userId", "==", DEMO_USER_ID)
    .get();

  const templatesByNo = new Map(
    manifest.policies.map((policy) => [policy.no_poliza, policy]),
  );

  for (const vehicleDoc of vehicles.docs) {
    const vehicle = vehicleDoc.data();
    const docs = await vehicleDoc.ref
      .collection("documents")
      .where("detectedType", "==", "poliza_seguro")
      .get();

    for (const docSnap of docs.docs) {
      const fields = docSnap.data().extractedFields ?? {};
      const noPoliza = readPolicyNumber(fields);
      const template = templatesByNo.get(noPoliza);
      const belongs =
        template != null
          ? matchesVehicle(vehicle, template)
          : policyBelongsToVehicle(fields, vehicle);

      if (belongs) continue;
      await deleteDemoPolicyDocument(db, bucket, vehicleDoc.id, docSnap);
      console.log(
        `Removed misplaced policy ${noPoliza || docSnap.id} from ${vehicle.alias ?? vehicle.plate}`,
      );
    }
  }
}

async function policyAlreadySeeded(db, vehicleId, noPoliza) {
  const snap = await db
    .collection("vehicles")
    .doc(vehicleId)
    .collection("documents")
    .where("detectedType", "==", "poliza_seguro")
    .get();

  return snap.docs.some((doc) => {
    const fields = doc.data().extractedFields ?? {};
    return String(fields.no_poliza ?? "").trim() === noPoliza;
  });
}

async function seedPolicy(db, bucket, vehicle, policy, manifest) {
  const filePath = path.join(POLICIES_DIR, policy.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing PDF: ${policy.file}`);
  }

  const docId = crypto.randomUUID();
  const storagePath = `users/${DEMO_USER_ID}/vehicles/${vehicle.id}/documents/${docId}/original.pdf`;
  const thumbPath = `users/${DEMO_USER_ID}/vehicles/${vehicle.id}/documents/${docId}/thumb.jpg`;
  const buffer = fs.readFileSync(filePath);
  const extractedFields = buildExtractedFields(policy, manifest);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await bucket.file(storagePath).save(buffer, {
    metadata: { contentType: "application/pdf" },
  });

  const thumbBuffer = await renderPdfThumbnail(buffer);
  if (thumbBuffer) {
    await bucket.file(thumbPath).save(thumbBuffer, {
      metadata: { contentType: "image/jpeg" },
    });
  }

  await db
    .collection("vehicles")
    .doc(vehicle.id)
    .collection("documents")
    .doc(docId)
    .set({
      status: "ready",
      storagePath,
      ...(thumbBuffer ? { thumbnailPath: thumbPath } : {}),
      mimeType: "application/pdf",
      fileName: policy.file,
      displayName: "Póliza de seguro",
      detectedType: "poliza_seguro",
      detectedTypeLabel: "Póliza de seguro",
      extractedFields,
      confidence: 1,
      skipFullAnalysis: true,
      createdAt: now,
      processedAt: now,
    });

  const vehiclePatch = {
    insuranceExpiryDate: policy.vigencia_fin,
    updatedAt: now,
  };
  if (!vehicle.data.brand) vehiclePatch.brand = policy.marca;
  if (!vehicle.data.modelYear) vehiclePatch.modelYear = policy.anio;

  await db.collection("vehicles").doc(vehicle.id).update(vehiclePatch);

  return docId;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const report = {
    seeded: [],
    skippedDuplicate: [],
    skippedExpired: [],
    skippedNoVehicle: [],
    skippedAlreadyExists: [],
    duplicatesRemoved: manifest.duplicatesRemoved ?? [],
  };

  admin.initializeApp({ projectId: "autos-fa58f" });
  const db = admin.firestore();
  const bucket = admin.storage().bucket(BUCKET);

  await removeForeignDemoPolicies(db, bucket, manifest);

  for (const policy of manifest.policies) {
    if (isExpired(policy.vigencia_fin)) {
      report.skippedExpired.push({
        no_poliza: policy.no_poliza,
        plate: policy.plate,
        vigencia_fin: policy.vigencia_fin,
        demoVehicle: policy.demoVehicle,
      });
      continue;
    }

    const vehicle = await findDemoVehicle(db, policy);
    if (!vehicle) {
      report.skippedNoVehicle.push({
        no_poliza: policy.no_poliza,
        plate: policy.plate,
        demoVehicle: policy.demoVehicle,
        reason: "demo_vehicle_not_found_in_firestore",
      });
      continue;
    }

    if (await policyAlreadySeeded(db, vehicle.id, policy.no_poliza)) {
      report.skippedAlreadyExists.push({
        no_poliza: policy.no_poliza,
        plate: policy.plate,
        demoVehicle: policy.demoVehicle,
      });
      continue;
    }

    const docId = await seedPolicy(db, bucket, vehicle, policy, manifest);
    report.seeded.push({
      no_poliza: policy.no_poliza,
      plate: policy.plate,
      demoVehicle: policy.demoVehicle,
      vehicleId: vehicle.id,
      documentId: docId,
      vigencia_fin: policy.vigencia_fin,
    });
    console.log(`Seeded ${policy.demoVehicle} ← ${policy.file}`);
  }

  console.log("\n--- Reporte ---");
  console.log(`Importadas: ${report.seeded.length}`);
  console.log(`Duplicados eliminados del disco: ${report.duplicatesRemoved.length}`);
  console.log(`Omitidas (sin auto demo): ${report.skippedNoVehicle.length}`);
  console.log(`Omitidas (vencidas): ${report.skippedExpired.length}`);
  console.log(`Omitidas (ya existían): ${report.skippedAlreadyExists.length}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
