const CACHE_NAME = "route-sham-shell-v3";
const OFFLINE_URL = "/offline.html";
const NOTIFICATIONS_URL = "/notifications";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/icons/route-sham.svg",
  "/icons/route-sham-maskable.svg",
  "/icons/route-sham-192.png",
  "/icons/route-sham-512.png",
  "/icons/route-sham-maskable-192.png",
  "/icons/route-sham-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const visibleWindow = windows.find((client) => client.visibilityState === "visible");

    if (visibleWindow) {
      visibleWindow.postMessage({ type: "route-sham.push-received" });
      return;
    }

    let payload = null;
    try {
      payload = event.data ? event.data.json() : null;
    } catch {
      payload = null;
    }

    await self.registration.showNotification(payload?.title || "طريق الشام", {
      body: payload?.body || "لديك تحديث جديد على حجزك أو رحلتك. افتح طريق الشام لمراجعة التفاصيل.",
      icon: "/icons/route-sham-192.png",
      badge: "/icons/route-sham-192.png",
      tag: payload?.tag || "route-sham-trip-update",
      renotify: true,
      data: {
        url: payload?.url || NOTIFICATIONS_URL,
      },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || NOTIFICATIONS_URL;

  event.waitUntil((async () => {
    const target = new URL(requestedUrl, self.location.origin);
    if (target.origin !== self.location.origin) {
      target.pathname = NOTIFICATIONS_URL;
      target.search = "";
      target.hash = "";
    }

    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);

    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(target.href);
      return;
    }

    await self.clients.openWindow(target.href);
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match(OFFLINE_URL);
      }),
    );
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});
