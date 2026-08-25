"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  getStoredClientEmail,
  getStoredLinkToken,
  signInDemo,
  signInDev,
  signInWithAccessLink,
  signInWithClientEmail,
  type CasinClientEmailChoice,
} from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { APP_NAME } from "@/config/app";
import { AppLogo } from "@/components/AppLogo";
import { IS_DEMO_HOSTING } from "@/config/hosting";

function DemoHostingLogin() {
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInDemo(password);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Contraseña incorrecta");
      setLoading(false);
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

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xs flex-col gap-3"
      >
        <label className="text-center text-sm text-black/55">
          Ingresa la contraseña de acceso
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input text-center"
          placeholder="Contraseña"
          autoComplete="current-password"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="btn-primary w-full py-3 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      {error && (
        <p className="max-w-sm text-center text-sm text-black/70">{error}</p>
      )}
    </div>
  );
}

function ClientEmailLogin() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<CasinClientEmailChoice[] | null>(null);

  useEffect(() => {
    setEmail(getStoredClientEmail() ?? "");

    const token = getStoredLinkToken();
    if (token) {
      let active = true;
      void signInWithAccessLink(token)
        .then(() => {
          if (!active) return;
          refresh();
        })
        .catch(() => {
          if (!active) return;
          setRestoring(false);
        });
      return () => {
        active = false;
      };
    }

    const storedEmail = getStoredClientEmail();
    if (!storedEmail) {
      setRestoring(false);
      return;
    }

    let active = true;
    void signInWithClientEmail(storedEmail)
      .then((result) => {
        if (!active) return;
        if ("choices" in result) {
          if (result.choices.length === 1) {
            return signInWithClientEmail(storedEmail, result.choices[0].token);
          }
          setChoices(result.choices);
          setRestoring(false);
          return null;
        }
        refresh();
      })
      .then((user) => {
        if (user && !("choices" in user)) refresh();
        if (!active) return;
        setRestoring(false);
      })
      .catch(() => {
        if (!active) return;
        setRestoring(false);
      });

    return () => {
      active = false;
    };
  }, [refresh]);

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setChoices(null);
    try {
      const result = await signInWithClientEmail(email);
      if ("choices" in result) {
        setChoices(result.choices);
        setLoading(false);
        return;
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  }

  async function handleChoice(token: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithClientEmail(email, token);
      if ("choices" in result) {
        setChoices(result.choices);
        setLoading(false);
        return;
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  }

  if (restoring) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--background)] px-6">
        <AppLogo size="md" />
        <p className="text-sm text-black/50">Entrando…</p>
      </div>
    );
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

      {!choices ? (
        <form
          onSubmit={handleEmailSubmit}
          className="flex w-full max-w-sm flex-col gap-3"
        >
          <label className="text-center text-sm text-black/55">
            Ingresa el correo con el que recibiste tu invitación
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input"
            placeholder="correo@ejemplo.com"
            autoComplete="email"
            inputMode="email"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="btn-primary w-full py-3 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      ) : (
        <div className="w-full max-w-sm space-y-3">
          <p className="text-center text-sm text-black/55">
            Hay varias cuentas con <span className="font-medium">{email}</span>.
            Elige la tuya:
          </p>
          {choices.map((choice) => (
            <button
              key={choice.token}
              type="button"
              disabled={loading}
              onClick={() => void handleChoice(choice.token)}
              className="btn-secondary w-full px-4 py-3 text-left text-sm disabled:opacity-50"
            >
              <span className="block font-medium">{choice.clientName}</span>
              <span className="mt-0.5 block text-black/45">
                {choice.vehicleCount}{" "}
                {choice.vehicleCount === 1 ? "vehículo" : "vehículos"}
              </span>
            </button>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={() => setChoices(null)}
            className="w-full py-2 text-xs text-black/45 underline underline-offset-2"
          >
            Usar otro correo
          </button>
        </div>
      )}

      {process.env.NODE_ENV === "development" && !choices && (
        <div className="flex w-full max-w-sm flex-col gap-2">
          <button
            type="button"
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await signInDemo();
                refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Error al iniciar sesión",
                );
                setLoading(false);
              }
            }}
            disabled={loading}
            className="w-full py-2 text-xs text-black/45 underline underline-offset-2 disabled:opacity-50"
          >
            Demo (dev)
          </button>
          <button
            type="button"
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await signInDev();
                refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Error al iniciar sesión",
                );
                setLoading(false);
              }
            }}
            disabled={loading}
            className="w-full py-2 text-xs text-black/45 underline underline-offset-2 disabled:opacity-50"
          >
            Modo desarrollo
          </button>
        </div>
      )}

      {error && (
        <p className="max-w-sm text-center text-sm text-black/70">{error}</p>
      )}
    </div>
  );
}

export function LoginView() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState<"demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_DEMO_HOSTING) return;
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

  if (IS_DEMO_HOSTING) {
    return <DemoHostingLogin />;
  }

  if (loading === "demo") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-black/50">
        Entrando a demo…
      </div>
    );
  }

  return <ClientEmailLogin />;
}
