import * as admin from "firebase-admin";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import {
  buildCasinUserGroups,
  casinClientNameKey,
  CASIN_AUTOS_URL,
  type CasinAutoRecord,
  type CasinAutosPayload,
  type CasinUserGroup,
  dedupeCasinAutos,
  filterVigenteCasinAutos,
  isValidAccessToken,
  listCasinGroupLookupKeys,
  mapCasinAutoToPolizaFields,
  mapCasinAutoToVehicle,
  normalizeCasinEmail,
  resolveContractorName,
} from "./casin-autos-map";
import {
  CASIN_POLIZA_DOC_ID,
  casinPolizaPdfStoragePath,
  copyCasinPolizaPdf,
  getCasinPolizaPdfIndex,
  isPdfStoragePath,
  resetCasinPolizaPdfIndex,
  type CasinPdfAttachResult,
  type CasinPolizaPdfIndex,
} from "./casin-poliza-pdf";
import { resolveVehicleState } from "./mx-plates";

const DEFAULT_PREFERENCES = {
  emailEnabled: false,
  monthlyReport: false,
  localNotifications: true,
  calendarSync: false,
  pushEnabled: false,
  defaultReminderDays: [7, 1],
};

export interface CasinSyncResult {
  groups: number;
  usersCreated: number;
  linksCreated: number;
  linksRevoked: number;
  vehiclesUpserted: number;
  vehiclesRemoved: number;
  pdfsCopied: number;
  pdfsMissing: number;
  generatedAt?: string;
}

interface SyncGroupDoc {
  userId: string;
  token: string;
  email?: string;
  displayName: string;
}

function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function fetchCasinAutosPayload(
  url: string = CASIN_AUTOS_URL,
): Promise<CasinAutosPayload> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar autos.json (${response.status})`);
  }

  const payload = (await response.json()) as CasinAutosPayload;
  if (!Array.isArray(payload.data)) {
    throw new Error("autos.json inválido: falta data[]");
  }

  return payload;
}

async function resolveUserId(
  db: Firestore,
  email: string | undefined,
  claimedUserIds?: Set<string>,
): Promise<string> {
  const safeEmail = normalizeCasinEmail(email);
  if (safeEmail) {
    try {
      const existing = await admin.auth().getUserByEmail(safeEmail);
      if (!claimedUserIds?.has(existing.uid)) return existing.uid;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "auth/user-not-found") throw error;
    }
  }

  return db.collection("users").doc().id;
}

async function ensureAuthUser(
  userId: string,
  email: string | undefined,
  displayName: string,
): Promise<boolean> {
  const safeEmail = normalizeCasinEmail(email);

  try {
    await admin.auth().getUser(userId);
    return false;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "auth/user-not-found") throw error;
  }

  try {
    await admin.auth().createUser({
      uid: userId,
      ...(safeEmail ? { email: safeEmail } : {}),
      displayName,
      emailVerified: false,
    });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/invalid-email" && safeEmail) {
      await admin.auth().createUser({
        uid: userId,
        displayName,
        emailVerified: false,
      });
      return true;
    }
    if (code === "auth/email-already-exists") {
      await admin.auth().createUser({
        uid: userId,
        displayName,
        emailVerified: false,
      });
      return true;
    }
    if (code === "auth/uid-already-exists") {
      return false;
    }
    throw error;
  }
}

interface ExistingAccessLink {
  token: string;
  userId: string;
  casinAutoIds: string[];
  email?: string;
  displayName: string;
  clientName?: string;
  revoked: boolean;
}

async function writeSyncGroupDocs(
  db: Firestore,
  groupKey: string,
  userId: string,
  token: string,
  email: string | undefined,
  displayName: string,
  clientName: string | undefined,
  casinAutoIds: string[],
  aliasKeys: string[],
): Promise<void> {
  const batch = db.batch();
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const keys = [...new Set([groupKey, ...aliasKeys])];

  for (const key of keys) {
    batch.set(
      db.collection("casin_sync_groups").doc(key),
      {
        userId,
        token,
        email: email ?? null,
        displayName,
        clientName: clientName ?? null,
        canonicalKey: groupKey,
        updatedAt: stamp,
      },
      { merge: true },
    );
  }

  batch.set(
    db.collection("access_links").doc(token),
    {
      userId,
      email: email ?? null,
      displayName,
      clientName: clientName ?? null,
      casinAutoIds,
      revoked: false,
      updatedAt: stamp,
    },
    { merge: true },
  );

  batch.set(
    db.collection("access_links_by_user").doc(userId),
    {
      token,
      email: email ?? null,
      displayName,
      clientName: clientName ?? null,
      updatedAt: stamp,
    },
    { merge: true },
  );

  batch.set(
    db.collection("users").doc(userId),
    {
      displayName,
      clientName: clientName ?? null,
      email: email ?? null,
      updatedAt: stamp,
    },
    { merge: true },
  );

  await batch.commit();
}

async function getOrCreateSyncGroup(
  db: Firestore,
  groupKey: string,
  email: string | undefined,
  displayName: string,
  clientName: string | undefined,
  casinAutoIds: string[],
  options?: {
    reuse?: { userId: string; token: string };
    claimedUserIds?: Set<string>;
    aliasKeys?: string[];
  },
): Promise<{ userId: string; token: string; usersCreated: number; linksCreated: number }> {
  const aliasKeys = options?.aliasKeys ?? [];
  const claimedUserIds = options?.claimedUserIds;

  if (options?.reuse) {
    await writeSyncGroupDocs(
      db,
      groupKey,
      options.reuse.userId,
      options.reuse.token,
      email,
      displayName,
      clientName,
      casinAutoIds,
      aliasKeys,
    );
    return {
      userId: options.reuse.userId,
      token: options.reuse.token,
      usersCreated: 0,
      linksCreated: 0,
    };
  }

  const groupRef = db.collection("casin_sync_groups").doc(groupKey);
  const groupSnap = await groupRef.get();

  if (groupSnap.exists) {
    const data = groupSnap.data() as SyncGroupDoc;
    if (!claimedUserIds?.has(data.userId)) {
      await writeSyncGroupDocs(
        db,
        groupKey,
        data.userId,
        data.token,
        email,
        displayName,
        clientName,
        casinAutoIds,
        aliasKeys,
      );
      return {
        userId: data.userId,
        token: data.token,
        usersCreated: 0,
        linksCreated: 0,
      };
    }
  }

  const userId = await resolveUserId(db, email, claimedUserIds);
  let token = generateAccessToken();
  while (!isValidAccessToken(token)) {
    token = generateAccessToken();
  }

  const usersCreated = (await ensureAuthUser(userId, email, displayName)) ? 1 : 0;

  const batch = db.batch();
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const keys = [...new Set([groupKey, ...aliasKeys])];

  for (const key of keys) {
    batch.set(db.collection("casin_sync_groups").doc(key), {
      userId,
      token,
      email: email ?? null,
      displayName,
      clientName: clientName ?? null,
      canonicalKey: groupKey,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  batch.set(db.collection("access_links").doc(token), {
    userId,
    email: email ?? null,
    displayName,
    clientName: clientName ?? null,
    casinAutoIds,
    revoked: false,
    createdAt: stamp,
    updatedAt: stamp,
  });

  batch.set(db.collection("access_links_by_user").doc(userId), {
    token,
    email: email ?? null,
    displayName,
    clientName: clientName ?? null,
    updatedAt: stamp,
  });

  batch.set(db.collection("users").doc(userId), {
    email: email ?? null,
    displayName,
    clientName: clientName ?? null,
    source: "casin-link",
    preferences: DEFAULT_PREFERENCES,
    createdAt: stamp,
    updatedAt: stamp,
  });

  await batch.commit();

  return { userId, token, usersCreated, linksCreated: 1 };
}

async function revokeAccessLink(db: Firestore, token: string): Promise<void> {
  await db.collection("access_links").doc(token).set(
    {
      revoked: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function overlapCount(autoIds: string[], groupAutoIds: Set<string>): number {
  let count = 0;
  for (const id of autoIds) {
    if (groupAutoIds.has(id)) count += 1;
  }
  return count;
}

function pickCanonicalLink(
  group: CasinUserGroup,
  candidates: ExistingAccessLink[],
  groupAutoIds: Set<string>,
): ExistingAccessLink | undefined {
  if (candidates.length === 0) return undefined;

  const clientName = group.clientName?.trim().toLowerCase();
  const ranked = [...candidates].sort((left, right) => {
    const overlapDelta =
      overlapCount(right.casinAutoIds, groupAutoIds) -
      overlapCount(left.casinAutoIds, groupAutoIds);
    if (overlapDelta !== 0) return overlapDelta;

    const leftName = (left.clientName || left.displayName || "")
      .trim()
      .toLowerCase();
    const rightName = (right.clientName || right.displayName || "")
      .trim()
      .toLowerCase();
    const leftMatch = clientName && leftName === clientName ? 1 : 0;
    const rightMatch = clientName && rightName === clientName ? 1 : 0;
    return rightMatch - leftMatch;
  });

  return ranked[0];
}

async function upsertCasinPolizaDocument(
  db: Firestore,
  userId: string,
  vehicleId: string,
  auto: CasinAutoRecord,
  clientLabel?: string,
): Promise<CasinPdfAttachResult> {
  const fields = mapCasinAutoToPolizaFields(auto, clientLabel);
  const docRef = db
    .collection("vehicles")
    .doc(vehicleId)
    .collection("documents")
    .doc(CASIN_POLIZA_DOC_ID);
  const existing = await docRef.get();
  const existingData = existing.data() ?? {};
  const aseguradora =
    typeof fields.aseguradora === "string" ? fields.aseguradora : "";
  const noPoliza =
    typeof fields.no_poliza === "string" ? fields.no_poliza : "";
  const displayName = [aseguradora, noPoliza].filter(Boolean).join(" · ")
    || "Póliza de seguro";

  const payload: Record<string, unknown> = {
    status: "ready",
    displayName,
    detectedType: "poliza_seguro",
    detectedTypeLabel: "Póliza de seguro",
    extractedFields: fields,
    source: "casin",
    casinAutoId: auto.id,
    confidence: 1,
    skipFullAnalysis: true,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(existing.exists
      ? {}
      : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
  };

  let index: CasinPolizaPdfIndex | null;
  try {
    index = await getCasinPolizaPdfIndex();
  } catch (error) {
    console.error("No se pudo listar Firedrive de CASIN:", error);
    index = null;
  }
  const pdf =
    index?.findBest(auto.numero_poliza, {
      clientName: resolveContractorName(auto) || clientLabel,
      brand: typeof fields.marca === "string" ? fields.marca : undefined,
      model: typeof fields.modelo === "string" ? fields.modelo : undefined,
      description: auto.descripcion_del_vehiculo,
      aseguradora,
    }) ?? null;

  if (pdf) {
    payload.storagePath = casinPolizaPdfStoragePath(userId, vehicleId);
    payload.mimeType = "application/pdf";
    payload.fileName = pdf.name;
    payload.casinPdfSource = pdf.fullPath;
    await docRef.set(payload, { merge: true });
    const copy = await copyCasinPolizaPdf({
      userId,
      vehicleId,
      policyNumber: auto.numero_poliza,
      hints: {
        clientName: resolveContractorName(auto) || clientLabel,
        brand: typeof fields.marca === "string" ? fields.marca : undefined,
        model: typeof fields.modelo === "string" ? fields.modelo : undefined,
        description: auto.descripcion_del_vehiculo,
        aseguradora,
      },
      existingSource:
        typeof existingData.casinPdfSource === "string"
          ? existingData.casinPdfSource
          : null,
      index: index ?? undefined,
    });
    return copy.result;
  }

  if (!isPdfStoragePath(existingData.storagePath)) {
    const docsSnap = await db
      .collection("vehicles")
      .doc(vehicleId)
      .collection("documents")
      .get();
    const filePoliza = docsSnap.docs.find((item) => {
      if (item.id === CASIN_POLIZA_DOC_ID) return false;
      const data = item.data();
      return (
        data.detectedType === "poliza_seguro" &&
        isPdfStoragePath(data.storagePath)
      );
    });

    if (filePoliza) {
      const currentFields =
        (filePoliza.data().extractedFields as Record<string, unknown> | undefined) ??
        {};
      await filePoliza.ref.set(
        {
          extractedFields: { ...currentFields, ...fields },
          skipFullAnalysis: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      if (existing.exists) {
        await docRef.delete();
      }
      return "unchanged";
    }

    payload.storagePath = `users/${userId}/vehicles/${vehicleId}/documents/${CASIN_POLIZA_DOC_ID}/manual.json`;
    payload.mimeType = "application/json";
    payload.fileName = "casin-poliza.json";
  }

  await docRef.set(payload, { merge: true });
  return index ? "missing" : "error";
}

async function deleteVehicleAndDocuments(
  vehicleRef: DocumentReference,
): Promise<void> {
  const docsSnap = await vehicleRef.collection("documents").get();
  for (const doc of docsSnap.docs) {
    await doc.ref.delete();
  }
  await vehicleRef.delete();
}

async function upsertVehicleForUser(
  db: Firestore,
  userId: string,
  auto: CasinAutoRecord,
  clientLabel?: string,
): Promise<{ created: boolean; pdf: CasinPdfAttachResult }> {
  const mapped = mapCasinAutoToVehicle(auto, clientLabel);
  const existingSnap = await db
    .collection("vehicles")
    .where("casinAutoId", "==", mapped.casinAutoId)
    .limit(1)
    .get();

  const ownerName = clientLabel?.trim() || mapped.ownerName || null;
  const existingData = existingSnap.empty ? {} : existingSnap.docs[0].data();
  const keepPlate = existingData.plateLocked === true;
  const plate =
    keepPlate && typeof existingData.plate === "string" && existingData.plate.trim()
      ? existingData.plate
      : mapped.plate;
  const state = keepPlate
    ? resolveVehicleState(plate, existingData.state as string | undefined)
    : mapped.state;

  const payload = {
    userId,
    casinAutoId: mapped.casinAutoId,
    plate,
    state,
    vehicleType:
      mapped.vehicleType === "moto" || existingData.vehicleType === "moto"
        ? "moto"
        : mapped.vehicleType,
    niv: mapped.niv ?? null,
    alias: mapped.alias ?? null,
    brand: mapped.brand ?? null,
    ownerName,
    modelYear: mapped.modelYear ?? null,
    insuranceExpiryDate: mapped.insuranceExpiryDate ?? null,
    reminderDays: [7, 1],
    localNotifications: true,
    calendarSync: false,
    includeInEmail: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  let vehicleId: string;
  if (existingSnap.empty) {
    const created = await db.collection("vehicles").add({
      ...payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    vehicleId = created.id;
  } else {
    const doc = existingSnap.docs[0];
    vehicleId = doc.id;
    await doc.ref.set(payload, { merge: true });
  }

  const pdf = await upsertCasinPolizaDocument(
    db,
    userId,
    vehicleId,
    auto,
    clientLabel,
  );
  return { created: existingSnap.empty, pdf };
}

async function reconcileVehiclesForUser(
  db: Firestore,
  userId: string,
  autos: CasinAutoRecord[],
  clientLabel?: string,
): Promise<{
  upserted: number;
  removed: number;
  pdfsCopied: number;
  pdfsMissing: number;
}> {
  const canonical = dedupeCasinAutos(filterVigenteCasinAutos(autos));
  const canonicalIds = new Set(canonical.map((auto) => auto.id));
  let pdfsCopied = 0;
  let pdfsMissing = 0;

  for (const auto of canonical) {
    const result = await upsertVehicleForUser(db, userId, auto, clientLabel);
    if (result.pdf === "copied") pdfsCopied += 1;
    if (result.pdf === "missing") pdfsMissing += 1;
  }

  let removed = 0;
  const userVehicles = await db
    .collection("vehicles")
    .where("userId", "==", userId)
    .get();
  const seenCanonical = new Set<string>();

  for (const doc of userVehicles.docs) {
    const data = doc.data();
    const casinAutoId =
      typeof data.casinAutoId === "string" ? data.casinAutoId : "";
    if (!casinAutoId) continue;

    if (!canonicalIds.has(casinAutoId) || seenCanonical.has(casinAutoId)) {
      await deleteVehicleAndDocuments(doc.ref);
      removed += 1;
      continue;
    }

    seenCanonical.add(casinAutoId);
  }

  return { upserted: canonical.length, removed, pdfsCopied, pdfsMissing };
}

export async function provisionVehiclesForAccessLink(
  db: Firestore,
  userId: string,
  casinAutoIds: string[],
  autosById: Map<string, CasinAutoRecord>,
  clientLabel?: string,
): Promise<number> {
  const autos = casinAutoIds
    .map((casinAutoId) => autosById.get(casinAutoId))
    .filter((auto): auto is CasinAutoRecord => Boolean(auto));
  const result = await reconcileVehiclesForUser(db, userId, autos, clientLabel);
  return result.upserted;
}

export async function syncCasinAutosFromPayload(
  db: Firestore,
  payload: CasinAutosPayload,
): Promise<CasinSyncResult> {
  resetCasinPolizaPdfIndex();
  const activeData = filterVigenteCasinAutos(payload.data);
  const groups = buildCasinUserGroups(activeData);
  const keepCasinAutoIds = new Set(
    groups.flatMap((group) =>
      dedupeCasinAutos(group.autos).map((auto) => auto.id),
    ),
  );
  const groupAutoIds = new Map(
    groups.map((group) => [
      group.groupKey,
      new Set(group.autos.map((auto) => auto.id)),
    ]),
  );

  const [groupsSnap, linksSnap] = await Promise.all([
    db.collection("casin_sync_groups").get(),
    db.collection("access_links").get(),
  ]);

  const existingGroups = new Map<string, SyncGroupDoc>();
  for (const doc of groupsSnap.docs) {
    existingGroups.set(doc.id, doc.data() as SyncGroupDoc);
  }

  const existingLinks: ExistingAccessLink[] = linksSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      token: doc.id,
      userId: String(data.userId ?? ""),
      casinAutoIds: Array.isArray(data.casinAutoIds)
        ? data.casinAutoIds.filter(
            (id: unknown): id is string => typeof id === "string",
          )
        : [],
      email: typeof data.email === "string" ? data.email : undefined,
      displayName:
        typeof data.displayName === "string" ? data.displayName : "Cliente",
      clientName:
        typeof data.clientName === "string" ? data.clientName : undefined,
      revoked: Boolean(data.revoked),
    };
  });

  const lookupOwners = new Map<string, string[]>();
  for (const group of groups) {
    for (const key of listCasinGroupLookupKeys(group)) {
      const owners = lookupOwners.get(key) ?? [];
      owners.push(group.groupKey);
      lookupOwners.set(key, owners);
    }
  }

  const uniqueAliasKeys = new Map<string, string[]>();
  for (const group of groups) {
    const aliases = listCasinGroupLookupKeys(group).filter((key) => {
      const owners = lookupOwners.get(key) ?? [];
      return owners.length === 1;
    });
    uniqueAliasKeys.set(group.groupKey, aliases);
  }

  const linksByGroup = new Map<string, ExistingAccessLink[]>();
  const assignedLinkTokens = new Set<string>();
  const crmAutoIds = new Set(
    payload.data.map((auto) => auto.id).filter(Boolean),
  );

  for (const link of existingLinks) {
    if (link.revoked || !link.userId) continue;

    let bestKey: string | undefined;
    let bestOverlap = 0;
    for (const group of groups) {
      const overlap = overlapCount(
        link.casinAutoIds,
        groupAutoIds.get(group.groupKey) ?? new Set(),
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestKey = group.groupKey;
      }
    }

    if (!bestKey || bestOverlap === 0) continue;
    assignedLinkTokens.add(link.token);
    const list = linksByGroup.get(bestKey) ?? [];
    list.push(link);
    linksByGroup.set(bestKey, list);
  }

  const claimedUserIds = new Set<string>();
  const canonicalTokens = new Set<string>();
  const keysToKeep = new Set<string>();
  const canonicalNameKeys = new Set(
    groups
      .map((group) => casinClientNameKey(group.clientName || group.displayName))
      .filter((key): key is string => Boolean(key)),
  );

  let usersCreated = 0;
  let linksCreated = 0;
  let linksRevoked = 0;
  let vehiclesUpserted = 0;
  let vehiclesRemoved = 0;
  let pdfsCopied = 0;
  let pdfsMissing = 0;

  for (const group of groups) {
    const casinAutoIds = group.autos.map((auto) => auto.id);
    const aliases = uniqueAliasKeys.get(group.groupKey) ?? [group.groupKey];
    const candidates = (linksByGroup.get(group.groupKey) ?? []).filter(
      (link) => link.userId && !claimedUserIds.has(link.userId),
    );
    const canonical = pickCanonicalLink(
      group,
      candidates,
      groupAutoIds.get(group.groupKey) ?? new Set(),
    );

    let reuse = canonical
      ? { userId: canonical.userId, token: canonical.token }
      : undefined;

    if (!reuse) {
      for (const key of aliases) {
        const existing = existingGroups.get(key);
        if (!existing?.userId || claimedUserIds.has(existing.userId)) continue;
        reuse = { userId: existing.userId, token: existing.token };
        break;
      }
    }

    const result = await getOrCreateSyncGroup(
      db,
      group.groupKey,
      group.email,
      group.displayName,
      group.clientName,
      casinAutoIds,
      {
        reuse,
        claimedUserIds,
        aliasKeys: aliases,
      },
    );

    claimedUserIds.add(result.userId);
    canonicalTokens.add(result.token);
    for (const key of aliases) keysToKeep.add(key);
    usersCreated += result.usersCreated;
    linksCreated += result.linksCreated;

    const vehicles = await reconcileVehiclesForUser(
      db,
      result.userId,
      group.autos,
      group.displayName,
    );
    vehiclesUpserted += vehicles.upserted;
    vehiclesRemoved += vehicles.removed;
    pdfsCopied += vehicles.pdfsCopied;
    pdfsMissing += vehicles.pdfsMissing;
  }

  const leftoverVehicles = await db.collection("vehicles").get();
  for (const doc of leftoverVehicles.docs) {
    const casinAutoId = doc.data().casinAutoId;
    if (typeof casinAutoId !== "string" || !casinAutoId) continue;
    if (keepCasinAutoIds.has(casinAutoId)) continue;
    await deleteVehicleAndDocuments(doc.ref);
    vehiclesRemoved += 1;
  }

  for (const link of existingLinks) {
    if (canonicalTokens.has(link.token) || link.revoked) continue;
    const moved = link.casinAutoIds.some((id) => crmAutoIds.has(id));
    const nameKey = casinClientNameKey(link.clientName || link.displayName);
    const sameClient = Boolean(nameKey && canonicalNameKeys.has(nameKey));
    if (!moved && !assignedLinkTokens.has(link.token) && !sameClient) continue;
    await revokeAccessLink(db, link.token);
    linksRevoked += 1;
  }

  for (const doc of groupsSnap.docs) {
    if (keysToKeep.has(doc.id)) continue;
    const key = doc.id;
    if (
      key.startsWith("email:") ||
      key.startsWith("auto:") ||
      key.startsWith("name:")
    ) {
      await doc.ref.delete();
    }
  }

  return {
    groups: groups.length,
    usersCreated,
    linksCreated,
    linksRevoked,
    vehiclesUpserted,
    vehiclesRemoved,
    pdfsCopied,
    pdfsMissing,
    generatedAt: payload.generatedAt,
  };
}

export async function copyVigenteCasinPolizaPdfs(
  db: Firestore,
  autos?: CasinAutoRecord[],
): Promise<{
  copied: number;
  unchanged: number;
  missing: number;
  error: number;
  vehicles: number;
}> {
  resetCasinPolizaPdfIndex();
  const records =
    autos ??
    filterVigenteCasinAutos((await fetchCasinAutosPayload()).data);
  const vigentes = dedupeCasinAutos(filterVigenteCasinAutos(records));
  const byId = new Map(vigentes.map((auto) => [auto.id, auto]));
  const ids = vigentes.map((auto) => auto.id);

  const stats = { copied: 0, unchanged: 0, missing: 0, error: 0, vehicles: 0 };

  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    if (!chunk.length) continue;
    const snap = await db
      .collection("vehicles")
      .where("casinAutoId", "in", chunk)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const casinAutoId =
        typeof data.casinAutoId === "string" ? data.casinAutoId : "";
      const userId = typeof data.userId === "string" ? data.userId : "";
      const auto = byId.get(casinAutoId);
      if (!auto || !userId) continue;

      stats.vehicles += 1;
      const result = await upsertCasinPolizaDocument(
        db,
        userId,
        doc.id,
        auto,
        typeof data.ownerName === "string" ? data.ownerName : undefined,
      );
      stats[result] += 1;
      console.log(
        `${result} ${auto.numero_poliza ?? ""} ${auto.placas ?? ""} ${doc.id}`,
      );
    }
  }

  return stats;
}

export async function syncCasinAutos(db: Firestore): Promise<CasinSyncResult> {
  const payload = await fetchCasinAutosPayload();
  return syncCasinAutosFromPayload(db, payload);
}

export function getCarcontrolAppBaseUrl(): string {
  return (
    process.env.CARCONTROL_APP_URL?.replace(/\/$/, "") ||
    "https://autos-fa58f.web.app"
  );
}

export function buildAccessLinkUrl(token: string): string {
  return `${getCarcontrolAppBaseUrl()}/acceso/${token}/`;
}
