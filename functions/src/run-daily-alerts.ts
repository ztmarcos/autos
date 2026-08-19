import type { Firestore } from "firebase-admin/firestore";
import { APP_NAME } from "./app-name";
import { buildAlertEmail } from "./email-templates";
import { inferNextVerificationDate } from "./mx-verification";
import { resolveVehicleState } from "./mx-plates";
import { sendUserAlert } from "./send-user-alert";
import { isMotoVehicle } from "./no-circula";
import { resolveInsuranceExpiry } from "./vehicle-insurance";

/** Verificación: 2 mails antes (7d y 1d) y 1 después (al día siguiente). */
const VERIFICATION_REMINDER_DAYS = [7, 1];

function computeDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function shouldSendEventAlert(
  type: string,
  days: number,
  reminderDays: number[],
): boolean {
  if (type === "verificacion") {
    return VERIFICATION_REMINDER_DAYS.includes(days) || days === -1;
  }
  if (type === "seguro") {
    return days === 0 || reminderDays.includes(days);
  }
  return days === 0 || reminderDays.includes(days) || days < 0;
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

    const moto = isMotoVehicle({
      vehicleType: typeof v.vehicleType === "string" ? v.vehicleType : undefined,
      alias: typeof v.alias === "string" ? v.alias : undefined,
      brand: typeof v.brand === "string" ? v.brand : undefined,
    });
    const verificationDate =
      !moto &&
      ((typeof v.verificationDate === "string" && v.verificationDate) ||
        inferNextVerificationDate(
          v.plate as string | undefined,
          resolveVehicleState(
            v.plate as string | undefined,
            v.state as string | undefined,
          ),
        ));
    if (verificationDate) {
      events.push({
        type: "verificacion",
        label: "Verificación",
        date: verificationDate,
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
      if (!Number.isFinite(days)) continue;
      if (!shouldSendEventAlert(ev.type, days, reminderDays)) continue;

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
