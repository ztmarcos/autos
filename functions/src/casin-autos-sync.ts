import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import {
  buildCasinUserGroups,
  CASIN_AUTOS_URL,
  type CasinAutoRecord,
  type CasinAutosPayload,
  isValidAccessToken,
  mapCasinAutoToVehicle,
  normalizeCasinEmail,
} from "./casin-autos-map";

const DEFAULT_PREFERENCES = {
  emailEnabled: true,
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
  vehiclesUpserted: number;
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
): Promise<string> {
  const safeEmail = normalizeCasinEmail(email);
  if (safeEmail) {
    try {
      const existing = await admin.auth().getUserByEmail(safeEmail);
      return existing.uid;
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
    if (code === "auth/email-already-exists" || code === "auth/uid-already-exists") {
      return false;
    }
    throw error;
  }
}

async function getOrCreateSyncGroup(
  db: Firestore,
  groupKey: string,
  email: string | undefined,
  displayName: string,
  clientName: string | undefined,
  casinAutoIds: string[],
): Promise<{ userId: string; token: string; usersCreated: number; linksCreated: number }> {
  const groupRef = db.collection("casin_sync_groups").doc(groupKey);
  const groupSnap = await groupRef.get();

  if (groupSnap.exists) {
    const data = groupSnap.data() as SyncGroupDoc;
    const token = data.token;
    const userId = data.userId;

    await db.collection("access_links").doc(token).set(
      {
        userId,
        email: email ?? null,
        displayName,
        clientName: clientName ?? null,
        casinAutoIds,
        revoked: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await groupRef.set(
      {
        email: email ?? null,
        displayName,
        clientName: clientName ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await db.collection("users").doc(userId).set(
      {
        displayName,
        clientName: clientName ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { userId, token, usersCreated: 0, linksCreated: 0 };
  }

  const userId = await resolveUserId(db, email);
  let token = generateAccessToken();
  while (!isValidAccessToken(token)) {
    token = generateAccessToken();
  }

  const usersCreated = (await ensureAuthUser(userId, email, displayName)) ? 1 : 0;

  const batch = db.batch();

  batch.set(groupRef, {
    userId,
    token,
    email: email ?? null,
    displayName,
    clientName: clientName ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  batch.set(db.collection("access_links").doc(token), {
    userId,
    email: email ?? null,
    displayName,
    clientName: clientName ?? null,
    casinAutoIds,
    revoked: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  batch.set(db.collection("access_links_by_user").doc(userId), {
    token,
    email: email ?? null,
    displayName,
    clientName: clientName ?? null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  batch.set(db.collection("users").doc(userId), {
    email: email ?? null,
    displayName,
    clientName: clientName ?? null,
    source: "casin-link",
    preferences: DEFAULT_PREFERENCES,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return { userId, token, usersCreated, linksCreated: 1 };
}

async function upsertVehicleForUser(
  db: Firestore,
  userId: string,
  auto: CasinAutoRecord,
  clientLabel?: string,
): Promise<boolean> {
  const mapped = mapCasinAutoToVehicle(auto, clientLabel);
  const existingSnap = await db
    .collection("vehicles")
    .where("casinAutoId", "==", mapped.casinAutoId)
    .limit(1)
    .get();

  const ownerName = clientLabel?.trim() || mapped.ownerName || null;

  const payload = {
    userId,
    casinAutoId: mapped.casinAutoId,
    plate: mapped.plate,
    state: mapped.state,
    vehicleType: mapped.vehicleType,
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

  if (existingSnap.empty) {
    await db.collection("vehicles").add({
      ...payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  const doc = existingSnap.docs[0];
  await doc.ref.set(payload, { merge: true });
  return false;
}

export async function provisionVehiclesForAccessLink(
  db: Firestore,
  userId: string,
  casinAutoIds: string[],
  autosById: Map<string, CasinAutoRecord>,
  clientLabel?: string,
): Promise<number> {
  let upserted = 0;

  for (const casinAutoId of casinAutoIds) {
    const auto = autosById.get(casinAutoId);
    if (!auto) continue;
    await upsertVehicleForUser(db, userId, auto, clientLabel);
    upserted += 1;
  }

  return upserted;
}

export async function syncCasinAutosFromPayload(
  db: Firestore,
  payload: CasinAutosPayload,
): Promise<CasinSyncResult> {
  const groups = buildCasinUserGroups(payload.data);

  let usersCreated = 0;
  let linksCreated = 0;
  let vehiclesUpserted = 0;

  for (const group of groups) {
    const casinAutoIds = group.autos.map((auto) => auto.id);
    const { userId, usersCreated: createdUsers, linksCreated: createdLinks } =
      await getOrCreateSyncGroup(
        db,
        group.groupKey,
        group.email,
        group.displayName,
        group.clientName,
        casinAutoIds,
      );

    usersCreated += createdUsers;
    linksCreated += createdLinks;

    for (const auto of group.autos) {
      const isNew = await upsertVehicleForUser(
        db,
        userId,
        auto,
        group.displayName,
      );
      if (isNew) vehiclesUpserted += 1;
      else vehiclesUpserted += 1;
    }
  }

  return {
    groups: groups.length,
    usersCreated,
    linksCreated,
    vehiclesUpserted,
    generatedAt: payload.generatedAt,
  };
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
