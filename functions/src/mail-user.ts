import * as admin from "firebase-admin";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import {
  buildVehicleRegisteredEmail,
  buildWelcomeEmail,
} from "./email-templates";
import { sendEmail } from "./mail";
import {
  isDeliverableEmail,
  vehicleFromFirestore,
  type VehicleEmailSummary,
} from "./vehicle-email";
import { APP_NAME } from "./app-name";

export async function listVehiclesForUser(
  db: Firestore,
  userId: string,
): Promise<VehicleEmailSummary[]> {
  const snap = await db
    .collection("vehicles")
    .where("userId", "==", userId)
    .get();

  return snap.docs.map((doc) => vehicleFromFirestore(doc.data()));
}

export async function getUserEmailContext(
  db: Firestore,
  userId: string,
): Promise<{
  email: string;
  displayName?: string;
  emailEnabled: boolean;
} | null> {
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) return null;

  const data = userSnap.data()!;
  const email = data.email as string | undefined;
  if (!isDeliverableEmail(email)) return null;

  const prefs = data.preferences ?? {};
  return {
    email: email!,
    displayName: data.displayName as string | undefined,
    emailEnabled: prefs.emailEnabled !== false,
  };
}

export async function sendWelcomeEmailForUser(
  db: Firestore,
  userId: string,
  displayName?: string,
): Promise<void> {
  const context = await getUserEmailContext(db, userId);
  if (!context?.emailEnabled) return;

  const vehicles = await listVehiclesForUser(db, userId);
  await sendEmail(
    context.email,
    `Bienvenido a ${APP_NAME}`,
    buildWelcomeEmail(displayName ?? context.displayName, vehicles),
  );
}

export async function sendVehicleRegisteredEmailForUser(
  db: Firestore,
  userId: string,
  vehicleId: string,
  vehicleData: DocumentData,
): Promise<void> {
  const context = await getUserEmailContext(db, userId);
  if (!context?.emailEnabled) return;

  const vehicle = vehicleFromFirestore(vehicleData);

  await db.collection("notifications").add({
    userId,
    vehicleId,
    vehicleName: vehicle.displayName,
    type: "general",
    message: `Auto registrado: ${vehicle.displayName}`,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sendEmail(
    context.email,
    `${APP_NAME} — Registrado: ${vehicle.displayName}`,
    buildVehicleRegisteredEmail(vehicle),
  );
}
