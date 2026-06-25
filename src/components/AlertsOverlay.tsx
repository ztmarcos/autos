"use client";

import { useEffect } from "react";
import type { AppNotification } from "@/lib/types";
import {
  groupNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

interface AlertsOverlayProps {
  notifications: AppNotification[];
  onClose: () => void;
  onSelectVehicle: (vehicleId: string) => void;
}

function NotificationRow({
  n,
  onTap,
}: {
  n: AppNotification;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex w-full items-start gap-2 py-3 text-left ${
        !n.read ? "font-medium" : "text-black/60"
      }`}
    >
      <span className={!n.read ? "text-black" : "text-black/30"}>●</span>
      <span className="text-[15px]">
        {n.message} · {n.vehicleName}
      </span>
    </button>
  );
}

export function AlertsOverlay({
  notifications,
  onClose,
  onSelectVehicle,
}: AlertsOverlayProps) {
  const { todayItems, weekItems, olderItems } = groupNotifications(notifications);

  useEffect(() => {
    void markAllNotificationsRead(notifications);
  }, [notifications]);

  async function handleTap(n: AppNotification) {
    if (!n.read) await markNotificationRead(n.id);
    onSelectVehicle(n.vehicleId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3">
        <h2 className="text-lg font-semibold">Alertas</h2>
        <button type="button" onClick={onClose} className="text-xl" aria-label="Cerrar">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4">
        {notifications.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-black/50">Sin alertas</p>
        ) : (
          <>
            {todayItems.length > 0 && (
              <Section title="Hoy">
                {todayItems.map((n) => (
                  <NotificationRow key={n.id} n={n} onTap={() => handleTap(n)} />
                ))}
              </Section>
            )}
            {weekItems.length > 0 && (
              <Section title="Esta semana">
                {weekItems.map((n) => (
                  <NotificationRow key={n.id} n={n} onTap={() => handleTap(n)} />
                ))}
              </Section>
            )}
            {olderItems.length > 0 && (
              <Section title="Anteriores">
                {olderItems.map((n) => (
                  <NotificationRow key={n.id} n={n} onTap={() => handleTap(n)} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-black/10 py-2">
      <p className="py-2 text-[11px] font-medium uppercase tracking-wide text-black/40">
        {title}
      </p>
      {children}
    </section>
  );
}
