"use client";

import { useEffect, useState } from "react";
import { CarControlApp } from "@/components/CarControlApp";
import { useAuth } from "@/components/AuthProvider";
import { APP_NAME } from "@/config/app";
import { AppLogo } from "@/components/AppLogo";
import { auth } from "@/lib/firebase";
import {
  extractAccessTokenFromPathname,
  getStoredLinkToken,
  signInWithAccessLink,
} from "@/lib/auth";

export function AccesoClient({ fallbackToken }: { fallbackToken?: string }) {
  const { user, loading, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;

    const fromPath =
      typeof window !== "undefined"
        ? extractAccessTokenFromPathname(window.location.pathname)
        : null;
    const fallback =
      fallbackToken?.trim() && fallbackToken.trim() !== "_"
        ? fallbackToken.trim()
        : null;
    const token = fromPath || fallback;

    if (!token) {
      setError("Enlace inválido");
      return;
    }

    if (getStoredLinkToken() === token && auth.currentUser) {
      setReady(true);
      return;
    }

    let active = true;
    void signInWithAccessLink(token)
      .then(() => {
        if (!active) return;
        refresh();
        setReady(true);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "No se pudo abrir tu sesión",
        );
      });

    return () => {
      active = false;
    };
  }, [fallbackToken, loading, refresh]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--background)] px-6">
        <AppLogo size="md" />
        <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="max-w-sm text-center text-sm text-black/70">{error}</p>
      </div>
    );
  }

  if (!ready || loading || !user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--background)] px-6">
        <AppLogo size="md" />
        <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-sm text-black/50">Entrando a tu sesión…</p>
      </div>
    );
  }

  return <CarControlApp />;
}
