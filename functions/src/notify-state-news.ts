import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { APP_NAME } from "./app-name";
import { buildStateNewsEmail } from "./email-templates";
import { sendEmail } from "./mail";
import { sendPushToUser } from "./push";
import type { StateNewsAlert } from "./state-news-sources";
import { alertAppliesToVehicle } from "./vehicle-news-utils";
import { isDeliverableEmail } from "./vehicle-email";

function notifiedDocId(userId: string, alertId: string): string {
  return `${userId}_${alertId}`;
}

async function wasAlertNotified(
  db: Firestore,
  userId: string,
  alertId: string,
): Promise<boolean> {
  const snap = await db
    .collection("notified_state_news")
    .doc(notifiedDocId(userId, alertId))
    .get();
  return snap.exists;
}

async function markAlertNotified(
  db: Firestore,
  userId: string,
  alertId: string,
): Promise<void> {
  await db.collection("notified_state_news").doc(notifiedDocId(userId, alertId)).set({
    userId,
    alertId,
    notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function notifyUsersOfNewStateAlerts(
  db: Firestore,
  stateCode: string,
  newAlerts: StateNewsAlert[],
  mailReady: boolean,
): Promise<number> {
  if (newAlerts.length === 0) return 0;

  const vehiclesSnap = await db
    .collection("vehicles")
    .where("state", "==", stateCode)
    .get();

  if (vehiclesSnap.empty) return 0;

  type VehicleMatch = {
    vehicleId: string;
    vehicleName: string;
    plate: string;
    state: string;
    calcomania?: string;
    vehicleType?: string;
    alias?: string;
    brand?: string;
    userId: string;
  };

  const vehicles: VehicleMatch[] = vehiclesSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      vehicleId: doc.id,
      vehicleName: (data.alias as string) || (data.plate as string),
      plate: data.plate as string,
      state: data.state as string,
      calcomania: data.calcomania as string | undefined,
      vehicleType: data.vehicleType as string | undefined,
      alias: data.alias as string | undefined,
      brand: data.brand as string | undefined,
      userId: data.userId as string,
    };
  });

  const userCache = new Map<string, Record<string, unknown>>();
  let notifiedCount = 0;

  for (const alert of newAlerts) {
    const matchesByUser = new Map<string, VehicleMatch>();

    for (const vehicle of vehicles) {
      if (!alertAppliesToVehicle(alert, vehicle)) continue;
      if (!matchesByUser.has(vehicle.userId)) {
        matchesByUser.set(vehicle.userId, vehicle);
      }
    }

    for (const [userId, vehicle] of matchesByUser) {
      if (await wasAlertNotified(db, userId, alert.id)) continue;

      let userData = userCache.get(userId);
      if (!userData) {
        const userSnap = await db.collection("users").doc(userId).get();
        userData = userSnap.data() ?? {};
        userCache.set(userId, userData);
      }

      const prefs = (userData.preferences as Record<string, unknown>) ?? {};
      const message = alert.summary;

      await db.collection("notifications").add({
        userId,
        vehicleId: vehicle.vehicleId,
        vehicleName: vehicle.vehicleName,
        type: "general",
        message: `${alert.title} — ${message}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const email = userData.email as string | undefined;
      if (prefs.emailEnabled !== false && mailReady && isDeliverableEmail(email)) {
        try {
          await sendEmail(
            email!,
            `${APP_NAME}: ${alert.title}`,
            buildStateNewsEmail(alert, vehicle.vehicleName),
          );
        } catch (error) {
          console.error("State news email failed:", error);
        }
      }

      if (prefs.pushEnabled === true) {
        try {
          await sendPushToUser(db, userId, {
            title: alert.title,
            body: message,
            data: {
              vehicleId: vehicle.vehicleId,
              type: "noticia",
              alertId: alert.id,
            },
          });
        } catch (error) {
          console.error("State news push failed:", error);
        }
      }

      await markAlertNotified(db, userId, alert.id);
      notifiedCount += 1;
    }
  }

  return notifiedCount;
}
