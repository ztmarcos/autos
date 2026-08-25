import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  fetchCasinAutosPayload,
  buildAccessLinkUrl,
  provisionVehiclesForAccessLink,
} from "./casin-autos-sync";
import { casinClientNameKey, casinVehicleIdentityKey, isValidAccessToken, normalizeCasinEmail, parseVehicleDateLiteral, todayInMexicoCity } from "./casin-autos-map";
import { resolveVehicleState } from "./mx-plates";

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
  niv?: string;
  vehicleType?: string;
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
        emailEnabled: false,
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

async function activateNotificationsOnAppOpen(
  db: Firestore,
  userId: string,
): Promise<void> {
  const userRef = db.collection("users").doc(userId);
  const snap = await userRef.get();
  if (!snap.exists || snap.data()?.appOpenedAt) return;

  await userRef.update({
    appOpenedAt: admin.firestore.FieldValue.serverTimestamp(),
    "preferences.emailEnabled": true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
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
): Promise<{ customToken: string; userId: string; displayName: string; token: string }> {
  const token = normalizeToken(rawToken);
  return completeAccessLinkExchange(db, token);
}

export interface CasinClientEmailChoice {
  token: string;
  clientName: string;
  vehicleCount: number;
}

export type ExchangeCasinClientEmailResult =
  | {
      customToken: string;
      userId: string;
      displayName: string;
      token: string;
    }
  | { choices: CasinClientEmailChoice[] };

export async function exchangeCasinClientEmail(
  db: Firestore,
  rawEmail: unknown,
  rawToken?: unknown,
): Promise<ExchangeCasinClientEmailResult> {
  if (typeof rawToken === "string" && rawToken.trim()) {
    const token = normalizeToken(rawToken);
    const linkSnap = await db.collection("access_links").doc(token).get();
    if (!linkSnap.exists) {
      throw new HttpsError("not-found", "Cuenta no encontrada");
    }
    const link = linkSnap.data() as AccessLinkDoc;
    if (link.revoked) {
      throw new HttpsError("permission-denied", "Cuenta no disponible");
    }
    const email = normalizeCasinEmail(
      typeof rawEmail === "string" ? rawEmail : link.email ?? undefined,
    );
    if (!email) {
      throw new HttpsError("invalid-argument", "Correo inválido");
    }
    const linkEmail = normalizeCasinEmail(link.email ?? undefined);
    if (linkEmail && linkEmail !== email) {
      throw new HttpsError("permission-denied", "Correo no coincide con la cuenta");
    }
    return completeAccessLinkExchange(db, token);
  }

  const email = normalizeCasinEmail(
    typeof rawEmail === "string" ? rawEmail : undefined,
  );
  if (!email) {
    throw new HttpsError("invalid-argument", "Correo inválido");
  }

  const snap = await db
    .collection("access_links")
    .where("email", "==", email)
    .get();

  const matches = snap.docs
    .map((doc) => {
      const data = doc.data() as AccessLinkDoc;
      if (data.revoked) return null;
      const clientName =
        data.clientName?.trim() || data.displayName?.trim() || "Cliente";
      const vehicleCount = Array.isArray(data.casinAutoIds)
        ? data.casinAutoIds.length
        : 0;
      return {
        token: doc.id,
        clientName,
        vehicleCount,
      } satisfies CasinClientEmailChoice;
    })
    .filter((item): item is CasinClientEmailChoice => Boolean(item))
    .sort((left, right) =>
      left.clientName.localeCompare(right.clientName, "es"),
    );

  if (matches.length === 0) {
    throw new HttpsError(
      "not-found",
      "No encontramos una cuenta activa con ese correo",
    );
  }

  if (matches.length === 1) {
    return completeAccessLinkExchange(db, matches[0].token);
  }

  return { choices: matches };
}

async function completeAccessLinkExchange(
  db: Firestore,
  token: string,
): Promise<{ customToken: string; userId: string; displayName: string; token: string }> {
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
  await activateNotificationsOnAppOpen(db, userId);

  try {
    const payload = await fetchCasinAutosPayload();
    const autosById = new Map(
      payload.data
        .filter((auto) => auto.id?.trim())
        .map((auto) => [auto.id, auto]),
    );
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

  return { customToken, userId, displayName, token };
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
  const today = todayInMexicoCity();

  for (const vehicleDoc of vehiclesSnap.docs) {
    const data = vehicleDoc.data();
    const userId = data.userId as string | undefined;
    if (!userId) continue;

    const expiry = parseVehicleDateLiteral(
      typeof data.insuranceExpiryDate === "string"
        ? data.insuranceExpiryDate
        : undefined,
    );
    const fromCasin =
      typeof data.casinAutoId === "string" && Boolean(data.casinAutoId.trim());
    if (fromCasin && (!expiry || expiry < today)) continue;
    if (!fromCasin && expiry && expiry < today) continue;

    const item: CasinClientVehicleItem = {
      id: vehicleDoc.id,
      alias: typeof data.alias === "string" ? data.alias : undefined,
      plate: typeof data.plate === "string" ? data.plate : "—",
      state: resolveVehicleState(
        typeof data.plate === "string" ? data.plate : undefined,
        typeof data.state === "string" ? data.state : undefined,
      ),
      brand: typeof data.brand === "string" ? data.brand : undefined,
      modelYear:
        typeof data.modelYear === "number" ? data.modelYear : undefined,
      ownerName:
        typeof data.ownerName === "string" ? data.ownerName : undefined,
      niv: typeof data.niv === "string" ? data.niv : undefined,
      vehicleType:
        typeof data.vehicleType === "string" ? data.vehicleType : undefined,
    };

    const list = vehiclesByUser.get(userId) ?? [];
    list.push(item);
    vehiclesByUser.set(userId, list);
  }

  for (const [userId, vehicles] of vehiclesByUser) {
    const seen = new Set<string>();
    const unique: CasinClientVehicleItem[] = [];
    for (const vehicle of vehicles) {
      const key = casinVehicleIdentityKey({
        id: vehicle.id,
        niv: vehicle.niv,
        plate: vehicle.plate,
      });
      if (seen.has(key) && !key.startsWith("auto:")) continue;
      seen.add(key);
      unique.push(vehicle);
    }
    unique.sort((a, b) =>
      (a.alias ?? a.plate).localeCompare(b.alias ?? b.plate, "es"),
    );
    vehiclesByUser.set(userId, unique);
  }

  const clients: CasinClientDirectoryItem[] = [];
  const seenUsers = new Set<string>();

  const sortedLinks = [...linksSnap.docs].sort((left, right) => {
    const leftData = left.data() as AccessLinkDoc;
    const rightData = right.data() as AccessLinkDoc;
    const leftCount = Array.isArray(leftData.casinAutoIds)
      ? leftData.casinAutoIds.length
      : 0;
    const rightCount = Array.isArray(rightData.casinAutoIds)
      ? rightData.casinAutoIds.length
      : 0;
    if (rightCount !== leftCount) return rightCount - leftCount;
    const leftEmail = leftData.email ? 1 : 0;
    const rightEmail = rightData.email ? 1 : 0;
    return rightEmail - leftEmail;
  });

  for (const doc of sortedLinks) {
    const data = doc.data() as AccessLinkDoc;
    if (data.revoked) continue;

    const userId = data.userId;
    if (!userId || seenUsers.has(userId)) continue;

    const crmName = data.clientName?.trim();
    const displayName = data.displayName?.trim() || "Cliente";
    const clientName = crmName || displayName;
    const nameKey = casinClientNameKey(clientName);
    if (nameKey && seenUsers.has(`name:${nameKey}`)) continue;

    const vehicles = vehiclesByUser.get(userId) ?? [];
    if (vehicles.length === 0) continue;

    seenUsers.add(userId);
    if (nameKey) seenUsers.add(`name:${nameKey}`);

    clients.push({
      userId,
      clientName: crmName || displayName,
      email: data.email ?? undefined,
      token: doc.id,
      link: buildAccessLinkUrl(doc.id),
      revoked: false,
      vehicles,
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
