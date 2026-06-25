import pdf from "pdf-parse";
import * as XLSX from "xlsx";
import { isHeicImage, isImageForVision } from "./image-vision";

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const lower = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const data = await pdf(buffer);
    if (data.text?.trim()) return data.text.slice(0, 12000);
    return "[PDF escaneado sin texto extraíble — usar visión]";
  }

  if (
    mimeType.includes("spreadsheet") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsx")
  ) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const name of workbook.SheetNames.slice(0, 3)) {
      const sheet = workbook.Sheets[name];
      parts.push(XLSX.utils.sheet_to_csv(sheet));
    }
    return parts.join("\n").slice(0, 12000);
  }

  if (
    mimeType.includes("xml") ||
    lower.endsWith(".xml")
  ) {
    return buffer.toString("utf-8").slice(0, 12000);
  }

  if (mimeType.startsWith("image/") || isHeicImage(mimeType, lower)) {
    return "[IMAGEN — usar visión]";
  }

  return buffer.toString("utf-8").slice(0, 12000);
}

export function isVisionRequired(
  text: string,
  mimeType: string,
  fileName = "",
): boolean {
  return (
    isImageForVision(mimeType, fileName) ||
    text.includes("[PDF escaneado") ||
    text.includes("[IMAGEN")
  );
}
