"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type WebPushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

type PushState =
  | "loading"
  | "hidden"
  | "unsupported"
  | "install-ios"
  | "ready"
  | "subscribed"
  | "denied"
  | "working";

function base64UrlToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: ArrayBuffer | null) {
  if (!value) return "";
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isIosDevice() {
  const classic = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const ipadDesktopMode =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return classic || ipadDesktopMode;
}

function isStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    iosNavigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function canUseWebPush() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function syncSubscription(subscription: PushSubscription) {
  const p256dh = bytesToBase64Url(subscription.getKey("p256dh"));
  const auth = bytesToBase64Url(subscription.getKey("auth"));
  if (!p256dh || !auth) return;

  await apiFetch("/web-push/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      expirationTime: subscription.expirationTime,
    }),
  });
}

export function WebPushControl() {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState("");

  const refresh = useCallback(async () => {
    try {
      const config = await apiFetch<WebPushConfig>("/web-push/config");
      if (!config.enabled || !config.publicKey) {
        setState("hidden");
        return;
      }

      setPublicKey(config.publicKey);

      if (!canUseWebPush()) {
        setState("unsupported");
        return;
      }

      if (isIosDevice() && !isStandalone()) {
        setState("install-ios");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        await syncSubscription(existing).catch(() => undefined);
        setState("subscribed");
        return;
      }

      setState(Notification.permission === "denied" ? "denied" : "ready");
    } catch {
      setState("hidden");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle() {
    if (state === "subscribed") {
      setState("working");
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await apiFetch("/web-push/subscriptions", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          }).catch(() => undefined);
          await subscription.unsubscribe();
        }
        setState("ready");
      } catch {
        setState("subscribed");
      }
      return;
    }

    if (state !== "ready" || !publicKey) return;

    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        }));

      await syncSubscription(subscription);
      setState("subscribed");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "ready");
    }
  }

  if (state === "hidden" || state === "loading") return null;

  if (state === "install-ios") {
    return (
      <div
        role="note"
        style={{
          margin: "10px 12px 0",
          padding: "10px 12px",
          borderRadius: 12,
          background: "#f4f7f5",
          color: "var(--muted)",
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        على iPhone: أضف طريق الشام إلى الشاشة الرئيسية، ثم افتحها من الأيقونة لتفعيل إشعارات الرحلات.
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div
        role="note"
        style={{
          margin: "10px 12px 0",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        هذا المتصفح لا يدعم إشعارات الرحلات في الخلفية.
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div
        role="note"
        style={{
          margin: "10px 12px 0",
          color: "var(--muted)",
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        الإشعارات محظورة من إعدادات المتصفح. يمكنك السماح بها من إعدادات الموقع ثم إعادة فتح الصفحة.
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={state === "working"}
      style={{
        width: "calc(100% - 24px)",
        minHeight: 44,
        margin: "10px 12px 0",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 12,
        color: state === "subscribed" ? "var(--success)" : "var(--primary)",
        background: "#fff",
        fontWeight: 800,
      }}
    >
      {state === "working"
        ? "جارٍ تحديث الإشعارات..."
        : state === "subscribed"
          ? "إشعارات الهاتف مفعّلة — إيقاف"
          : "تفعيل إشعارات الرحلات على الهاتف"}
    </button>
  );
}
