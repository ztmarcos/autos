"use client";

import { useEffect, useState } from "react";
import { isNativePlatform } from "@/lib/local-notifications";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIos) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone,
    )
  );
}

const IOS_STEPS = [
  "Ábrela en Safari (no en Chrome ni en otro navegador).",
  "Toca Compartir — el cuadrado con la flecha hacia arriba, abajo en la barra.",
  "Elige “Agregar a pantalla de inicio” y confirma.",
] as const;

const ANDROID_STEPS = [
  "Ábrela en Chrome.",
  "Toca el menú (tres puntos) arriba a la derecha.",
  "Elige “Instalar aplicación” o “Agregar a la pantalla de inicio”.",
] as const;

function ShareIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function Steps({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <div>
      <p className="text-[13px] font-medium">{title}</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-relaxed text-black/55">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function InstallSteps({ platform }: { platform: Platform }) {
  const iosFirst = platform !== "android";
  const blocks = iosFirst
    ? [
        { title: "iPhone y iPad", steps: IOS_STEPS },
        { title: "Android", steps: ANDROID_STEPS },
      ]
    : [
        { title: "Android", steps: ANDROID_STEPS },
        { title: "iPhone y iPad", steps: IOS_STEPS },
      ];

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <Steps key={block.title} title={block.title} steps={block.steps} />
      ))}
      <p className="text-[12px] leading-relaxed text-black/40">
        No hace falta App Store ni Play Store. El ícono queda en tu pantalla de
        inicio, como cualquier otra app. Si te pide entrar de nuevo, usa el mismo
        correo de tu invitación.
      </p>
    </div>
  );
}

interface InstallAppHintProps {
  variant?: "compact" | "full";
  className?: string;
}

export function InstallAppHint({
  variant = "compact",
  className = "",
}: InstallAppHintProps) {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    if (isNativePlatform() || isStandaloneDisplay()) return;
    setPlatform(detectPlatform());
    setVisible(true);
  }, []);

  if (!visible) return null;

  if (variant === "full") {
    return (
      <section className={className}>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-black/40">
          Instalar en el teléfono
        </p>
        <p className="mb-3 text-[13px] leading-relaxed text-black/50">
          Sin App Store. En iOS y Android se instala desde el navegador.
        </p>
        <InstallSteps platform={platform} />
      </section>
    );
  }

  return (
    <details
      className={`group rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-left [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <PhoneIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-snug">
            Instalar en el teléfono
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-black/45">
            <ShareIcon />
            iOS y Android, sin App Store
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-black/35 group-open:hidden">
          Ver
        </span>
        <span className="hidden shrink-0 text-[11px] text-black/35 group-open:inline">
          Cerrar
        </span>
      </summary>
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <InstallSteps platform={platform} />
      </div>
    </details>
  );
}
