import type { Firestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { APP_NAME } from "./app-name";
import { buildAlertEmail, buildVerificationPeriodEmail } from "./email-templates";
import {
  buildExpiryRolloverPatch,
  daysUntilMexicoCity,
  resolveTenenciaDate,
} from "./expiry-cycle";
import {
  formatVerificationPeriodLabel,
  inferNextVerificationPeriod,
  verificationPeriodPhase,
} from "./mx-verification";
import { resolveVehicleState } from "./mx-plates";
import { sendUserAlert } from "./send-user-alert";
import { isMotoVehicle } from "./no-circula";
import { resolveInsuranceExpiry } from "./vehicle-insurance";

/** Verificación y tenencia: 2 mails antes (7d y 1d), el día, y 1 después. */
const EXPIRY_REMINDER_DAYS = [7, 1, 0, -1];

function shouldSendEventAlert(
  type: string,
  days: number,
  reminderDays: number[],
): boolean {
  if (type === "verificacion" || type === "tenencia" || type === "refrendo") {
    return EXPIRY_REMINDER_DAYS.includes(days) || reminderDays.includes(days);
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

    const moto = isMotoVehicle({
      vehicleType: typeof v.vehicleType === "string" ? v.vehicleType : undefined,
      alias: typeof v.alias === "string" ? v.alias : undefined,
      brand: typeof v.brand === "string" ? v.brand : undefined,
    });
    const state = resolveVehicleState(
      v.plate as string | undefined,
      v.state as string | undefined,
    );

    const events: Array<{
      type: string;
      label: string;
      date: string;
    }> = [];

    const storedVerification =
      typeof v.verificationDate === "string" && v.verificationDate.trim()
        ? v.verificationDate.trim()
        : null;
    const verificationDate = !moto ? storedVerification : null;
    if (verificationDate) {
      events.push({
        type: "verificacion",
        label: "Verificación",
        date: verificationDate,
      });
    } else if (!moto) {
      const period = inferNextVerificationPeriod(
        typeof v.plate === "string" ? v.plate : undefined,
        state,
      );
      const phase = period ? verificationPeriodPhase(period) : null;
      if (period && phase) {
        const periodLabel = formatVerificationPeriodLabel(period);
        const copy = {
          opens: `Abre el periodo de verificación (${periodLabel})`,
          mid: `Sigue abierto el periodo de verificación (${periodLabel})`,
          last_month: `Último mes para verificar (${periodLabel})`,
          due: `Hoy cierra el periodo de verificación (${periodLabel})`,
          overdue: `Periodo de verificación vencido (${periodLabel})`,
        }[phase];
        await sendUserAlert(db, {
          userId,
          userData,
          vehicleId: vDoc.id,
          vehicleName,
          notificationType: "verificacion",
          message: copy,
          emailSubject: `${APP_NAME}: ${copy} — ${vehicleName}`,
          emailContent: buildVerificationPeriodEmail(
            vehicleName,
            periodLabel,
            phase,
          ),
          mailReady,
          pushTitle: `${APP_NAME}`,
          pushBody: `${copy} — ${vehicleName}`,
          pushData: { vehicleId: vDoc.id, type: "verificacion" },
          includeInEmail: v.includeInEmail !== false,
        });
      }
    }

    const storedTenencia =
      typeof v.tenenciaDate === "string" && v.tenenciaDate.trim()
        ? v.tenenciaDate.trim()
        : null;
    const tenenciaDate = storedTenencia || resolveTenenciaDate(v.tenenciaDate);
    if (tenenciaDate) {
      events.push({
        type: "tenencia",
        label: "Tenencia",
        date: tenenciaDate,
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
      const days = daysUntilMexicoCity(ev.date);
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

    const rollover = buildExpiryRolloverPatch({ ...v, state });
    if (Object.keys(rollover).length > 0) {
      const update: Record<string, unknown> = {
        ...rollover,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (rollover.verificationDate === null) {
        update.verificationDate = admin.firestore.FieldValue.delete();
      }
      await vDoc.ref.update(update);
    }
  }
}
