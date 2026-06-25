const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.78;

function isHeicFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif")
  );
}

export function isPdfCardFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function scaleDown(width: number, height: number, maxEdge: number) {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }
  const ratio = Math.min(maxEdge / width, maxEdge / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: JPEG_QUALITY,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!(blob instanceof Blob)) {
    throw new Error("No se pudo convertir la imagen HEIC");
  }
  const baseName = file.name.replace(/\.[^.]+$/i, "") || "tarjeta";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

async function compressRasterImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = scaleDown(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo comprimir la imagen");

    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/i, "") || "tarjeta";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/** Reduce tamaño antes de escanear: HEIC → JPEG y resize para todas las fotos. */
export async function prepareCardFileForScan(file: File): Promise<File> {
  if (isPdfCardFile(file)) return file;

  let imageFile = file;
  if (isHeicFile(file)) {
    imageFile = await convertHeicToJpeg(file);
  }

  return compressRasterImage(imageFile);
}
