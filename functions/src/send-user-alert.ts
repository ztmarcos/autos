import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { sendEmail } from "./mail";
import { sendPushToUser } from "./push";
import type { EmailContent } from "./email-templates";
import { isDeliverableEmail } from "./vehicle-email";

export async function sendUserAlert(
  db: Firestore,
  options: {
    userId: string;
    userData: Record<string, unknown>;
    vehicleId: string;
    vehicleName: string;
    notificationType: string;
    message: string;
    emailSubject?: string;
    emailContent?: EmailContent;
    mailReady: boolean;
    pushTitle?: string;
    pushBody?: string;
    pushData?: Record<string, string>;
    includeInEmail?: boolean;
  },
): Promise<void> {
  const prefs = (options.userData.preferences as Record<string, unknown>) ?? {};

  await db.collection("notifications").add({
    userId: options.userId,
    vehicleId: options.vehicleId,
    vehicleName: options.vehicleName,
    type: options.notificationType,
    message: options.message,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const email = options.userData.email as string | undefined;
  const emailEnabled = prefs.emailEnabled !== false;
  const includeInEmail = options.includeInEmail !== false;

  if (
    emailEnabled &&
    includeInEmail &&
    options.mailReady &&
    options.emailSubject &&
    options.emailContent &&
    isDeliverableEmail(email)
  ) {
    try {
      await sendEmail(email!, options.emailSubject, options.emailContent);
    } catch (error) {
      console.error("Email alert failed:", error);
    }
  }

  if (prefs.pushEnabled === true) {
    try {
      await sendPushToUser(db, options.userId, {
        title: options.pushTitle ?? options.message,
        body: options.pushBody ?? options.vehicleName,
        data: options.pushData ?? { vehicleId: options.vehicleId },
      });
    } catch (error) {
      console.error("Push alert failed:", error);
    }
  }
}
