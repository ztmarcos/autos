import type { Vehicle } from "@/lib/types";
import { getUpcomingItems, getVehicleDisplayName } from "@/lib/vehicles";
import { isNativePlatform } from "@/lib/local-notifications";
import { APP_NAME } from "@/config/app";

export async function requestCalendarPermission(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { CapacitorCalendar, CalendarPermissionScope } = await import(
      "@ebarooni/capacitor-calendar"
    );
    const result = await CapacitorCalendar.requestPermission({
      scope: CalendarPermissionScope.WRITE_CALENDAR,
    });
    return result.result === "granted";
  } catch {
    return false;
  }
}

export async function syncVehicleToCalendar(
  vehicle: Vehicle,
): Promise<Record<string, string>> {
  if (!isNativePlatform() || !vehicle.calendarSync) return {};

  const granted = await requestCalendarPermission();
  if (!granted) return {};

  const { CapacitorCalendar } = await import("@ebarooni/capacitor-calendar");
  const eventIds: Record<string, string> = { ...vehicle.calendarEventIds };

  const name = getVehicleDisplayName(vehicle);
  const upcoming = getUpcomingItems(vehicle);

  for (const item of upcoming) {
    const key = `${item.type}-${item.date}`;
    if (eventIds[key]) continue;

    try {
      const result = await CapacitorCalendar.createEvent({
        title: `${item.label} · ${name}`,
        startDate: new Date(item.date + "T09:00:00").getTime(),
        endDate: new Date(item.date + "T10:00:00").getTime(),
        isAllDay: false,
        description: `${APP_NAME} — ${item.label} para ${vehicle.plate}`,
      });
      if (result.id) {
        eventIds[key] = result.id;
      }
    } catch {
      // skip failed events
    }
  }

  return eventIds;
}

export async function removeVehicleCalendarEvents(
  vehicle: Vehicle,
): Promise<void> {
  if (!isNativePlatform() || !vehicle.calendarEventIds) return;

  const { CapacitorCalendar } = await import("@ebarooni/capacitor-calendar");
  for (const id of Object.values(vehicle.calendarEventIds)) {
    try {
      await CapacitorCalendar.deleteEvent({ id });
    } catch {
      // ignore
    }
  }
}
