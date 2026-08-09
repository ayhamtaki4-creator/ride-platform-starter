"use client";

import { useEffect, useRef, useState } from "react";

type ConnectionState = "online" | "offline" | "restored";

export function ConnectionStatusBanner() {
  const [state, setState] = useState<ConnectionState>("online");
  const restoredTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearRestoredTimer = () => {
      if (restoredTimer.current !== null) {
        window.clearTimeout(restoredTimer.current);
        restoredTimer.current = null;
      }
    };

    const markOffline = () => {
      clearRestoredTimer();
      setState("offline");
    };

    const markOnline = () => {
      clearRestoredTimer();
      setState((current) => {
        if (current === "offline") {
          restoredTimer.current = window.setTimeout(() => {
            restoredTimer.current = null;
            setState("online");
          }, 3_000);
          return "restored";
        }
        return "online";
      });
    };

    if (!navigator.onLine) markOffline();

    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    return () => {
      clearRestoredTimer();
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", markOnline);
    };
  }, []);

  if (state === "online") return null;

  const offline = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      data-connection-state={state}
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5000,
        width: "min(calc(100% - 24px), 520px)",
        minHeight: 44,
        padding: "10px 14px",
        borderRadius: 14,
        background: offline ? "#2b3130" : "#e9f7ef",
        color: offline ? "#fff" : "#17613f",
        boxShadow: "0 8px 28px rgba(0, 0, 0, 0.16)",
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1.6,
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      {offline
        ? "لا يوجد اتصال بالإنترنت. سنحافظ على بياناتك ويمكنك المحاولة عند عودة الشبكة."
        : "عاد الاتصال بالإنترنت."}
    </div>
  );
}
