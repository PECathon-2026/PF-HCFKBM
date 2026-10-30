"use client";

import { useEffect } from "react";

export function OfflineBootstrap() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // IndexedDB reading still works if service workers are unavailable.
      });
    }
  }, []);

  return null;
}
