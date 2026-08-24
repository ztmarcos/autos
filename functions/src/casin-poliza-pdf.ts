import * as admin from "firebase-admin";
import path from "path";

export const CASIN_DRIVE_BUCKET = "casinbbdd.firebasestorage.app";
export const AUTOS_STORAGE_BUCKET = "autos-fa58f.firebasestorage.app";
export const CASIN_DRIVE_TEAM_ID = "4JlUqhAvfJMlCDhQ4vgH";
export const CASIN_POLIZA_DOC_ID = "casin-poliza";

const DRIVE_PREFIX = `teams/${CASIN_DRIVE_TEAM_ID}/`;
const MIN_SCORE = 50;

export interface CasinDrivePdf {
  name: string;
  fullPath: string;
  folder: string;
  updated: number;
  score: number;
}

export interface CasinPdfMatchHints {
  clientName?: string | null;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  aseguradora?: string | null;
}

export type CasinPdfAttachResult =
  | "copied"
  | "unchanged"
  | "missing"
  | "error";

export class CasinPolizaPdfIndex {
  constructor(
    private readonly byNumber: Map<string, CasinDrivePdf[]>,
    private readonly byFolder: Map<string, CasinDrivePdf[]>,
    private readonly allPdfs: CasinDrivePdf[],
  ) {}

  findBest(
    policyNumber: string | null | undefined,
    hints?: CasinPdfMatchHints,
  ): CasinDrivePdf | null {
    return (
      this.findByPolicyNumber(policyNumber) ??
      this.findByClientAndVehicle(hints)
    );
  }

  findByPolicyNumber(
    policyNumber: string | null | undefined,
  ): CasinDrivePdf | null {
    const keys = policyNumberKeys(policyNumber);
    if (!keys.length) return null;

    const seen = new Set<string>();
    const candidates: CasinDrivePdf[] = [];
    for (const key of keys) {
      for (const pdf of this.byNumber.get(key) ?? []) {
        if (seen.has(pdf.fullPath)) continue;
        seen.add(pdf.fullPath);
        candidates.push(pdf);
      }
    }

    const ranked = candidates
      .filter((pdf) => filenameLooksLikePolicyPdf(pdf.name) && pdf.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score || b.updated - a.updated);
    if (ranked[0]) return ranked[0];

    const stripped = keys.filter((key) => key.length >= 6);
    if (!stripped.length) return null;
    const extras = this.allPdfs.filter((pdf) => {
      if (!filenameLooksLikePolicyPdf(pdf.name) || pdf.score < MIN_SCORE) return false;
      const digits = pdf.name.replace(/\D/g, "");
      return stripped.some((key) => digits.includes(key));
    });
    extras.sort((a, b) => b.score - a.score || b.updated - a.updated);
    return extras[0] ?? null;
  }

  findByClientAndVehicle(
    hints?: CasinPdfMatchHints,
  ): CasinDrivePdf | null {
    if (!hints) return null;
    const folderPdfs = this.pdfsForClient(hints.clientName);
    if (!folderPdfs.length) return null;

    const ranked = folderPdfs
      .filter((pdf) => filenameLooksLikePolicyPdf(pdf.name))
      .map((pdf) => ({ pdf, score: scoreVehicleMatch(pdf, hints) }))
      .filter((item) => item.score >= 40)
      .sort((a, b) => b.score - a.score || b.pdf.updated - a.pdf.updated);
    return ranked[0]?.pdf ?? null;
  }

  private pdfsForClient(clientName?: string | null): CasinDrivePdf[] {
    const clientKey = normalizeName(clientName);
    if (!clientKey) return [];
    const exact = this.byFolder.get(clientKey);
    if (exact?.length) return exact;

    const tokens = clientKey.split(" ").filter((token) => token.length >= 3);
    if (tokens.length < 2) return [];

    const matches: CasinDrivePdf[] = [];
    for (const [folderKey, pdfs] of this.byFolder) {
      const hit = tokens.filter((token) => folderKey.includes(token)).length;
      if (hit >= Math.min(tokens.length, 2)) matches.push(...pdfs);
    }
    return matches;
  }
}

let cachedIndex: Promise<CasinPolizaPdfIndex> | null = null;

export function resetCasinPolizaPdfIndex(): void {
  cachedIndex = null;
}

export async function getCasinPolizaPdfIndex(): Promise<CasinPolizaPdfIndex> {
  if (!cachedIndex) {
    cachedIndex = loadCasinPolizaPdfIndex().catch((error) => {
      cachedIndex = null;
      throw error;
    });
  }
  return cachedIndex;
}

export async function loadCasinPolizaPdfIndex(): Promise<CasinPolizaPdfIndex> {
  const bucket = admin.storage().bucket(CASIN_DRIVE_BUCKET);
  const [files] = await bucket.getFiles({ prefix: DRIVE_PREFIX });
  const byNumber = new Map<string, CasinDrivePdf[]>();
  const byFolder = new Map<string, CasinDrivePdf[]>();
  const allPdfs: CasinDrivePdf[] = [];

  for (const file of files) {
    const name = path.basename(file.name);
    if (!name.toLowerCase().endsWith(".pdf") || name.startsWith(".")) continue;
    if (!filenameLooksLikePolicyPdf(name)) continue;

    const relative = file.name.slice(DRIVE_PREFIX.length);
    const folder = relative.includes("/")
      ? relative.slice(0, relative.lastIndexOf("/"))
      : "(root)";
    const score = scorePolizaPdf(name, folder);
    const updated = new Date(
      file.metadata?.updated || file.metadata?.timeCreated || 0,
    ).getTime();
    const pdf: CasinDrivePdf = {
      name,
      fullPath: file.name,
      folder,
      updated,
      score,
    };

    allPdfs.push(pdf);

    for (const num of filenamePolicyNumbers(name)) {
      const list = byNumber.get(num) ?? [];
      list.push(pdf);
      byNumber.set(num, list);
    }

    const folderKey = normalizeName(folder.split("/")[0] || folder);
    if (folderKey) {
      const list = byFolder.get(folderKey) ?? [];
      list.push(pdf);
      byFolder.set(folderKey, list);
    }
  }

  return new CasinPolizaPdfIndex(byNumber, byFolder, allPdfs);
}

export function policyNumberKeys(
  value: string | null | undefined,
): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, "");
  const stripped = digits.replace(/^0+/, "") || digits;
  return [...new Set([raw, digits, stripped].filter(Boolean))];
}

export function filenamePolicyNumbers(fileName: string): string[] {
  const nums = fileName.match(/\d{6,14}/g) ?? [];
  const keys = new Set<string>();
  for (const num of nums) {
    keys.add(num);
    keys.add(num.replace(/^0+/, "") || num);
  }
  return [...keys];
}

export function filenameLooksLikePolicyPdf(fileName: string): boolean {
  const n = normalizeText(fileName);
  return n.includes("poliza") || n.includes("renovacion") || /\brenov\b/.test(n);
}

export function scorePolizaPdf(fileName: string, folder = ""): number {
  if (!filenameLooksLikePolicyPdf(fileName)) return -1;

  const n = normalizeText(`${folder} ${fileName}`);
  if (isOtherRamo(n)) return -1;

  const receipt = isReceiptLike(n);
  if (receipt) return -1;
  if (n.includes("cancelacion")) return -1;

  const blob = normalizeText(fileName);
  let score = 0;
  if (blob.includes("poliza")) score += 80;
  if (blob.includes("renovacion") || /\brenov\b/.test(blob)) score += 50;
  if (isAutoLike(n)) score += 40;
  if (/p-\d{6,}/.test(blob) || /poliza\s+\d{6,}/.test(blob)) score += 20;
  if (n.includes("factura")) score -= 25;
  return score;
}

export function casinPolizaPdfStoragePath(
  userId: string,
  vehicleId: string,
): string {
  return `users/${userId}/vehicles/${vehicleId}/documents/${CASIN_POLIZA_DOC_ID}/original.pdf`;
}

export function isPdfStoragePath(storagePath: unknown): boolean {
  return (
    typeof storagePath === "string" && storagePath.toLowerCase().endsWith(".pdf")
  );
}

export async function copyCasinPolizaPdf(options: {
  userId: string;
  vehicleId: string;
  policyNumber?: string | null;
  hints?: CasinPdfMatchHints;
  existingSource?: string | null;
  index?: CasinPolizaPdfIndex;
}): Promise<{ result: CasinPdfAttachResult; pdf: CasinDrivePdf | null }> {
  let index = options.index;
  if (!index) {
    try {
      index = await getCasinPolizaPdfIndex();
    } catch (error) {
      console.error("No se pudo listar Firedrive de CASIN:", error);
      return { result: "error", pdf: null };
    }
  }

  const pdf = index.findBest(options.policyNumber, options.hints);
  if (!pdf) return { result: "missing", pdf: null };

  const destPath = casinPolizaPdfStoragePath(options.userId, options.vehicleId);
  const destBucket = admin.storage().bucket(AUTOS_STORAGE_BUCKET);
  const destFile = destBucket.file(destPath);

  if (options.existingSource === pdf.fullPath) {
    const [exists] = await destFile.exists();
    if (exists) return { result: "unchanged", pdf };
  }

  try {
    const source = admin.storage().bucket(CASIN_DRIVE_BUCKET).file(pdf.fullPath);
    await source.copy(destFile);
    await destFile.setMetadata({ contentType: "application/pdf" });
    return { result: "copied", pdf };
  } catch (error) {
    console.error(
      `No se pudo copiar póliza ${options.policyNumber} → ${destPath}:`,
      error,
    );
    return { result: "error", pdf };
  }
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function normalizeName(value: string | null | undefined): string {
  return normalizeText(String(value ?? ""))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreVehicleMatch(
  pdf: CasinDrivePdf,
  hints: CasinPdfMatchHints,
): number {
  if (!filenameLooksLikePolicyPdf(pdf.name)) return -1;
  const blob = normalizeText(`${pdf.folder} ${pdf.name}`);
  if (isOtherRamo(blob) || isReceiptLike(blob) || blob.includes("cancelacion")) {
    return -1;
  }

  const brand = normalizeName(hints.brand);
  const aseguradora = normalizeName(hints.aseguradora);
  const modelBits = [
    ...normalizeName(hints.model).split(" "),
    ...normalizeName(hints.description).split(" "),
  ].filter((token) => token.length >= 3 && token !== brand);

  let score = pdf.score;
  let vehicleHit = false;
  if (brand && blob.includes(brand)) {
    score += 50;
    vehicleHit = true;
  }
  for (const token of [...new Set(modelBits)].slice(0, 4)) {
    if (!blob.includes(token)) continue;
    score += 40;
    vehicleHit = true;
  }
  if (aseguradora && blob.includes(aseguradora)) score += 25;
  if (!vehicleHit) return -1;
  return score;
}

function isReceiptLike(n: string): boolean {
  return (
    /\brecibo\b/.test(n) ||
    /_rec_/.test(n) ||
    /\baviso\b/.test(n) ||
    /\bcobro\b/.test(n)
  );
}

function isAutoLike(n: string): boolean {
  return /\b(auto|autos|moto|motocicleta|bmw|honda|toyota|nissan|volkswagen|\bvw\b|jetta|corolla|tracker|audi|kia|suzuki|italika|yamaha|zontes|chevrolet|ford|mazda|jeep|mercedes|lexus|hyundai|royal|enfield)\b/.test(
    n,
  );
}

function isOtherRamo(n: string): boolean {
  if (isAutoLike(n)) return false;
  return /\b(gmm|gastos medicos|vida|hogar|casa habitacion)\b/.test(n);
}
