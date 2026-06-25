import { httpsCallable } from "firebase/functions";
import { FirebaseError } from "firebase/app";
import { functions } from "@/lib/firebase";
import {
  mapCardFieldsToVehicle,
  type VehicleCardFields,
  type VehicleCardScanResult,
} from "@/lib/vehicle-card-map";
import { isPdfCardFile, prepareCardFileForScan } from "@/lib/compress-card-image";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 180_000;

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

function resolveCardMimeType(file: File): string {
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

export function isAcceptedCardFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return /\.(pdf|jpe?g|png|heic|heif|webp)$/i.test(file.name);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      if (!base64) reject(new Error("No se pudo leer el archivo"));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function mapScanError(err: unknown): Error {
  if (err instanceof FirebaseError) {
    if (err.code === "functions/deadline-exceeded") {
      return new Error(
        "La lectura tardó demasiado. Intenta con una foto más pequeña o en JPG.",
      );
    }
    if (err.code === "functions/internal" && err.message === "internal") {
      return new Error(
        "No se pudo leer la tarjeta en el servidor. Puedes guardar el auto manualmente.",
      );
    }
    if (err.message) return new Error(err.message);
  }
  if (err instanceof Error) return err;
  return new Error("Error al leer la tarjeta");
}

export async function scanVehicleCard(file: File): Promise<VehicleCardScanResult> {
  if (!isAcceptedCardFile(file)) {
    throw new Error("Formato no soportado. Usa PDF o imagen (JPG, PNG, HEIC).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("El archivo es muy grande (máx. 8 MB).");
  }

  let prepared = file;
  if (!isPdfCardFile(file)) {
    try {
      prepared = await prepareCardFileForScan(file);
    } catch {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          "No se pudo preparar la imagen. Prueba con JPG o una foto más pequeña.",
        );
      }
      prepared = file;
    }
  }

  if (prepared.size > MAX_UPLOAD_BYTES) {
    throw new Error("La imagen sigue siendo muy grande. Prueba otra foto más pequeña.");
  }

  const fileBase64 = await fileToBase64(prepared);
  const extract = httpsCallable<
    { fileBase64: string; mimeType: string; fileName: string },
    { confidence: number; extractedFields: VehicleCardFields }
  >(functions, "extractVehicleCard", { timeout: SCAN_TIMEOUT_MS });

  try {
    const { data } = await extract({
      fileBase64,
      mimeType: resolveCardMimeType(prepared),
      fileName: prepared.name,
    });

    return {
      confidence: data.confidence,
      extractedFields: data.extractedFields,
      mapped: mapCardFieldsToVehicle(data.extractedFields),
    };
  } catch (err) {
    throw mapScanError(err);
  }
}
