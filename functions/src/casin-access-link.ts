import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  fetchCasinAutosPayload,
  buildAccessLinkUrl,
  provisionVehiclesForAccessLink,
} from "./casin-autos-sync";
import { isValidAccessToken, normalizeCasinEmail } from "./casin-autos-map";

const EXCHANGE_MIN_INTERVAL_MS = 1000;

export interface AccessLinkDoc {
  userId: string;
  email?: string | null;
  displayName: string;
  clientName?: string | null;
  casinAutoIds: string[];
  revoked?: boolean;
  lastAccessedAt?: admin.firestore.Timestamp;
}

export interface CasinClientVehicleItem {
  id: string;
  alias?: string;
  plate: string;
  state?: string;
  brand?: string;
  modelYear?: number;
  ownerName?: string;
}

export interface CasinClientDirectoryItem {
  userId: string;
  clientName: string;
  email?: string;
  token: string;
  link: string;
  revoked: boolean;
  vehicles: CasinClientVehicleItem[];
}

export interface AccessLinkListItem {
  token: string;
  email?: string;
  displayName: string;
  clientName?: string;
  vehicleCount: number;
  link: string;
  revoked: boolean;
}

function normalizeToken(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "Token inválido");
  }

  const token = raw.trim();
  if (!isValidAccessToken(token)) {
    throw new HttpsError("invalid-argument", "Token inválido");
  }

  return token;
}

async function ensureUserProfile(
  db: Firestore,
  userId: string,
  email: string | null | undefined,
  displayName: string,
): Promise<void> {
  const userRef = db.collection("users").doc(userId);
  const snap = await userRef.get();

  if (!snap.exists) {
    await userRef.set({
      email: email ?? null,
      displayName,
      source: "casin-link",
      preferences: {
        emailEnabled: true,
        monthlyReport: false,
        localNotifications: true,
        calendarSync: false,
        pushEnabled: false,
        defaultReminderDays: [7, 1],
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  await userRef.set(
    {
      displayName,
      email: email ?? snap.data()?.email ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function ensureAuthUserExists(
  userId: string,
  email: string | null | undefined,
  displayName: string,
): Promise<void> {
  const safeEmail = normalizeCasinEmail(email ?? undefined);

  try {
    await admin.auth().getUser(userId);
    return;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "auth/user-not-found") throw error;
  }

  await admin.auth().createUser({
    uid: userId,
    ...(safeEmail ? { email: safeEmail } : {}),
    displayName,
    emailVerified: false,
  });
}

export async function exchangeAccessLink(
  db: Firestore,
  rawToken: unknown,
): Promise<{ customToken: string; userId: string; displayName: string }> {
  const token = normalizeToken(rawToken);
  const linkRef = db.collection("access_links").doc(token);
  const linkSnap = await linkRef.get();

  if (!linkSnap.exists) {
    throw new HttpsError("not-found", "Enlace no válido o expirado");
  }

  const link = linkSnap.data() as AccessLinkDoc;
  if (link.revoked) {
    throw new HttpsError("permission-denied", "Enlace no válido o expirado");
  }

  const lastAccessedAt = link.lastAccessedAt?.toDate();
  if (
    lastAccessedAt &&
    Date.now() - lastAccessedAt.getTime() < EXCHANGE_MIN_INTERVAL_MS
  ) {
    throw new HttpsError("resource-exhausted", "Intenta de nuevo en un momento");
  }

  const userId = link.userId;
  const clientName = link.clientName?.trim() || undefined;
  const displayName = link.displayName?.trim() || "Cliente";
  const clientLabel = clientName || displayName;
  const email = link.email ?? undefined;
  const casinAutoIds = Array.isArray(link.casinAutoIds) ? link.casinAutoIds : [];

  await ensureAuthUserExists(userId, email, displayName);
  await ensureUserProfile(db, userId, email, displayName);

  try {
    const payload = await fetchCasinAutosPayload();
    const autosById = new Map(payload.data.map((auto) => [auto.id, auto]));
    await provisionVehiclesForAccessLink(
      db,
      userId,
      casinAutoIds,
      autosById,
      clientLabel,
    );
  } catch (error) {
    console.warn("exchangeAccessLink: vehicle provision skipped", error);
  }

  const customToken = await admin.auth().createCustomToken(userId);

  await linkRef.set(
    {
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { customToken, userId, displayName };
}

export async function listCasinAccessLinks(
  db: Firestore,
): Promise<AccessLinkListItem[]> {
  const snap = await db.collection("access_links").get();
  const items: AccessLinkListItem[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as AccessLinkDoc;
    items.push({
      token: doc.id,
      email: data.email ?? undefined,
      displayName: data.displayName,
      clientName: data.clientName ?? undefined,
      vehicleCount: Array.isArray(data.casinAutoIds) ? data.casinAutoIds.length : 0,
      link: buildAccessLinkUrl(doc.id),
      revoked: Boolean(data.revoked),
    });
  }

  items.sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  return items;
}

export async function listCasinClients(
  db: Firestore,
): Promise<CasinClientDirectoryItem[]> {
  const [linksSnap, vehiclesSnap] = await Promise.all([
    db.collection("access_links").get(),
    db.collection("vehicles").get(),
  ]);

  const vehiclesByUser = new Map<string, CasinClientVehicleItem[]>();

  for (const vehicleDoc of vehiclesSnap.docs) {
    const data = vehicleDoc.data();
    const userId = data.userId as string | undefined;
    if (!userId) continue;

    const item: CasinClientVehicleItem = {
      id: vehicleDoc.id,
      alias: typeof data.alias === "string" ? data.alias : undefined,
      plate: typeof data.plate === "string" ? data.plate : "—",
      state: typeof data.state === "string" ? data.state : undefined,
      brand: typeof data.brand === "string" ? data.brand : undefined,
      modelYear:
        typeof data.modelYear === "number" ? data.modelYear : undefined,
      ownerName:
        typeof data.ownerName === "string" ? data.ownerName : undefined,
    };

    const list = vehiclesByUser.get(userId) ?? [];
    list.push(item);
    vehiclesByUser.set(userId, list);
  }

  for (const [, vehicles] of vehiclesByUser) {
    vehicles.sort((a, b) =>
      (a.alias ?? a.plate).localeCompare(b.alias ?? b.plate, "es"),
    );
  }

  const clients: CasinClientDirectoryItem[] = [];

  for (const doc of linksSnap.docs) {
    const data = doc.data() as AccessLinkDoc;
    const userId = data.userId;
    const crmName = data.clientName?.trim();
    const displayName = data.displayName?.trim() || "Cliente";

    clients.push({
      userId,
      clientName: crmName || displayName,
      email: data.email ?? undefined,
      token: doc.id,
      link: buildAccessLinkUrl(doc.id),
      revoked: Boolean(data.revoked),
      vehicles: vehiclesByUser.get(userId) ?? [],
    });
  }

  clients.sort((a, b) => a.clientName.localeCompare(b.clientName, "es"));
  return clients;
}

export function assertCasinAdminSecret(provided: unknown, expected: string): void {
  if (typeof provided !== "string" || provided.trim() !== expected) {
    throw new HttpsError("permission-denied", "No autorizado");
  }
}
