import convert from "heic-convert";

export function isHeicImage(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase();
  const lower = fileName.toLowerCase();
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence" ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif")
  );
}

export function isImageForVision(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith("image/") || isHeicImage(mimeType, fileName);
}

export async function prepareImageForVision(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<{ buffer: Buffer; mimeType: string; base64: string }> {
  if (isHeicImage(mimeType, fileName)) {
    const converted = await convert({
      buffer,
      format: "JPEG",
      quality: 0.8,
    });
    const jpegBuffer = Buffer.from(converted);
    return {
      buffer: jpegBuffer,
      mimeType: "image/jpeg",
      base64: jpegBuffer.toString("base64"),
    };
  }

  return {
    buffer,
    mimeType,
    base64: buffer.toString("base64"),
  };
}
