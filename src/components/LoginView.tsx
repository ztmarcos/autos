"use client";

import { useEffect, useState } from "react";
import { signInDemo, signInDev } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { APP_NAME } from "@/config/app";
import { AppLogo } from "@/components/AppLogo";

export function LoginView() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState<"demo" | "dev" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      setLoading("demo");
      void signInDemo()
        .then(() => refresh())
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Error al iniciar sesión");
          setLoading(null);
        });
    }
  }, [refresh]);

  async function handleDemo() {
    setLoading("demo");
    setError(null);
    try {
      await signInDemo();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
      setLoading(null);
    }
  }

  async function handleDev() {
    setLoading("dev");
    setError(null);
    try {
      await signInDev();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--background)] px-6">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <AppLogo size="md" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-2 text-[15px] text-black/50">
          Control vehicular para México
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={handleDemo}
          disabled={loading !== null}
          className="btn-primary w-full py-3 text-sm font-medium disabled:opacity-50"
        >
          {loading === "demo" ? "Entrando…" : "Entrar a demo"}
        </button>
        <p className="text-center text-xs text-black/40">
          Mercedes, BMW y VW de ejemplo
        </p>
        <button
          type="button"
          onClick={handleDev}
          disabled={loading !== null}
          className="w-full py-2 text-xs text-black/45 underline underline-offset-2 disabled:opacity-50"
        >
          {loading === "dev" ? "Entrando…" : "Modo desarrollo"}
        </button>
      </div>

      {error && (
        <p className="max-w-sm text-center text-sm text-black/70">{error}</p>
      )}
    </div>
  );
}
