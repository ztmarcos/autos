import * as admin from "firebase-admin";
import type { Bucket } from "@google-cloud/storage";
import {
  generateBrandLogoPng,
  researchBrandLogoBrief,
  resolveBrandFromDescription,
} from "./brand-logo-openai";

export const BRAND_LOGOS_COLLECTION = "brand_logos";

export interface BrandLogoDoc {
  brand: string;
  brandKey: string;
  logoPath: string;
  status: "generating" | "ready" | "failed";
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export function normalizeBrandKey(brand: string): string {
  return (
    brand
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

export function sharedBrandLogoPath(brandKey: string): string {
  return `brands/${brandKey}/logo.png`;
}

export function isSharedBrandLogoPath(path: string | undefined): boolean {
  return typeof path === "string" && path.startsWith("brands/");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReadyBrandLogo(
  brandRef: admin.firestore.DocumentReference,
  timeoutMs = 90_000,
): Promise<BrandLogoDoc | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const snap = await brandRef.get();
    if (!snap.exists) return null;

    const data = snap.data() as BrandLogoDoc;
    if (data.status === "ready" && data.logoPath) return data;
    if (data.status === "failed") return null;

    await sleep(2000);
  }
  return null;
}

async function claimBrandLogoGeneration(
  brandRef: admin.firestore.DocumentReference,
  brand: string,
  brandKey: string,
): Promise<"generate" | "ready" | "wait"> {
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(brandRef);
    if (snap.exists) {
      const data = snap.data() as BrandLogoDoc;
      if (data.status === "ready" && data.logoPath) return "ready";
      if (data.status === "generating") return "wait";
    }

    tx.set(
      brandRef,
      {
        brand,
        brandKey,
        status: "generating",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(!snap.exists ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
    return "generate";
  });
}

async function generateAndStoreBrandLogo(
  brand: string,
  brandKey: string,
  description: string,
  apiKey: string,
  db: admin.firestore.Firestore,
  bucket: Bucket,
): Promise<string> {
  const brandRef = db.collection(BRAND_LOGOS_COLLECTION).doc(brandKey);
  const { logoBrief } = await resolveBrandFromDescription(description, apiKey);
  const researched = await researchBrandLogoBrief(brand, apiKey);
  const buffer = await generateBrandLogoPng(brand, researched ?? logoBrief, apiKey);
  const logoPath = sharedBrandLogoPath(brandKey);

  await bucket.file(logoPath).save(buffer, {
    metadata: { contentType: "image/png" },
  });

  await brandRef.set(
    {
      brand,
      brandKey,
      logoPath,
      status: "ready",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return logoPath;
}

export async function getOrEnsureBrandLogo(
  description: string,
  apiKey: string,
  db: admin.firestore.Firestore,
  bucket: Bucket,
  options?: { brand?: string },
): Promise<{ brand: string; brandKey: string; logoPath: string }> {
  const resolved = options?.brand
    ? { brand: options.brand, logoBrief: `Official ${options.brand} automotive emblem` }
    : await resolveBrandFromDescription(description, apiKey);
  const brand = resolved.brand;
  const brandKey = normalizeBrandKey(brand);
  const brandRef = db.collection(BRAND_LOGOS_COLLECTION).doc(brandKey);

  const existing = await brandRef.get();
  if (existing.exists) {
    const data = existing.data() as BrandLogoDoc;
    if (data.status === "ready" && data.logoPath) {
      return { brand: data.brand ?? brand, brandKey, logoPath: data.logoPath };
    }
    if (data.status === "generating") {
      const ready = await waitForReadyBrandLogo(brandRef);
      if (ready?.logoPath) {
        return { brand: ready.brand ?? brand, brandKey, logoPath: ready.logoPath };
      }
    }
  }

  const claim = await claimBrandLogoGeneration(brandRef, brand, brandKey);
  if (claim === "ready") {
    const data = (await brandRef.get()).data() as BrandLogoDoc;
    return { brand: data.brand ?? brand, brandKey, logoPath: data.logoPath };
  }
  if (claim === "wait") {
    const ready = await waitForReadyBrandLogo(brandRef);
    if (ready?.logoPath) {
      return { brand: ready.brand ?? brand, brandKey, logoPath: ready.logoPath };
    }
    throw new Error(`Timed out waiting for brand logo: ${brand}`);
  }

  try {
    const logoPath = await generateAndStoreBrandLogo(
      brand,
      brandKey,
      description,
      apiKey,
      db,
      bucket,
    );
    return { brand, brandKey, logoPath };
  } catch (err) {
    console.error(`Brand logo cache generation failed for ${brand}:`, err);
    await brandRef.set(
      { status: "failed", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    throw err;
  }
}

export async function clearBrandLogoCache(
  db: admin.firestore.Firestore,
  bucket: Bucket,
  brandKey: string,
): Promise<void> {
  const brandRef = db.collection(BRAND_LOGOS_COLLECTION).doc(brandKey);
  const snap = await brandRef.get();
  const logoPath = snap.data()?.logoPath as string | undefined;

  if (logoPath && isSharedBrandLogoPath(logoPath)) {
    try {
      await bucket.file(logoPath).delete({ ignoreNotFound: true });
    } catch {
      // ignore
    }
  }

  await brandRef.delete();
}
