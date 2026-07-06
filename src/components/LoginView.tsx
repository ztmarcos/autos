"use client";

import { useEffect, useState } from "react";
import { signInDemo, signInDev, signInWithGoogle } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { APP_NAME } from "@/config/app";
import { AppLogo } from "@/components/AppLogo";

function GoogleIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function LoginView() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState<"google" | "demo" | "dev" | null>(
    null,
  );
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

  async function handleGoogle() {
    setLoading("google");
    setError(null);
    try {
      await signInWithGoogle();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
      setLoading(null);
    }
  }

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
        <p className="text-center text-sm text-black/55">
          ¿Recibiste un enlace de acceso? Ábrelo directamente para ver tus autos.
        </p>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading !== null}
          className="btn-secondary flex w-full items-center justify-center gap-2.5 py-3 text-sm font-medium disabled:opacity-50"
        >
          <GoogleIcon />
          {loading === "google" ? "Entrando…" : "Continuar con Google"}
        </button>
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
