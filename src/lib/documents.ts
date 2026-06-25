import {
  collection,
  deleteDoc,
  doc,
  deleteField,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
  Timestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  getBytes,
  deleteObject,
} from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions } from "@/lib/firebase";
import type { Vehicle, VehicleDocument } from "@/lib/types";
import type { VehicleCardFields } from "@/lib/vehicle-card-map";
import { getSchemaLabel } from "@/config/document-schemas";
import { parseVehicleDateLiteral } from "@/lib/dates";

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  return value;
}

function mapDocument(id: string, data: Record<string, unknown>): VehicleDocument {
  return {
    id,
    status: data.status as VehicleDocument["status"],
    storagePath: data.storagePath as string,
    thumbnailPath: data.thumbnailPath as string | undefined,
    mimeType: data.mimeType as string,
    fileName: data.fileName as string,
    displayName: data.displayName as string | undefined,
    detectedType: data.detectedType as VehicleDocument["detectedType"],
    detectedTypeLabel: data.detectedTypeLabel as string | undefined,
    confidence: data.confidence as number | undefined,
    extractedFields: data.extractedFields as VehicleDocument["extractedFields"],
    rawTextLength: data.rawTextLength as number | undefined,
    errorMessage: data.errorMessage as string | undefined,
    createdAt: toDate(data.createdAt as Timestamp),
    processedAt: data.processedAt ? toDate(data.processedAt as Timestamp) : undefined,
  };
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/xml",
  "application/xml",
];

export function isAcceptedFileType(mimeType: string): boolean {
  return ACCEPTED_TYPES.includes(mimeType) || mimeType.startsWith("image/");
}

export function resolveInsuranceExpiry(
  vehicle: Pick<Vehicle, "insuranceExpiryDate">,
  documents?: VehicleDocument[],
): string | undefined {
  const fromDoc = documents
    ? getInsuranceExpiryFromDocuments(documents)
    : undefined;
  if (fromDoc) return fromDoc;

  if (vehicle.insuranceExpiryDate?.trim()) {
    const parsed = parseVehicleDateLiteral(vehicle.insuranceExpiryDate);
    if (parsed) return parsed;
    return vehicle.insuranceExpiryDate.trim();
  }

  return undefined;
}

const POLIZA_EXPIRY_KEYS = ["vigencia_fin", "fecha_vencimiento", "vencimiento"] as const;

export function readPolizaExpiryFromFields(
  fields: Record<string, string | number | null> | undefined,
): string | undefined {
  if (!fields) return undefined;
  for (const key of POLIZA_EXPIRY_KEYS) {
    const value = fields[key];
    if (value == null) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    const parsed = parseVehicleDateLiteral(raw);
    if (parsed) return parsed;
  }
  return undefined;
}

export function getInsuranceExpiryFromDocuments(
  documents: VehicleDocument[],
): string | undefined {
  const polizas = documents
    .filter(
      (doc) => doc.detectedType === "poliza_seguro" && doc.status === "ready",
    )
    .sort(
      (a, b) =>
        (b.processedAt ?? b.createdAt).getTime() -
        (a.processedAt ?? a.createdAt).getTime(),
    );

  for (const poliza of polizas) {
    const expiry = readPolizaExpiryFromFields(poliza.extractedFields);
    if (expiry) return expiry;
  }

  return undefined;
}

export async function getInsuranceExpiryForVehicle(
  vehicleId: string,
): Promise<string | undefined> {
  const snap = await getDocs(
    collection(db, "vehicles", vehicleId, "documents"),
  );
  const docs = snap.docs.map((d) => mapDocument(d.id, d.data()));
  const expiry = getInsuranceExpiryFromDocuments(docs);
  if (expiry) {
    await updateDoc(doc(db, "vehicles", vehicleId), {
      insuranceExpiryDate: expiry,
    }).catch(() => {
      // El campo puede no existir aún en reglas antiguas del cliente.
    });
  }
  return expiry;
}

export async function getInsuranceExpiriesForVehicles(
  vehicles: Vehicle[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    vehicles.map(async (vehicle) => {
      const cached = resolveInsuranceExpiry(vehicle);
      if (cached) return [vehicle.id, cached] as const;
      const expiry = await getInsuranceExpiryForVehicle(vehicle.id);
      return expiry ? ([vehicle.id, expiry] as const) : null;
    }),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string] => entry !== null),
  );
}

export function subscribeToDocuments(
  vehicleId: string,
  callback: (docs: VehicleDocument[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "vehicles", vehicleId, "documents"), (snap) => {
    const docs = snap.docs
      .map((d) => mapDocument(d.id, d.data()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    callback(docs);
  });
}

export async function listDocumentsForVehicle(
  vehicleId: string,
): Promise<VehicleDocument[]> {
  const snap = await getDocs(collection(db, "vehicles", vehicleId, "documents"));
  return snap.docs
    .map((d) => mapDocument(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function resolveFileMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (/\.jpe?g$/i.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return file.type || "application/octet-stream";
}

export async function uploadCardDocument(
  userId: string,
  vehicleId: string,
  file: File,
  fields: VehicleCardFields & {
    fecha_expedicion?: string;
    fecha_vencimiento?: string;
  },
): Promise<string> {
  const docId = uuidv4();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `users/${userId}/vehicles/${vehicleId}/documents/${docId}/original.${ext}`;

  const extractedFields: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) extractedFields[key] = value;
  }

  await setDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    status: "uploading",
    storagePath,
    mimeType: resolveFileMimeType(file),
    fileName: file.name,
    displayName: "Tarjeta de circulación",
    detectedType: "tarjeta_circulacion",
    detectedTypeLabel: "Tarjeta de circulación",
    extractedFields,
    skipFullAnalysis: true,
    confidence: 1,
    createdAt: serverTimestamp(),
  });

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);

  await updateDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    status: "processing",
  });

  return docId;
}

export async function uploadDocument(
  userId: string,
  vehicleId: string,
  file: File,
  options?: { hintType?: VehicleDocument["detectedType"] },
): Promise<string> {
  const docId = uuidv4();
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `users/${userId}/vehicles/${vehicleId}/documents/${docId}/original.${ext}`;

  await setDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    status: "uploading",
    storagePath,
    mimeType: file.type || "application/octet-stream",
    fileName: file.name,
    createdAt: serverTimestamp(),
    ...(options?.hintType
      ? {
          detectedType: options.hintType,
          detectedTypeLabel: getSchemaLabel(options.hintType),
        }
      : {}),
  });

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);

  await updateDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    status: "processing",
  });

  return docId;
}

export async function upsertManualDocument(
  userId: string,
  vehicleId: string,
  type: VehicleDocument["detectedType"],
  displayName: string,
  extractedFields: Record<string, string | number | null>,
  existingDocId?: string,
): Promise<string> {
  if (!type) throw new Error("Document type required");

  if (existingDocId) {
    await updateDocumentFields(vehicleId, existingDocId, extractedFields);
    return existingDocId;
  }

  const docId = uuidv4();
  await setDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    status: "ready",
    storagePath: `users/${userId}/vehicles/${vehicleId}/documents/${docId}/manual.json`,
    mimeType: "application/json",
    fileName: "manual-entry.json",
    displayName,
    detectedType: type,
    detectedTypeLabel: displayName,
    extractedFields,
    confidence: 1,
    createdAt: serverTimestamp(),
    processedAt: serverTimestamp(),
  });
  return docId;
}

export async function updateDocumentFields(
  vehicleId: string,
  docId: string,
  fields: Record<string, string | number | null>,
): Promise<void> {
  await updateDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    extractedFields: fields,
  });
}

export async function renameDocument(
  vehicleId: string,
  docId: string,
  displayName: string,
): Promise<void> {
  const trimmed = displayName.trim();
  await updateDoc(doc(db, "vehicles", vehicleId, "documents", docId), {
    displayName: trimmed ? trimmed : deleteField(),
  });
}

export async function deleteDocument(
  vehicleId: string,
  document: VehicleDocument,
): Promise<void> {
  const paths = new Set<string>([document.storagePath]);
  if (document.thumbnailPath && document.thumbnailPath !== document.storagePath) {
    paths.add(document.thumbnailPath);
  }

  await Promise.all(
    [...paths].map(async (path) => {
      try {
        await deleteObject(ref(storage, path));
      } catch {
        // El archivo puede no existir si la subida falló a medias.
      }
    }),
  );

  await deleteDoc(doc(db, "vehicles", vehicleId, "documents", document.id));
}

export async function getDocumentDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

export async function getDocumentBytes(path: string): Promise<ArrayBuffer> {
  return getBytes(ref(storage, path));
}

export function getDocumentLabel(doc: VehicleDocument): string {
  if (doc.displayName?.trim()) return doc.displayName.trim();
  if (doc.detectedTypeLabel) return doc.detectedTypeLabel;
  if (doc.detectedType) return getSchemaLabel(doc.detectedType);
  if (doc.status === "processing" || doc.status === "uploading") return "Analizando…";
  if (doc.status === "error") return "Error";
  return "Documento";
}

export function isPdfDocument(doc: VehicleDocument): boolean {
  return (
    doc.mimeType === "application/pdf" ||
    doc.storagePath.toLowerCase().endsWith(".pdf")
  );
}

function isImageThumbnailPath(path: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(path);
}

function pdfThumbStoragePath(storagePath: string): string {
  return storagePath.replace(/original\.[^/]+$/, "thumb.jpg");
}

function pdfFirstPageStoragePath(storagePath: string): string {
  return storagePath.replace(/original\.[^/]+$/, "pages/page-001.jpg");
}

async function tryStorageUrl(path: string): Promise<string | null> {
  try {
    return await getDownloadURL(ref(storage, path));
  } catch {
    return null;
  }
}

async function ensurePdfThumbnailOnServer(storagePath: string): Promise<string | null> {
  try {
    const call = httpsCallable<{ storagePath: string }, { thumbnailPath: string }>(
      functions,
      "ensurePdfThumbnail",
      { timeout: 60_000 },
    );
    const { data } = await call({ storagePath });
    if (!data.thumbnailPath) return null;
    return tryStorageUrl(data.thumbnailPath);
  } catch {
    return null;
  }
}

export async function getThumbnailUrl(doc: VehicleDocument): Promise<string | null> {
  const pathsToTry: string[] = [];
  if (doc.thumbnailPath && isImageThumbnailPath(doc.thumbnailPath)) {
    pathsToTry.push(doc.thumbnailPath);
  }
  if (isPdfDocument(doc)) {
    pathsToTry.push(pdfThumbStoragePath(doc.storagePath));
    pathsToTry.push(pdfFirstPageStoragePath(doc.storagePath));
  }

  for (const path of pathsToTry) {
    const url = await tryStorageUrl(path);
    if (url) return url;
  }

  if (isPdfDocument(doc)) {
    return ensurePdfThumbnailOnServer(doc.storagePath);
  }

  return null;
}

export function isPhoneFieldKey(key: string): boolean {
  return key.startsWith("telefono_");
}
