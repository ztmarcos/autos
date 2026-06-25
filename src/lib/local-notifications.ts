import type { Vehicle } from "@/lib/types";
import { getUpcomingItems, getVehicleDisplayName } from "@/lib/vehicles";
import { computeDaysUntil } from "@/lib/mx-rules";

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Capacitor } = require("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function notificationId(vehicleId: string, type: string, days: number): number {
  let hash = 0;
  const str = `${vehicleId}-${type}-${days}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100000;
}

export async function requestLocalNotificationPermission(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const result = await LocalNotifications.requestPermissions();
  return result.display === "granted";
}

export async function cancelVehicleNotifications(vehicleId: string): Promise<void> {
  if (!isNativePlatform()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  const ids = pending.notifications
    .filter((n) => n.extra?.vehicleId === vehicleId)
    .map((n) => ({ id: n.id }));
  if (ids.length > 0) {
    await LocalNotifications.cancel({ notifications: ids });
  }
}

export async function scheduleVehicleNotifications(
  vehicle: Vehicle,
): Promise<void> {
  if (!isNativePlatform() || !vehicle.localNotifications) return;

  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const granted = await requestLocalNotificationPermission();
  if (!granted) return;

  await cancelVehicleNotifications(vehicle.id);

  const name = getVehicleDisplayName(vehicle);
  const upcoming = getUpcomingItems(vehicle);
  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
    extra: { vehicleId: string };
  }> = [];

  for (const item of upcoming) {
    for (const daysBefore of vehicle.reminderDays) {
      const targetDate = new Date(item.date + "T09:00:00");
      targetDate.setDate(targetDate.getDate() - daysBefore);
      if (targetDate <= new Date()) continue;

      notifications.push({
        id: notificationId(vehicle.id, item.type, daysBefore),
        title: `${item.label} próxima`,
        body: `${name}: ${item.label} ${daysBefore === 0 ? "hoy" : `en ${daysBefore} días`}`,
        schedule: { at: targetDate },
        extra: { vehicleId: vehicle.id },
      });
    }
  }

  if (notifications.length === 0) return;

  await LocalNotifications.schedule({
    notifications: notifications.slice(0, 60),
  });
}

export async function rescheduleAllVehicles(vehicles: Vehicle[]): Promise<void> {
  for (const v of vehicles) {
    if (v.localNotifications) {
      await scheduleVehicleNotifications(v);
    }
  }
}

export function daysUntilLabel(dateStr: string): string {
  const days = computeDaysUntil(dateStr);
  if (days < 0) return "vencida";
  if (days === 0) return "hoy";
  return `en ${days} días`;
}
