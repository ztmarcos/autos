import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppNotification } from "@/lib/types";

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  return value;
}

function mapNotification(
  id: string,
  data: Record<string, unknown>,
): AppNotification {
  return {
    id,
    userId: data.userId as string,
    vehicleId: data.vehicleId as string,
    vehicleName: data.vehicleName as string,
    type: data.type as AppNotification["type"],
    message: data.message as string,
    read: (data.read as boolean) ?? false,
    createdAt: toDate(data.createdAt as Timestamp),
  };
}

export async function listNotifications(
  userId: string,
): Promise<AppNotification[]> {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapNotification(d.id, d.data()));
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapNotification(d.id, d.data())));
  });
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

const BATCH_SIZE = 400;

export async function markAllNotificationsRead(
  notifications: AppNotification[],
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;

  for (let i = 0; i < unread.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const n of unread.slice(i, i + BATCH_SIZE)) {
      batch.update(doc(db, "notifications", n.id), { read: true });
    }
    await batch.commit();
  }
}

export async function deleteUserNotifications(userId: string): Promise<void> {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

export async function createNotification(
  data: Omit<AppNotification, "id" | "createdAt">,
): Promise<void> {
  await addDoc(collection(db, "notifications"), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export function getUnreadCount(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}

export function groupNotifications(notifications: AppNotification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const todayItems: AppNotification[] = [];
  const weekItems: AppNotification[] = [];
  const olderItems: AppNotification[] = [];

  for (const n of notifications) {
    const d = new Date(n.createdAt);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) {
      todayItems.push(n);
    } else if (d >= today && d < weekEnd) {
      weekItems.push(n);
    } else if (d > today) {
      weekItems.push(n);
    } else {
      olderItems.push(n);
    }
  }

  return { todayItems, weekItems, olderItems };
}
