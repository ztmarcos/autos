const CHECKED_AT_KEY = "autocontrol_sw_checked_at";
const CHECK_EVERY_MS = 30 * 1000;

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

async function waitForControllerChange(timeoutMs = 4000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  if (!navigator.serviceWorker.controller) return true;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.clearTimeout(timer);
        resolve(true);
      },
      { once: true },
    );
  });
}

async function applyWaitingWorker(
  registration: ServiceWorkerRegistration,
): Promise<boolean> {
  const waiting = registration.waiting;
  if (!waiting) return false;
  waiting.postMessage({ type: "SKIP_WAITING" });
  return waitForControllerChange();
}

export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  return navigator.serviceWorker.register("/sw.js", {
    updateViaCache: "none",
  });
}

export async function checkForPwaUpdate(): Promise<void> {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const last = Number(sessionStorage.getItem(CHECKED_AT_KEY) ?? "0");
  if (now - last < CHECK_EVERY_MS) return;
  sessionStorage.setItem(CHECKED_AT_KEY, String(now));

  if (!("serviceWorker" in navigator)) {
    if (isStandalonePwa() && !sessionStorage.getItem("autocontrol_pwa_booted")) {
      sessionStorage.setItem("autocontrol_pwa_booted", "1");
      window.location.reload();
    }
    return;
  }

  const registration =
    (await navigator.serviceWorker.getRegistration()) ??
    (await registerPwaServiceWorker());
  if (!registration) return;

  try {
    await registration.update();
  } catch {
    // Offline or blocked; keep current worker.
  }

  const updated = await applyWaitingWorker(registration);
  if (updated && isStandalonePwa()) {
    window.location.reload();
  }
}

export async function refreshPwaApplication(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (registration) => {
          await registration.update();
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          await registration.unregister();
        }),
      );
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    await fetch(`${window.location.origin}/?v=${Date.now()}`, {
      cache: "no-store",
    });
  } catch {
    // Best effort; reload below still applies.
  }

  window.location.reload();
}
