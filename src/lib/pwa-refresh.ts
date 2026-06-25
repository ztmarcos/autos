export async function refreshPwaApplication(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    await fetch(window.location.href, { cache: "no-store" });
  } catch {
    // Best effort; reload below still applies.
  }

  window.location.reload();
}
