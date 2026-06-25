import { HttpsError } from "firebase-functions/v2/https";

export function mapCardScanError(err: unknown): HttpsError {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("Memory limit")) {
    return new HttpsError(
      "resource-exhausted",
      "La imagen es muy pesada para procesar. Intenta con una foto más pequeña o en JPG.",
    );
  }

  if (msg.includes("DEADLINE_EXCEEDED") || msg.includes("deadline")) {
    return new HttpsError(
      "deadline-exceeded",
      "La lectura tardó demasiado. Intenta con una foto más pequeña o en JPG.",
    );
  }

  if (msg.includes("not a HEIC image")) {
    return new HttpsError(
      "invalid-argument",
      "El archivo no parece ser una imagen HEIC válida.",
    );
  }

  if (
    msg.includes("unsupported image") ||
    msg.includes("invalid_image_format")
  ) {
    return new HttpsError(
      "invalid-argument",
      "Formato de imagen no soportado. Usa JPG, PNG o HEIC.",
    );
  }

  if (msg.includes("Incorrect API key")) {
    return new HttpsError(
      "failed-precondition",
      "Error de configuración del servidor (OpenAI).",
    );
  }

  if (msg.length > 0 && msg.length < 200 && !msg.includes(" at ")) {
    return new HttpsError("internal", msg);
  }

  return new HttpsError(
    "internal",
    "No se pudo leer la tarjeta. Intenta otra foto o captura los datos manualmente.",
  );
}
