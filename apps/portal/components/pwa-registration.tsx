"use client";

import { useEffect } from "react";

const UPDATE_THROTTLE_MS = 10 * 60 * 1000;

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | null = null;
    let lastUpdateAt = 0;
    let disposed = false;

    const updateWorker = async () => {
      if (!registration || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastUpdateAt < UPDATE_THROTTLE_MS) return;
      lastUpdateAt = now;
      await registration.update().catch((error) => {
        console.warn("Service worker update check failed", error);
      });
    };

    const register = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (disposed) return;
        registration = nextRegistration;
        lastUpdateAt = Date.now();
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void updateWorker();
    };
    const onOnline = () => void updateWorker();

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
