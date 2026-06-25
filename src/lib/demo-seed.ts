import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { db, storage } from "@/lib/firebase";
import { DEMO_USER_ID } from "@/lib/auth";
import type { Calcomania } from "@/lib/types";
import { syncBrandLogosForVehicles } from "@/lib/brand-logo";
import { listVehicles } from "@/lib/vehicles";
import { getSchemaLabel } from "@/config/document-schemas";
import { deleteUserNotifications } from "@/lib/notifications";

const DEMO_ASEGURADORA = {
  aseguradora: "GNP",
  telefono_asistencia: "55 5227 9000",
  telefono_siniestros: "55 5227 9000",
  telefono_atencion: "55 5227 9000",
} as const;

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
    calcomania: "1" as Calcomania,
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
    calcomania: "1" as Calcomania,
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
    calcomania: "1" as Calcomania,
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
    calcomania: "1" as Calcomania,
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
    calcomania: "2" as Calcomania,
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
    calcomania: "2" as Calcomania,
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
    calcomania: "1" as Calcomania,
  },
] as const;

const DEMO_POLICIES = [
  {
    file: "poliza_00000707864633_0.pdf",
    no_poliza: "00000707864633",
    plate: "G96AAW",
    niv: "4JGDA7EBXFA453008",
    nombre_asegurado: "ZAVALA ABOGADOS, S.C.",
    marca: "MERCEDES BENZ",
    submarca: "ML 63 AMG",
    modelo: "ML 63 AMG",
    anio: 2015,
    vigencia_inicio: "23/12/2025",
    vigencia_fin: "23/12/2026",
    cobertura_responsabilidad: "Amplia",
  },
  {
    file: "poliza_00000698783842_0.pdf",
    no_poliza: "00000698783842",
    plate: "AZM5139",
    niv: "WBA2W3106KMJ53210",
    nombre_asegurado: "Zavala Abogados S.C",
    marca: "BMW",
    submarca: "120I SPORT LINE",
    modelo: "120I",
    anio: 2019,
    vigencia_inicio: "05/11/2025",
    vigencia_fin: "05/11/2026",
    cobertura_responsabilidad: "Amplia",
  },
  {
    file: "poliza_00000688694900_0.pdf",
    no_poliza: "00000688694900",
    plate: "X76AYS",
    niv: "MEX512603KT030091",
    nombre_asegurado: "Zavala Abogados S.C",
    marca: "VOLKSWAGEN",
    submarca: "VENTO STARTLINE",
    modelo: "VENTO",
    anio: 2019,
    vigencia_inicio: "01/10/2025",
    vigencia_fin: "01/10/2026",
    cobertura_responsabilidad: "Amplia",
  },
  {
    file: "poliza_00000676382518_0.pdf",
    no_poliza: "00000676382518",
    plate: "U90BLP",
    niv: "WAUAYEGY6PA115712",
    nombre_asegurado: "Mario Alberto Zavala Diaz",
    marca: "AUDI",
    submarca: "A3 35 TFSI DYNAMIC",
    modelo: "A3",
    anio: 2023,
    vigencia_inicio: "25/06/2025",
    vigencia_fin: "25/06/2026",
    cobertura_responsabilidad: "Amplia",
  },
  {
    file: "poliza_00000682971023_0.pdf",
    no_poliza: "00000682971023",
    plate: "320WLF",
    niv: "4JGBB86E09A475509",
    nombre_asegurado: "Mario Alberto Zavala Diaz",
    marca: "MERCEDES BENZ",
    submarca: "ML 350 LUJO SPORT",
    modelo: "ML 350",
    anio: 2009,
    vigencia_inicio: "08/08/2025",
    vigencia_fin: "08/08/2026",
    cobertura_responsabilidad: "Amplia",
  },
  {
    file: "poliza_00000698783867_0.pdf",
    no_poliza: "00000698783867",
    plate: "T89ARX",
    niv: "WBAPA71066WB15419",
    nombre_asegurado: "Mario Alberto Zavala Diaz",
    marca: "BMW",
    submarca: "X3 2.51 AUT TOP",
    modelo: "X3",
    anio: 2006,
    vigencia_inicio: "21/11/2025",
    vigencia_fin: "21/11/2026",
    cobertura_responsabilidad: "Amplia",
  },
  {
    file: "poliza_00000710644188_0.pdf",
    no_poliza: "00000710644188",
    plate: "182YCB",
    niv: "WBAUC9107CVM05059",
    nombre_asegurado: "Mario Alberto Zavala Diaz",
    marca: "BMW",
    submarca: "135I COUPE M SPORT",
    modelo: "135I",
    anio: 2012,
    vigencia_inicio: "31/01/2026",
    vigencia_fin: "31/01/2027",
    cobertura_responsabilidad: "Amplia",
  },
] as const;

function normalizePlate(plate: string): string {
  return plate.replace(/\s+/g, "").toUpperCase();
}

function matchesVehicle(
  data: { plate?: string; niv?: string },
  template: { plate: string; niv: string },
): boolean {
  const dataNiv = String(data.niv ?? "").toUpperCase();
  const templateNiv = template.niv.toUpperCase();
  if (dataNiv && templateNiv) return dataNiv === templateNiv;

  const dataPlate = normalizePlate(String(data.plate ?? ""));
  const templatePlate = normalizePlate(template.plate);
  return Boolean(dataPlate && templatePlate && dataPlate === templatePlate);
}

function policyBelongsToVehicle(
  fields: Record<string, string | number | null> | undefined,
  vehicle: { plate?: string; niv?: string },
): boolean {
  if (!fields) return false;

  const fieldNiv = String(fields.niv ?? "").toUpperCase();
  const vehicleNiv = String(vehicle.niv ?? "").toUpperCase();
  if (fieldNiv && vehicleNiv) return fieldNiv === vehicleNiv;

  const fieldPlate = normalizePlate(String(fields.placa ?? ""));
  const vehiclePlate = normalizePlate(String(vehicle.plate ?? ""));
  if (fieldPlate && vehiclePlate) return fieldPlate === vehiclePlate;

  return false;
}

function readPolicyNumber(
  fields: Record<string, string | number | null> | undefined,
): string {
  return String(fields?.no_poliza ?? "").trim();
}

function parseExpiryDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  return new Date(year, month - 1, day);
}

function isPolicyExpired(vigenciaFin: string): boolean {
  const expiry = parseExpiryDate(vigenciaFin);
  if (!expiry) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
}

function buildPolicyFields(
  policy: (typeof DEMO_POLICIES)[number],
): Record<string, string | number | null> {
  return {
    ...DEMO_ASEGURADORA,
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
  };
}

async function deleteDemoPolicyDocument(
  vehicleId: string,
  docSnap: QueryDocumentSnapshot,
): Promise<void> {
  const data = docSnap.data();
  const paths = new Set<string>();
  if (typeof data.storagePath === "string" && data.storagePath) {
    paths.add(data.storagePath);
  }
  if (
    typeof data.thumbnailPath === "string" &&
    data.thumbnailPath &&
    data.thumbnailPath !== data.storagePath
  ) {
    paths.add(data.thumbnailPath);
  }

  await Promise.all(
    [...paths].map(async (storagePath) => {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch {
        // El archivo puede no existir si la subida falló a medias.
      }
    }),
  );

  await deleteDoc(doc(db, "vehicles", vehicleId, "documents", docSnap.id));
}

async function removeForeignDemoPolicies(
  vehicleDocs: QueryDocumentSnapshot[],
): Promise<void> {
  for (const vehicleDoc of vehicleDocs) {
    const vehicle = vehicleDoc.data();
    const docsSnap = await getDocs(
      collection(db, "vehicles", vehicleDoc.id, "documents"),
    );

    for (const docSnap of docsSnap.docs) {
      const data = docSnap.data();
      if (data.detectedType !== "poliza_seguro") continue;

      const fields = data.extractedFields as
        | Record<string, string | number | null>
        | undefined;
      const noPoliza = readPolicyNumber(fields);
      const template = DEMO_POLICIES.find((policy) => policy.no_poliza === noPoliza);

      const belongs =
        template != null
          ? matchesVehicle(vehicle, template)
          : policyBelongsToVehicle(fields, vehicle);

      if (belongs) continue;
      await deleteDemoPolicyDocument(vehicleDoc.id, docSnap);
    }
  }
}

async function uploadDemoPolicy(
  vehicleId: string,
  file: File,
  extractedFields: Record<string, string | number | null>,
): Promise<void> {
  const docId = uuidv4();
  const storagePath = `users/${DEMO_USER_ID}/vehicles/${vehicleId}/documents/${docId}/original.pdf`;

  await setDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    status: "uploading",
    storagePath,
    mimeType: "application/pdf",
    fileName: file.name,
    displayName: "Póliza de seguro",
    detectedType: "poliza_seguro",
    detectedTypeLabel: getSchemaLabel("poliza_seguro"),
    extractedFields,
    skipFullAnalysis: true,
    confidence: 1,
    createdAt: serverTimestamp(),
  });

  await uploadBytes(ref(storage, storagePath), file);
  await updateDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    status: "processing",
  });
}

export async function seedDemoVehiclesIfNeeded(): Promise<void> {
  const existing = await getDocs(
    query(collection(db, "vehicles"), where("userId", "==", DEMO_USER_ID)),
  );

  const existingByKey = new Map(
    existing.docs.map((vehicleDoc) => {
      const data = vehicleDoc.data();
      const key =
        String(data.niv ?? "").toUpperCase() ||
        normalizePlate(String(data.plate ?? ""));
      return [key, vehicleDoc] as const;
    }),
  );

  const missing = DEMO_VEHICLES.filter((template) => {
    const byNiv = existingByKey.get(template.niv.toUpperCase());
    if (byNiv && matchesVehicle(byNiv.data(), template)) return false;
    for (const vehicleDoc of existing.docs) {
      if (matchesVehicle(vehicleDoc.data(), template)) return false;
    }
    return true;
  });

  if (missing.length > 0) {
    await Promise.all(
      missing.map((vehicle) =>
        addDoc(collection(db, "vehicles"), {
          ...vehicle,
          userId: DEMO_USER_ID,
          reminderDays: [7, 1],
          localNotifications: true,
          calendarSync: false,
          includeInEmail: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ),
    );
  }

  if (existing.empty && missing.length === DEMO_VEHICLES.length) return;

  const refreshed = missing.length > 0
    ? await getDocs(
        query(collection(db, "vehicles"), where("userId", "==", DEMO_USER_ID)),
      )
    : existing;

  await Promise.all(
    refreshed.docs.map(async (vehicleDoc) => {
      const data = vehicleDoc.data();
      const template = DEMO_VEHICLES.find((vehicle) =>
        matchesVehicle(data, vehicle),
      );
      if (!template) return;

      const patch: Record<string, unknown> = {};
      if (!data.brand) patch.brand = template.brand;
      if (!data.modelYear) patch.modelYear = template.modelYear;
      if (!data.insuranceExpiryDate) {
        patch.insuranceExpiryDate = template.insuranceExpiryDate;
      }
      if (template.calcomania && data.calcomania !== template.calcomania) {
        patch.calcomania = template.calcomania;
      }

      if (Object.keys(patch).length === 0) return;
      patch.updatedAt = serverTimestamp();
      await updateDoc(vehicleDoc.ref, patch);
    }),
  );
}

export async function seedDemoPoliciesIfNeeded(): Promise<void> {
  const vehiclesSnap = await getDocs(
    query(collection(db, "vehicles"), where("userId", "==", DEMO_USER_ID)),
  );
  if (vehiclesSnap.empty) return;

  await removeForeignDemoPolicies(vehiclesSnap.docs);

  for (const policy of DEMO_POLICIES) {
    if (isPolicyExpired(policy.vigencia_fin)) continue;

    const vehicleDoc = vehiclesSnap.docs.find((vehicle) =>
      matchesVehicle(vehicle.data(), policy),
    );
    if (!vehicleDoc) continue;

    const docsSnap = await getDocs(
      collection(db, "vehicles", vehicleDoc.id, "documents"),
    );
    const alreadyExists = docsSnap.docs.some((docSnap) => {
      const fields = docSnap.data().extractedFields as
        | Record<string, string | number | null>
        | undefined;
      return readPolicyNumber(fields) === policy.no_poliza;
    });
    if (alreadyExists) continue;

    const response = await fetch(`/demo-policies/${policy.file}`);
    if (!response.ok) continue;

    const blob = await response.blob();
    const file = new File([blob], policy.file, { type: "application/pdf" });
    const extractedFields = buildPolicyFields(policy);

    await uploadDemoPolicy(vehicleDoc.id, file, extractedFields);
    await updateDoc(vehicleDoc.ref, {
      insuranceExpiryDate: policy.vigencia_fin,
      brand: vehicleDoc.data().brand ?? policy.marca,
      modelYear: vehicleDoc.data().modelYear ?? policy.anio,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function clearDemoNotifications(): Promise<void> {
  await deleteUserNotifications(DEMO_USER_ID);
}

export async function seedDemoSessionIfNeeded(): Promise<void> {
  await seedDemoVehiclesIfNeeded();
  await seedDemoPoliciesIfNeeded();
  await clearDemoNotifications();
  const vehicles = await listVehicles(DEMO_USER_ID);
  await syncBrandLogosForVehicles(vehicles);
}
