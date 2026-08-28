"use client";

import { useEffect } from "react";
import { checkForPwaUpdate } from "@/lib/pwa-refresh";

export function PwaAutoRefresh() {
  useEffect(() => {
    void checkForPwaUpdate();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void checkForPwaUpdate();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
