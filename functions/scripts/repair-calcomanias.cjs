/**
 * Re-derives calcomania from verificacion documents for all vehicles (or one user).
 * Run: npm run repair:calcomanias (from functions/)
 * Optional: USER_ID=7e965827a55cc2f07aecdc095491 npm run repair:calcomanias
 */
const admin = require("firebase-admin");

function normalizeCalcomania(value) {
  if (value == null || value === "") return undefined;
  const raw = String(value).trim();
  if (raw === "0" || raw === "00" || raw === "1" || raw === "2") return raw;
  return undefined;
}

function indicatesExemption(raw) {
  if (raw.includes("sin restricción") || raw.includes("sin restriccion")) {
    return true;
  }
  if (/\bno\s+exento\b/.test(raw)) return false;
  if (/\bno\s+(?:es|est[aá]?|cumple|aplica)\b[^.]{0,48}\bexento\b/.test(raw)) {
    return false;
  }
  return /\bexento\b/.test(raw);
}

function parseCalcomaniaFromHolograma(value) {
  if (value == null) return undefined;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return undefined;

  if (raw === "00" || raw.includes("doble cero") || raw.includes("doble-cero")) {
    return "00";
  }

  if (
    raw === "2" ||
    raw.includes("holograma 2") ||
    raw.includes("tipo 2") ||
    /holograma\s*[:.]?\s*2\b/.test(raw) ||
    /\bengomado\s*2\b/.test(raw) ||
    /\bcalcoman[ií]a\s*2\b/.test(raw)
  ) {
    return "2";
  }
  if (
    raw === "1" ||
    raw.includes("holograma 1") ||
    raw.includes("tipo 1") ||
    /holograma\s*[:.]?\s*1\b/.test(raw) ||
    /\bengomado\s*1\b/.test(raw) ||
    /\bcalcoman[ií]a\s*1\b/.test(raw)
  ) {
    return "1";
  }

  if (raw === "0" || (/^0\b/.test(raw) && !raw.startsWith("00"))) return "0";
  if (/^2\b/.test(raw) || /^2\s*[-–]/.test(raw)) return "2";
  if (/^1\b/.test(raw) || /^1\s*[-–]/.test(raw)) return "1";
  if (indicatesExemption(raw)) return "0";

  const digit = raw.replace(/\D/g, "");
  if (digit === "00") return "00";
  if (digit === "0") return "0";
  if (digit === "1") return "1";
  if (digit === "2") return "2";

  const trailing = raw.match(/(?:holograma|engomado|calcoman[ií]a)\s*[:.]?\s*([012])\b/);
  if (trailing?.[1] === "2") return "2";
  if (trailing?.[1] === "1") return "1";
  if (trailing?.[1] === "0") return "0";

  return undefined;
}

function resolveCalcomaniaFromVerificacionFields(fields) {
  const prioritized = [fields.holograma, fields.resultado];
  let zeroCandidate;

  for (const value of prioritized) {
    const parsed = parseCalcomaniaFromHolograma(value);
    if (!parsed) continue;
    if (parsed === "1" || parsed === "2" || parsed === "00") return parsed;
    zeroCandidate = "0";
  }

  for (const value of Object.values(fields)) {
    const parsed = parseCalcomaniaFromHolograma(value);
    if (parsed === "1" || parsed === "2" || parsed === "00") return parsed;
  }

  return zeroCandidate;
}

async function getLatestVerificacionDoc(db, vehicleId) {
  const snap = await db
    .collection("vehicles")
    .doc(vehicleId)
    .collection("documents")
    .where("detectedType", "==", "verificacion")
    .get();

  const ready = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((doc) => doc.data.status === "ready")
    .sort((a, b) => {
      const aTime = a.data.processedAt?.toMillis?.() ?? a.data.createdAt?.toMillis?.() ?? 0;
      const bTime = b.data.processedAt?.toMillis?.() ?? b.data.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

  return ready[0];
}

async function main() {
  const userId = process.env.USER_ID?.trim();
  admin.initializeApp({ projectId: "autos-fa58f" });
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  let query = db.collection("vehicles");
  if (userId) query = query.where("userId", "==", userId);
  const vehicles = await query.get();

  const report = { updated: [], unchanged: [], noVerificacion: [] };

  for (const vehicleDoc of vehicles.docs) {
    const vehicle = vehicleDoc.data();
    const verificacion = await getLatestVerificacionDoc(db, vehicleDoc.id);
    if (!verificacion) {
      report.noVerificacion.push({
        vehicleId: vehicleDoc.id,
        plate: vehicle.plate,
        alias: vehicle.alias,
        calcomania: vehicle.calcomania,
      });
      continue;
    }

    const fields = verificacion.data.extractedFields ?? {};
    const resolved = resolveCalcomaniaFromVerificacionFields(fields);
    const current = normalizeCalcomania(vehicle.calcomania);

    if (!resolved || resolved === current) {
      report.unchanged.push({
        vehicleId: vehicleDoc.id,
        plate: vehicle.plate,
        alias: vehicle.alias,
        calcomania: current,
        resolved,
        holograma: fields.holograma,
        resultado: fields.resultado,
      });
      continue;
    }

    await vehicleDoc.ref.update({ calcomania: resolved, updatedAt: now });
    report.updated.push({
      vehicleId: vehicleDoc.id,
      plate: vehicle.plate,
      alias: vehicle.alias,
      from: current,
      to: resolved,
      holograma: fields.holograma,
      resultado: fields.resultado,
    });
    console.log(
      `Updated ${vehicle.alias ?? vehicle.plate}: ${current ?? "(vacío)"} -> ${resolved}`,
    );
  }

  console.log("\n--- Reporte ---");
  console.log(`Actualizados: ${report.updated.length}`);
  console.log(`Sin cambio: ${report.unchanged.length}`);
  console.log(`Sin verificación: ${report.noVerificacion.length}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
