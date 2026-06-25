import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { isSharedBrandLogoPath } from "@/lib/brand-logo";
import type { Vehicle, VehicleEvent, UpcomingItem, VehicleExpiryTag } from "@/lib/types";
import {
  computeDaysUntil,
  formatDaysLabel,
  getStateName,
  getUrgencyStatus,
} from "@/lib/mx-rules";
import {
  normalizeCalcomania,
  normalizeCardDateLiteral,
} from "@/lib/vehicle-card-map";
import { parseVehicleDateLiteral } from "@/lib/dates";

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function mapVehicle(id: string, data: Record<string, unknown>): Vehicle {
  return {
    id,
    userId: data.userId as string,
    alias: data.alias as string | undefined,
    plate: data.plate as string,
    state: data.state as string,
    vehicleType: (data.vehicleType as Vehicle["vehicleType"]) ?? "auto",
    calcomania: normalizeCalcomania(data.calcomania),
    brand: data.brand as string | undefined,
    brandLogoKey: data.brandLogoKey as string | undefined,
    brandLogoPath: data.brandLogoPath as string | undefined,
    brandLogoStatus: data.brandLogoStatus as Vehicle["brandLogoStatus"],
    niv: data.niv as string | undefined,
    cylinders: data.cylinders as number | undefined,
    ownerName: data.ownerName as string | undefined,
    cardIssueDate: data.cardIssueDate as string | undefined,
    cardExpiryDate: data.cardExpiryDate as string | undefined,
    verificationDate: data.verificationDate as string | undefined,
    tenenciaDate: data.tenenciaDate as string | undefined,
    refrendoDate: data.refrendoDate as string | undefined,
    serviceDate: data.serviceDate as string | undefined,
    lastServiceDate: data.lastServiceDate as string | undefined,
    insuranceExpiryDate: data.insuranceExpiryDate as string | undefined,
    modelYear: data.modelYear as number | undefined,
    serviceKm: data.serviceKm as number | undefined,
    currentKm: data.currentKm as number | undefined,
    reminderDays: (data.reminderDays as number[]) ?? [7, 1],
    localNotifications: (data.localNotifications as boolean) ?? true,
    calendarSync: (data.calendarSync as boolean) ?? false,
    includeInEmail: (data.includeInEmail as boolean) ?? true,
    calendarEventIds: data.calendarEventIds as Record<string, string> | undefined,
    casinAutoId: data.casinAutoId as string | undefined,
    createdAt: toDate(data.createdAt as Timestamp),
    updatedAt: toDate(data.updatedAt as Timestamp),
  };
}

export async function listVehicles(userId: string): Promise<Vehicle[]> {
  const q = query(
    collection(db, "vehicles"),
    where("userId", "==", userId),
    orderBy("updatedAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapVehicle(d.id, d.data()));
}

export function subscribeToUserVehicles(
  userId: string,
  onChange: (vehicles: Vehicle[]) => void,
): () => void {
  const q = query(
    collection(db, "vehicles"),
    where("userId", "==", userId),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => mapVehicle(d.id, d.data())));
  });
}

export async function createVehicle(
  userId: string,
  data: Omit<Vehicle, "id" | "userId" | "createdAt" | "updatedAt">,
): Promise<string> {
  const ref = await addDoc(
    collection(db, "vehicles"),
    stripUndefined({
      ...data,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

export async function updateVehicle(
  vehicleId: string,
  data: Partial<Vehicle>,
): Promise<void> {
  const { id: _id, userId: _uid, createdAt: _c, ...rest } = data;
  await updateDoc(
    doc(db, "vehicles", vehicleId),
    stripUndefined({
      ...rest,
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function deleteVehicle(vehicle: Pick<Vehicle, "id" | "brandLogoPath">): Promise<void> {
  if (vehicle.brandLogoPath && !isSharedBrandLogoPath(vehicle.brandLogoPath)) {
    try {
      await deleteObject(ref(storage, vehicle.brandLogoPath));
    } catch {
      // El logo puede no existir.
    }
  }
  await deleteDoc(doc(db, "vehicles", vehicle.id));
}

export function getVehicleDisplayName(v: Vehicle): string {
  return v.alias?.trim() || v.plate;
}

export function getUpcomingItems(
  vehicle: Vehicle,
  insuranceExpiry?: string,
): UpcomingItem[] {
  const items: UpcomingItem[] = [];

  if (vehicle.verificationDate) {
    const days = computeDaysUntil(vehicle.verificationDate);
    items.push({
      type: "verificacion",
      label: "Verificación",
      date: vehicle.verificationDate,
      daysUntil: days,
      overdue: days < 0,
    });
  }

  if (vehicle.tenenciaDate) {
    const days = computeDaysUntil(vehicle.tenenciaDate);
    items.push({
      type: "tenencia",
      label: "Tenencia",
      date: vehicle.tenenciaDate,
      daysUntil: days,
      overdue: days < 0,
    });
  }

  if (vehicle.refrendoDate) {
    const days = computeDaysUntil(vehicle.refrendoDate);
    items.push({
      type: "refrendo",
      label: "Refrendo",
      date: vehicle.refrendoDate,
      daysUntil: days,
      overdue: days < 0,
    });
  }

  if (vehicle.serviceDate) {
    const days = computeDaysUntil(vehicle.serviceDate);
    items.push({
      type: "servicio",
      label: "Servicio",
      date: vehicle.serviceDate,
      daysUntil: days,
      overdue: days < 0,
    });
  }

  if (insuranceExpiry) {
    const policyDate = parseVehicleDateLiteral(insuranceExpiry) ?? insuranceExpiry;
    const days = computeDaysUntil(policyDate);
    if (Number.isFinite(days)) {
      items.push({
        type: "seguro",
        label: "Póliza",
        date: parseVehicleDateLiteral(insuranceExpiry) ?? insuranceExpiry,
        daysUntil: days,
        overdue: days < 0,
      });
    }
  }

  return items.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function getNextUpcoming(
  vehicle: Vehicle,
  insuranceExpiry?: string,
): UpcomingItem | null {
  const items = getUpcomingItems(vehicle, insuranceExpiry);
  return items[0] ?? null;
}

const EXPIRY_TAG_ORDER: VehicleExpiryTag["type"][] = [
  "verificacion",
  "tenencia",
  "refrendo",
  "servicio",
  "seguro",
];

export function getVehicleExpiryTags(
  vehicle: Vehicle,
  insuranceExpiry?: string,
): VehicleExpiryTag[] {
  const tags: VehicleExpiryTag[] = [];

  const pushTag = (
    type: VehicleExpiryTag["type"],
    label: string,
    date: string | undefined,
  ) => {
    if (!date) return;
    const normalized = parseVehicleDateLiteral(date) ?? date;
    const daysUntil = computeDaysUntil(normalized);
    if (!Number.isFinite(daysUntil)) return;
    tags.push({
      type,
      label,
      date: normalized,
      daysUntil,
      urgency: getUrgencyStatus(daysUntil),
    });
  };

  pushTag("verificacion", "Verificación", vehicle.verificationDate);
  pushTag("tenencia", "Tenencia", vehicle.tenenciaDate);
  pushTag("refrendo", "Refrendo", vehicle.refrendoDate);
  pushTag("servicio", "Servicio", vehicle.serviceDate);
  if (insuranceExpiry) {
    pushTag("seguro", "Póliza", insuranceExpiry);
  }

  return tags.sort(
    (a, b) => EXPIRY_TAG_ORDER.indexOf(a.type) - EXPIRY_TAG_ORDER.indexOf(b.type),
  );
}

export function getVehicleUrgency(vehicle: Vehicle): "ok" | "warning" | "danger" {
  const next = getNextUpcoming(vehicle);
  if (!next) return "ok";
  return getUrgencyStatus(next.daysUntil);
}

export function getVehicleSubtitle(vehicle: Vehicle): string {
  const next = getNextUpcoming(vehicle);
  if (!next) return "Todo al día";
  return `${next.label} · ${formatDaysLabel(next.daysUntil)}`;
}

export function formatVehicleDisplayDate(dateStr: string): string {
  const normalized = parseVehicleDateLiteral(dateStr);
  if (normalized) {
    const d = new Date(`${normalized}T00:00:00`);
    return d.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const raw = dateStr.trim();
  return raw && raw !== "Invalid Date" ? raw : "";
}

export function getVehicleMetaLine(vehicle: Vehicle): string {
  return [
    vehicle.plate,
    getStateName(vehicle.state),
    vehicle.brand,
    vehicle.modelYear ? String(vehicle.modelYear) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function getVehicleDatesLine(
  vehicle: Vehicle,
  insuranceExpiry?: string,
): string {
  const parts = [
    vehicle.verificationDate
      ? `Verificación ${formatVehicleDisplayDate(vehicle.verificationDate)}`
      : null,
    vehicle.tenenciaDate
      ? `Tenencia ${formatVehicleDisplayDate(vehicle.tenenciaDate)}`
      : null,
    vehicle.refrendoDate
      ? `Refrendo ${formatVehicleDisplayDate(vehicle.refrendoDate)}`
      : null,
    vehicle.serviceDate
      ? `Servicio ${formatVehicleDisplayDate(vehicle.serviceDate)}`
      : null,
    insuranceExpiry
      ? `Póliza ${formatVehicleDisplayDate(insuranceExpiry)}`
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export async function listVehicleEvents(
  vehicleId: string,
): Promise<VehicleEvent[]> {
  const q = query(
    collection(db, "vehicles", vehicleId, "events"),
    orderBy("date", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      type: data.type,
      date: data.date,
      description: data.description,
      amount: data.amount,
      km: data.km,
      createdAt: toDate(data.createdAt),
    };
  });
}

export async function addVehicleEvent(
  vehicleId: string,
  event: Omit<VehicleEvent, "id" | "createdAt">,
): Promise<void> {
  await addDoc(collection(db, "vehicles", vehicleId, "events"), {
    ...event,
    createdAt: serverTimestamp(),
  });
}

export function sortVehiclesByUrgency(vehicles: Vehicle[]): Vehicle[] {
  return [...vehicles].sort((a, b) => {
    const aNext = getNextUpcoming(a, a.insuranceExpiryDate);
    const bNext = getNextUpcoming(b, b.insuranceExpiryDate);
    if (!aNext && !bNext) return 0;
    if (!aNext) return 1;
    if (!bNext) return -1;
    return aNext.daysUntil - bNext.daysUntil;
  });
}
