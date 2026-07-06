"use client";

import { useEffect, useState } from "react";
import type { UserPreferences } from "@/lib/types";
import { DEFAULT_PREFERENCES } from "@/lib/types";
import { getUserPreferences, updateUserPreferences } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { isNativePlatform } from "@/lib/local-notifications";
import { setupPushIfEnabled } from "@/lib/push-notifications";
import { requestCalendarPermission } from "@/lib/calendar-sync";
import { refreshPwaApplication } from "@/lib/pwa-refresh";

interface SettingsViewProps {
  userId: string;
  email: string | null;
  onBack: () => void;
}

export function SettingsView({ userId, email, onBack }: SettingsViewProps) {
  const { user, signOut } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [refreshing, setRefreshing] = useState(false);
  const native = isNativePlatform();

  useEffect(() => {
    getUserPreferences(userId).then(setPrefs);
  }, [userId]);

  async function update(partial: Partial<UserPreferences>) {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    await updateUserPreferences(userId, partial);

    if ("pushEnabled" in partial) {
      await setupPushIfEnabled(userId, next.pushEnabled);
    }
    if ("calendarSync" in partial && next.calendarSync && native) {
      await requestCalendarPermission();
    }
  }

  async function handleRefreshApp() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshPwaApplication();
    } catch {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white">
      <div className="border-b border-black/10 px-4 py-3">
        <button type="button" onClick={onBack} className="link-back">
          ← Volver
        </button>
        <h2 className="mt-2 text-xl font-semibold">Ajustes</h2>
      </div>

      <div className="divide-y divide-black/10">
        <section className="px-4 py-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-black/40">
            Cuenta
          </p>
          <p className="text-[15px]">{email ?? "—"}</p>
          {user?.sessionMode === "demo" && (
            <p className="mt-1 text-xs text-black/40">Sesión demo</p>
          )}
          {user?.sessionMode === "google" && (
            <p className="mt-1 text-xs text-black/40">Cuenta de Google</p>
          )}
        </section>

        <section className="space-y-4 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-black/40">
            Notificaciones
          </p>
          <SettingToggle
            label="Email"
            checked={prefs.emailEnabled}
            onChange={(v) => update({ emailEnabled: v })}
          />
          <p className="text-[11px] text-black/40">
            Recordatorios cuando toque, bienvenida y confirmación al registrar un auto.
          </p>
          <SettingToggle
            label="Alertas en iPhone"
            checked={prefs.localNotifications}
            onChange={(v) => update({ localNotifications: v })}
            disabled={!native}
            hint={!native ? "Disponible en app iOS" : undefined}
          />
          <SettingToggle
            label="Push remoto"
            checked={prefs.pushEnabled}
            onChange={(v) => update({ pushEnabled: v })}
            disabled={!native}
            hint={
              !native
                ? "Requiere app iOS + Apple Developer"
                : "Vencimientos y noticias urgentes sin abrir la app"
            }
          />
          <SettingToggle
            label="Calendario Apple"
            checked={prefs.calendarSync}
            onChange={(v) => update({ calendarSync: v })}
            disabled={!native}
            hint={!native ? "Disponible en app iOS" : undefined}
          />
        </section>

        <section className="px-4 py-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-black/40">
            Anticipación default
          </p>
          <div className="flex flex-wrap gap-2">
            {[30, 15, 7, 1].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => update({ defaultReminderDays: [d, 1] })}
                className={`rounded-full px-3 py-1 text-sm ${
                  prefs.defaultReminderDays.includes(d)
                    ? "bg-black text-white"
                    : "border border-black/20"
                }`}
              >
                {d} días
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-auto border-t border-black/10 px-4 py-4">
        <button
          type="button"
          onClick={() => void handleRefreshApp()}
          disabled={refreshing}
          className="btn-secondary w-full py-2.5 text-sm disabled:opacity-50"
        >
          {refreshing ? "Actualizando…" : "Actualizar app"}
        </button>
        <p className="mt-2 text-center text-[11px] text-black/40">
          Descarga la versión más reciente si no ves cambios.
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-4 w-full py-2.5 text-sm text-black/60 underline underline-offset-2"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <span className="text-[15px]">{label}</span>
        {hint && <p className="text-[11px] text-black/40">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? "bg-black" : "bg-black/15"
        } ${disabled ? "opacity-40" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
