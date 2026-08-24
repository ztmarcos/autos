"use client";

import { useEffect, useState } from "react";

interface OnboardingStepBannerProps {
  step: 1 | 2;
  title: string;
  body: string;
  onDismiss: () => void;
  className?: string;
}

const BADGE_CLASS = {
  1: "step-badge-1",
  2: "step-badge-2",
} as const;

export function OnboardingStepBanner({
  step,
  title,
  body,
  onDismiss,
  className = "",
}: OnboardingStepBannerProps) {
  return (
    <div
      className={`flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-sm shadow-black/5 ${className}`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${BADGE_CLASS[step]}`}
      >
        {step}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-black/45">Paso {step}</p>
        <p className="text-[15px] font-medium leading-snug">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-black/50">{body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 self-start text-[12px] text-black/40 underline underline-offset-2"
      >
        Listo
      </button>
    </div>
  );
}

export const ONBOARDING_STEP1_KEY = "carcontrol.onboarding.step1";
export const ONBOARDING_STEP2_KEY = "carcontrol.onboarding.step2";

export function useOnboardingStep(storageKey: string) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(storageKey) === "1") {
      setDismissed(true);
    }
  }, [storageKey]);

  function dismiss() {
    window.localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  return { dismissed, dismiss };
}
