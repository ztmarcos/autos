import type { Firestore } from "firebase-admin/firestore";
import { APP_NAME } from "./app-name";
import { buildAlertEmail } from "./email-templates";
import { sendUserAlert } from "./send-user-alert";
import { resolveInsuranceExpiry } from "./vehicle-insurance";

function computeDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export async function runDailyAlerts(db: Firestore, mailReady: boolean): Promise<void> {
  const vehiclesSnap = await db.collection("vehicles").get();

  for (const vDoc of vehiclesSnap.docs) {
    const v = vDoc.data();
    const userId = v.userId as string;
    const vehicleName = (v.alias as string) || (v.plate as string);
    const reminderDays = (v.reminderDays as number[]) ?? [7, 1];

    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data() ?? {};

    const events: Array<{
      type: string;
      label: string;
      date: string;
    }> = [];

    if (v.verificationDate) {
      events.push({
        type: "verificacion",
        label: "Verificación",
        date: v.verificationDate as string,
      });
    }
    if (v.tenenciaDate) {
      events.push({
        type: "tenencia",
        label: "Tenencia",
        date: v.tenenciaDate as string,
      });
    }
    if (v.refrendoDate) {
      events.push({
        type: "refrendo",
        label: "Refrendo",
        date: v.refrendoDate as string,
      });
    }
    if (v.serviceDate) {
      events.push({
        type: "servicio",
        label: "Servicio",
        date: v.serviceDate as string,
      });
    }

    const insuranceDate = await resolveInsuranceExpiry(db, vDoc.id, v);
    if (insuranceDate) {
      events.push({
        type: "seguro",
        label: "Póliza",
        date: insuranceDate,
      });
    }

    for (const ev of events) {
      const days = computeDaysUntil(ev.date);

      if (reminderDays.includes(Math.abs(days)) || days === 0 || days < 0) {
        const message =
          days < 0
            ? `${ev.label} vencida`
            : days === 0
              ? `${ev.label} vence hoy`
              : `${ev.label} en ${days} días`;

        await sendUserAlert(db, {
          userId,
          userData,
          vehicleId: vDoc.id,
          vehicleName,
          notificationType: ev.type,
          message,
          emailSubject: `${APP_NAME}: ${message} — ${vehicleName}`,
          emailContent: buildAlertEmail(vehicleName, ev.label, ev.date, days),
          mailReady,
          pushTitle: `${APP_NAME}`,
          pushBody: `${message} — ${vehicleName}`,
          pushData: { vehicleId: vDoc.id, type: ev.type },
          includeInEmail: v.includeInEmail !== false,
        });
      }
    }
  }
}
