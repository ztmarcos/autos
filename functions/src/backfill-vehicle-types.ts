import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { fetchCasinAutosPayload } from "./casin-autos-sync";
import type { CasinAutoRecord } from "./casin-autos-map";
import { resolveVehicleType, type VehicleType } from "./no-circula";

export interface BackfillVehicleTypesResult {
  scanned: number;
  updated: number;
  setMoto: number;
  setAuto: number;
  clearedCalcomania: number;
}

function resolveTypeForVehicle(
  data: Record<string, unknown>,
  casinById: Map<string, CasinAutoRecord>,
): VehicleType {
  const casinAutoId = data.casinAutoId as string | undefined;
  const casinRecord = casinAutoId ? casinById.get(casinAutoId) : undefined;

  if (casinRecord) {
    return resolveVehicleType(
      casinRecord.tipo_de_vehiculo,
      casinRecord.descripcion_del_vehiculo,
    );
  }

  return resolveVehicleType(
    data.tipo as string | undefined,
    [data.alias, data.brand].filter(Boolean).join(" "),
  );
}

export async function backfillVehicleTypes(
  db: Firestore,
): Promise<BackfillVehicleTypesResult> {
  const payload = await fetchCasinAutosPayload();
  const casinById = new Map(payload.data.map((record) => [record.id, record]));
  const vehiclesSnap = await db.collection("vehicles").get();

  let updated = 0;
  let setMoto = 0;
  let setAuto = 0;
  let clearedCalcomania = 0;

  for (const doc of vehiclesSnap.docs) {
    const data = doc.data();
    const currentType = data.vehicleType as string | undefined;
    const resolvedType = resolveTypeForVehicle(data, casinById);
    const patch: Record<string, unknown> = {};

    if (currentType !== resolvedType) {
      patch.vehicleType = resolvedType;
      if (resolvedType === "moto") setMoto += 1;
      else setAuto += 1;
    }

    if (resolvedType === "moto" && data.calcomania != null && data.calcomania !== "") {
      patch.calcomania = admin.firestore.FieldValue.delete();
      clearedCalcomania += 1;
    }

    if (Object.keys(patch).length === 0) continue;

    await doc.ref.update({
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    updated += 1;
  }

  return {
    scanned: vehiclesSnap.size,
    updated,
    setMoto,
    setAuto,
    clearedCalcomania,
  };
}
