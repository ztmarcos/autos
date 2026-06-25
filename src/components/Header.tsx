"use client";

import { APP_NAME } from "@/config/app";
import { AppLogo } from "@/components/AppLogo";

interface HeaderProps {
  title?: string;
  unreadCount: number;
  onAlerts: () => void;
  onSettings: () => void;
  onBack?: () => void;
}

export function Header({
  title = APP_NAME,
  unreadCount,
  onAlerts,
  onSettings,
  onBack,
}: HeaderProps) {
  const showBrand = !onBack || title === APP_NAME;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="link-back shrink-0"
            aria-label="Volver"
          >
            ←
          </button>
        )}
        {showBrand && <AppLogo size="sm" className="shrink-0" />}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onAlerts}
          className="relative text-lg"
          aria-label="Alertas"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-danger)] px-1 text-[10px] font-medium text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="text-lg"
          aria-label="Ajustes"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
