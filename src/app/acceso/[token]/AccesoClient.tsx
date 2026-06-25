"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithAccessLink } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { APP_NAME } from "@/config/app";
import { AppLogo } from "@/components/AppLogo";

function extractTokenFromPathname(pathname: string): string | null {
  const match = pathname.match(/\/acceso\/([^/]+)\/?$/);
  const token = match?.[1]?.trim();
  if (!token || token === "_") return null;
  return token;
}

export function AccesoClient({ fallbackToken }: { fallbackToken?: string }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromPath =
      typeof window !== "undefined"
        ? extractTokenFromPathname(window.location.pathname)
        : null;
    const token = fromPath || fallbackToken?.trim() || null;

    if (!token) {
      setError("Enlace inválido");
      return;
    }

    let active = true;

    void signInWithAccessLink(token)
      .then(() => {
        if (!active) return;
        refresh();
        router.replace("/");
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
  }, [fallbackToken, refresh, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--background)] px-6">
      <AppLogo size="md" />
      <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
      {error ? (
        <p className="max-w-sm text-center text-sm text-black/70">{error}</p>
      ) : (
        <p className="text-sm text-black/50">Entrando a tu sesión…</p>
      )}
    </div>
  );
}
