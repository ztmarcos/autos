import * as admin from "firebase-admin";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { extractTextFromBuffer, isVisionRequired } from "./extractors";
import { isImageForVision, prepareImageForVision } from "./image-vision";
import { analyzeDocument } from "./openai-analyze";
import { analyzeVehicleCard } from "./analyze-vehicle-card";
import { mapCardScanError } from "./card-scan-errors";
import {
  isPdfFile,
  pdfPagesPrefix,
  pdfThumbPath,
  renderAllPdfPages,
  renderPdfThumbnail,
} from "./pdf-thumbnail";
import {
  configureMail,
  getMailCredentialsFromEnv,
  sendEmail,
} from "./mail";
import { APP_NAME } from "./app-name";
import {
  sendVehicleRegisteredEmailForUser,
  sendWelcomeEmailForUser,
} from "./mail-user";
import { fetchAllStateNews } from "./fetch-state-news";
import { notifyUsersOfNewStateAlerts } from "./notify-state-news";
import { runDailyAlerts } from "./run-daily-alerts";
import { syncInsuranceExpiryOnVehicle } from "./vehicle-insurance";
import { syncVehicleGeneralOnDocument } from "./vehicle-sync";
import {
  ensureVehicleBrandLogoForDoc,
  shouldGenerateBrandLogo,
} from "./generate-brand-logo";
import { syncCasinAutos as performCasinAutosSync } from "./casin-autos-sync";
import {
  assertCasinAdminSecret,
  exchangeAccessLink as performAccessLinkExchange,
  listCasinAccessLinks as fetchCasinAccessLinks,
  listCasinClients as fetchCasinClients,
} from "./casin-access-link";
import { backfillVehicleTypes as performBackfillVehicleTypes } from "./backfill-vehicle-types";

admin.initializeApp();
setGlobalOptions({ region: "us-east1" });

const db = admin.firestore();
const bucket = admin.storage().bucket();
const openAiApiKey = defineSecret("OPENAI_API_KEY");
const gmailAccount = defineSecret("GMAIL_ACCOUNT");
const gmailPassword = defineSecret("GMAIL_PASSWORD");
const casinAdminSecret = defineSecret("CASIN_ADMIN_SECRET");
const STORAGE_BUCKET = "autos-fa58f.firebasestorage.app";

function ensureMailConfigured(): boolean {
  const fromEnv = getMailCredentialsFromEnv();
  if (fromEnv) {
    configureMail(fromEnv.account, fromEnv.password);
    return true;
  }

  try {
    const account = gmailAccount.value()?.trim();
    const password = gmailPassword.value()?.trim();
    if (account && password) {
      configureMail(account, password);
      return true;
    }
  } catch {
    // Esta función no tiene secrets de Gmail enlazados.
  }

  return false;
}

function parseDocumentPath(path: string): {
  userId: string;
  vehicleId: string;
  docId: string;
} | null {
  const match = path.match(
    /^users\/([^/]+)\/vehicles\/([^/]+)\/documents\/([^/]+)\/original\./,
  );
  if (!match) return null;
  return { userId: match[1], vehicleId: match[2], docId: match[3] };
}

async function persistPdfThumbnail(
  storagePath: string,
  thumbBuffer: Buffer,
): Promise<string> {
  const thumbPath = pdfThumbPath(storagePath);
  await bucket.file(thumbPath).save(thumbBuffer, {
    metadata: { contentType: "image/jpeg" },
  });

  const parsed = parseDocumentPath(storagePath);
  if (parsed) {
    await db
      .collection("vehicles")
      .doc(parsed.vehicleId)
      .collection("documents")
      .doc(parsed.docId)
      .update({ thumbnailPath: thumbPath });
  }

  return thumbPath;
}

export const processDocument = onObjectFinalized(
  {
    bucket: STORAGE_BUCKET,
    secrets: [openAiApiKey],
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const path = event.data.name;
    if (!path) return;

    const parsed = parseDocumentPath(path);
    if (!parsed) return;

    process.env.OPENAI_API_KEY = openAiApiKey.value();

    const { vehicleId, docId } = parsed;
    const docRef = db
      .collection("vehicles")
      .doc(vehicleId)
      .collection("documents")
      .doc(docId);

    try {
      const docSnap = await docRef.get();
      const docData = docSnap.data();
      const skipFullAnalysis = docData?.skipFullAnalysis === true;

      await docRef.update({ status: "processing" });

      const file = bucket.file(path);
      const [buffer] = await file.download();
      const mimeType = event.data.contentType ?? "application/octet-stream";
      const fileName = path.split("/").pop() ?? "file";

      let analysis:
        | Awaited<ReturnType<typeof analyzeDocument>>
        | undefined;
      let visionImage:
        | { buffer: Buffer; mimeType: string; base64: string }
        | undefined;
      let rawTextLength = 0;

      if (!skipFullAnalysis) {
        const text = await extractTextFromBuffer(buffer, mimeType, fileName);
        rawTextLength = text.length;

        if (isVisionRequired(text, mimeType, fileName)) {
          if (isImageForVision(mimeType, fileName)) {
            visionImage = await prepareImageForVision(buffer, mimeType, fileName);
            analysis = await analyzeDocument(
              text,
              visionImage.base64,
              visionImage.mimeType,
            );
          } else {
            analysis = await analyzeDocument(
              text,
              buffer.toString("base64"),
              mimeType,
            );
          }
        } else {
          analysis = await analyzeDocument(text);
        }
      }

      const thumbPath = pdfThumbPath(path);
      let savedThumbnailPath: string | undefined;

      if (isImageForVision(mimeType, fileName)) {
        const thumb =
          visionImage ?? (await prepareImageForVision(buffer, mimeType, fileName));
        await bucket.file(thumbPath).save(thumb.buffer, {
          metadata: { contentType: "image/jpeg" },
        });
        savedThumbnailPath = thumbPath;
      } else if (isPdfFile(mimeType, fileName)) {
        const pdfThumb = await renderPdfThumbnail(buffer);
        if (pdfThumb) {
          savedThumbnailPath = await persistPdfThumbnail(path, pdfThumb);
        }
      }

      await docRef.update({
        status: "ready",
        ...(skipFullAnalysis
          ? {}
          : {
              detectedType: analysis!.detectedType,
              detectedTypeLabel: analysis!.detectedTypeLabel,
              confidence: analysis!.confidence,
              extractedFields: analysis!.extractedFields,
              rawTextLength,
            }),
        ...(savedThumbnailPath ? { thumbnailPath: savedThumbnailPath } : {}),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (!skipFullAnalysis && analysis?.detectedType === "poliza_seguro") {
        await syncInsuranceExpiryOnVehicle(
          db,
          vehicleId,
          analysis.extractedFields,
        );
      }

      if (!skipFullAnalysis && analysis?.detectedType) {
        await syncVehicleGeneralOnDocument(
          db,
          vehicleId,
          analysis.detectedType,
          analysis.extractedFields,
        );
      }

      if (!skipFullAnalysis && analysis?.detectedType) {
        await syncVehicleGeneralOnDocument(
          db,
          vehicleId,
          analysis.detectedType,
          analysis.extractedFields,
        );
      }

      console.log(`Processed document ${docId} for vehicle ${vehicleId}`);
    } catch (err) {
      console.error("processDocument error:", err);
      await docRef.update({
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  },
);

export const dailyAlerts = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "America/Mexico_City",
    secrets: [gmailAccount, gmailPassword],
  },
  async () => {
    const mailReady = ensureMailConfigured();
    await runDailyAlerts(db, mailReady);
  },
);

export const dailyStateNews = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "America/Mexico_City",
    timeoutSeconds: 300,
    secrets: [gmailAccount, gmailPassword],
  },
  async () => {
    const mailReady = ensureMailConfigured();
    const results = await fetchAllStateNews(db);
    const changed = results.filter((result) => result.changed);
    const aiCalls = results.filter((result) => result.usedAi).length;
    let notifiedUsers = 0;

    for (const result of results) {
      if (result.newAlerts.length === 0) continue;
      notifiedUsers += await notifyUsersOfNewStateAlerts(
        db,
        result.stateCode,
        result.newAlerts,
        mailReady,
      );
    }

    console.log(
      `State news: ${results.length} states, ${changed.length} changed, ${aiCalls} AI summaries, ${notifiedUsers} user alerts sent`,
    );
  },
);

export const refreshStateNews = onCall(
  {
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

    const results = await fetchAllStateNews(db);
    return {
      states: results.length,
      changed: results.filter((result) => result.changed).length,
      aiSummaries: results.filter((result) => result.usedAi).length,
    };
  },
);

export const seedMxRules = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

  const rules = [
    {
      id: "CDMX",
      data: {
        stateCode: "CDMX",
        stateName: "Ciudad de México",
        verificationSchedule: {
          "5,6": "enero",
          "7,8": "febrero",
          "3,4": "marzo–abril",
          "1,2": "mayo–junio",
          "0,9": "julio–agosto",
        },
        tenenciaNote:
          "Tenencia eliminada para vehículos particulares. Aplica refrendo anual.",
        officialSourceUrl: "https://www.semovi.cdmx.gob.mx/",
        lastUpdated: "2026-01-01",
      },
    },
    {
      id: "EDOMEX",
      data: {
        stateCode: "EDOMEX",
        stateName: "Estado de México",
        verificationSchedule: {
          "5,6": "enero–febrero",
          "7,8": "marzo–abril",
          "3,4": "mayo–junio",
          "1,2": "julio–agosto",
          "9,0": "septiembre–octubre",
        },
        tenenciaNote: "Tenencia según tabulador estatal.",
        officialSourceUrl: "https://tenencia.edomex.gob.mx/",
        lastUpdated: "2026-01-01",
      },
    },
  ];

  const batch = db.batch();
  for (const r of rules) {
    batch.set(db.collection("mx_vehicle_rules").doc(r.id), r.data);
  }
  await batch.commit();
  return { seeded: rules.length };
});

export const getPdfPages = onCall(
  {
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const { storagePath } = request.data as { storagePath?: string };
    if (!storagePath || !storagePath.includes("/original.")) {
      throw new HttpsError("invalid-argument", "storagePath inválido");
    }
    if (!isPdfFile("application/pdf", storagePath)) {
      throw new HttpsError("invalid-argument", "Solo aplica a PDF");
    }

    const pagesPrefix = pdfPagesPrefix(storagePath);
    const thumbPath = pdfThumbPath(storagePath);
    const [existing] = await bucket.getFiles({ prefix: pagesPrefix });
    let [hasThumb] = await bucket.file(thumbPath).exists();

    if (existing.length === 0) {
      const [buffer] = await bucket.file(storagePath).download();
      const rendered = await renderAllPdfPages(buffer, 1.15);
      if (rendered.length === 0) {
        throw new HttpsError("internal", "No se pudieron generar las páginas del PDF");
      }
      await Promise.all(
        rendered.map((pageBuffer, index) => {
          const pagePath = `${pagesPrefix}page-${String(index + 1).padStart(3, "0")}.jpg`;
          return bucket.file(pagePath).save(pageBuffer, {
            metadata: { contentType: "image/jpeg" },
          });
        }),
      );
      if (!hasThumb) {
        await persistPdfThumbnail(storagePath, rendered[0]);
        hasThumb = true;
      }
    }

    const [pageFiles] = await bucket.getFiles({ prefix: pagesPrefix });
    const pagePaths = pageFiles
      .map((f) => f.name)
      .filter((name) => /page-\d+\.jpg$/i.test(name))
      .sort();

    if (!hasThumb && pagePaths.length > 0) {
      const [pageBuffer] = await bucket.file(pagePaths[0]).download();
      await persistPdfThumbnail(storagePath, pageBuffer);
    }

    return { pagePaths, thumbnailPath: thumbPath };
  },
);

export const ensurePdfThumbnail = onCall(
  {
    memory: "1GiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const { storagePath } = request.data as { storagePath?: string };
    if (!storagePath || !storagePath.includes("/original.")) {
      throw new HttpsError("invalid-argument", "storagePath inválido");
    }
    if (!isPdfFile("application/pdf", storagePath)) {
      throw new HttpsError("invalid-argument", "Solo aplica a PDF");
    }

    const thumbPath = pdfThumbPath(storagePath);
    const [thumbExists] = await bucket.file(thumbPath).exists();
    if (thumbExists) {
      return { thumbnailPath: thumbPath };
    }

    const page1Path = `${pdfPagesPrefix(storagePath)}page-001.jpg`;
    const [page1Exists] = await bucket.file(page1Path).exists();
    if (page1Exists) {
      const [pageBuffer] = await bucket.file(page1Path).download();
      await persistPdfThumbnail(storagePath, pageBuffer);
      return { thumbnailPath: thumbPath };
    }

    const [buffer] = await bucket.file(storagePath).download();
    const thumb = await renderPdfThumbnail(buffer);
    if (!thumb) {
      throw new HttpsError("internal", "No se pudo generar la miniatura del PDF");
    }
    await persistPdfThumbnail(storagePath, thumb);
    return { thumbnailPath: thumbPath };
  },
);

export const onUserRegistered = onDocumentCreated(
  {
    document: "users/{userId}",
    secrets: [gmailAccount, gmailPassword],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    if (data.source === "casin-link") {
      return;
    }

    if (!ensureMailConfigured()) {
      console.warn("Welcome email skipped: mail not configured");
      return;
    }

    try {
      await sendWelcomeEmailForUser(
        db,
        event.params.userId,
        data.displayName as string | undefined,
      );
    } catch (error) {
      console.error("Welcome email failed:", error);
    }
  },
);


export const onVehicleRegistered = onDocumentCreated(
  {
    document: "vehicles/{vehicleId}",
    secrets: [gmailAccount, gmailPassword],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const userId = data.userId as string | undefined;
    if (!userId) return;

    if (!ensureMailConfigured()) {
      console.warn("Vehicle registered email skipped: mail not configured");
      return;
    }

    try {
      await sendVehicleRegisteredEmailForUser(
        db,
        userId,
        event.params.vehicleId,
        data,
      );
    } catch (error) {
      console.error("Vehicle registered email failed:", error);
    }
  },
);


export const onVehicleBrandLogo = onDocumentWritten(
  {
    document: "vehicles/{vehicleId}",
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const data = after.data();
    if (!data) return;

    const before = event.data?.before?.exists
      ? event.data.before.data()
      : undefined;

    if (!shouldGenerateBrandLogo(before, data)) return;

    await ensureVehicleBrandLogoForDoc(
      event.params.vehicleId,
      data,
      db,
      bucket,
    );
  },
);

export const requestVehicleBrandLogo = onCall(
  {
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const { vehicleId } = request.data as { vehicleId?: string };
    if (!vehicleId) {
      throw new HttpsError("invalid-argument", "vehicleId requerido");
    }

    const snap = await db.collection("vehicles").doc(vehicleId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Vehículo no encontrado");
    }

    const data = snap.data()!;
    if (data.brandLogoPath || data.brandLogoStatus === "generating") {
      return { ok: true };
    }

    if (data.brandLogoStatus === "failed") {
      await db.collection("vehicles").doc(vehicleId).update({
        brandLogoStatus: admin.firestore.FieldValue.delete(),
      });
    }

    await ensureVehicleBrandLogoForDoc(vehicleId, data, db, bucket);
    return { ok: true };
  },
);


export const extractVehicleCard = onCall(
  {
    secrets: [openAiApiKey],
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const { fileBase64, mimeType, fileName } = request.data as {
      fileBase64?: string;
      mimeType?: string;
      fileName?: string;
    };

    if (!fileBase64 || !mimeType || !fileName) {
      throw new HttpsError("invalid-argument", "fileBase64, mimeType y fileName son requeridos");
    }

    if (fileBase64.length > 12_000_000) {
      throw new HttpsError("invalid-argument", "Archivo demasiado grande");
    }

    process.env.OPENAI_API_KEY = openAiApiKey.value();

    try {
      const buffer = Buffer.from(fileBase64, "base64");
      const text = await extractTextFromBuffer(buffer, mimeType, fileName);

      let result;
      if (isVisionRequired(text, mimeType, fileName)) {
        if (isImageForVision(mimeType, fileName)) {
          const vision = await prepareImageForVision(buffer, mimeType, fileName);
          result = await analyzeVehicleCard(text, vision.base64, vision.mimeType);
        } else {
          result = await analyzeVehicleCard(text, fileBase64, mimeType);
        }
      } else {
        result = await analyzeVehicleCard(text);
      }

      return result;
    } catch (err) {
      console.error("extractVehicleCard error:", err, {
        mimeType,
        fileName,
        bytes: fileBase64.length,
      });
      throw mapCardScanError(err);
    }
  },
);

export const sendTestEmail = onCall(
  { secrets: [gmailAccount, gmailPassword] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

    if (!ensureMailConfigured()) {
      throw new HttpsError(
        "failed-precondition",
        "Gmail SMTP no configurado en el servidor",
      );
    }

    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    const email = userSnap.data()?.email as string | undefined;

    if (!email) {
      throw new HttpsError("failed-precondition", "Usuario sin email");
    }

    await sendEmail(email, `${APP_NAME} — Prueba de email`, {
      html: "<p>Tu integración de correo funciona correctamente.</p>",
      text: `Tu integración de correo funciona correctamente.\n\n${APP_NAME}`,
    });

    return { sent: true };
  },
);

function resolveCasinAdminSecret(): string {
  const fromEnv = process.env.CASIN_ADMIN_SECRET?.trim();
  if (fromEnv) return fromEnv;

  try {
    const fromSecret = casinAdminSecret.value()?.trim();
    if (fromSecret) return fromSecret;
  } catch {
    // Esta función no tiene CASIN_ADMIN_SECRET enlazado.
  }

  return "";
}

export const syncCasinAutosScheduled = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "America/Mexico_City",
    timeoutSeconds: 300,
  },
  async () => {
    const result = await performCasinAutosSync(db);
    console.log("syncCasinAutosScheduled:", result);
  },
);

export const syncCasinAutosManual = onCall(
  {
    timeoutSeconds: 300,
    secrets: [casinAdminSecret],
  },
  async (request) => {
    const expected = resolveCasinAdminSecret();
    if (!expected) {
      throw new HttpsError(
        "failed-precondition",
        "CASIN_ADMIN_SECRET no configurado",
      );
    }

    assertCasinAdminSecret(request.data?.adminSecret, expected);
    const result = await performCasinAutosSync(db);
    return result;
  },
);

export const exchangeAccessLink = onCall(async (request) => {
  const { token } = request.data as { token?: string };
  return performAccessLinkExchange(db, token);
});

export const listCasinClients = onCall(
  {
    secrets: [casinAdminSecret],
  },
  async (request) => {
    const expected = resolveCasinAdminSecret();
    if (!expected) {
      throw new HttpsError(
        "failed-precondition",
        "CASIN_ADMIN_SECRET no configurado",
      );
    }

    assertCasinAdminSecret(request.data?.adminSecret, expected);
    const clients = await fetchCasinClients(db);
    return { clients };
  },
);

export const listCasinAccessLinks = onCall(
  {
    secrets: [casinAdminSecret],
  },
  async (request) => {
    const expected = resolveCasinAdminSecret();
    if (!expected) {
      throw new HttpsError(
        "failed-precondition",
        "CASIN_ADMIN_SECRET no configurado",
      );
    }

    assertCasinAdminSecret(request.data?.adminSecret, expected);
    const links = await fetchCasinAccessLinks(db);
    return { links };
  },
);

export const backfillVehicleTypes = onCall(
  {
    timeoutSeconds: 300,
    secrets: [casinAdminSecret],
  },
  async (request) => {
    const expected = resolveCasinAdminSecret();
    if (!expected) {
      throw new HttpsError(
        "failed-precondition",
        "CASIN_ADMIN_SECRET no configurado",
      );
    }

    assertCasinAdminSecret(request.data?.adminSecret, expected);
    const result = await performBackfillVehicleTypes(db);
    return result;
  },
);

