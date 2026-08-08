"use client";

import { useEffect, useMemo, useState } from "react";

type UnknownRecord = Record<string, unknown>;

type GalleryImage = {
  url: string;
  thumbnailUrl: string;
  isPrimary: boolean;
  order: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeUrl(value: string) {
  const candidate = value.trim();
  return candidate.startsWith("http://") || candidate.startsWith("https://") || candidate.startsWith("/");
}

function getApiOrigin() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  if (typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:4000`;
  return "";
}

function normalizeImageUrl(rawUrl: string) {
  const origin = getApiOrigin();
  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      const parsed = new URL(rawUrl);
      if (
        typeof window !== "undefined" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ) {
        if (origin) return `${origin}${parsed.pathname}${parsed.search}`;
        parsed.hostname = window.location.hostname;
      }
      return parsed.toString();
    }
    if (rawUrl.startsWith("/") && origin) return `${origin}${rawUrl}`;
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function thumbnailUrlFor(displayUrl: string) {
  if (!displayUrl.includes("/api/media/public/")) return displayUrl;
  try {
    const parsed = new URL(displayUrl);
    parsed.searchParams.set("variant", "thumbnail");
    return parsed.toString();
  } catch {
    const separator = displayUrl.includes("?") ? "&" : "?";
    return `${displayUrl}${separator}variant=thumbnail`;
  }
}

function collectVehicleImages(vehicle: unknown): GalleryImage[] {
  if (!isRecord(vehicle)) return [];

  const collected: GalleryImage[] = [];
  const add = (value: unknown, isPrimary = false, order = collected.length) => {
    if (typeof value !== "string" || !looksLikeUrl(value)) return;
    const url = normalizeImageUrl(value.trim());
    collected.push({ url, thumbnailUrl: thumbnailUrlFor(url), isPrimary, order });
  };

  add(vehicle.primaryImageUrl, true, -1);
  add(vehicle.publicImageUrl, true, -1);

  const containers = [vehicle.images, vehicle.vehicleImages, vehicle.mediaImages, vehicle.photos, vehicle.gallery];
  for (const container of containers) {
    if (!Array.isArray(container)) continue;
    container.forEach((entry, index) => {
      if (typeof entry === "string") {
        add(entry, false, index);
        return;
      }
      if (!isRecord(entry)) return;
      const status = typeof entry.status === "string" ? entry.status.toUpperCase() : "";
      const visibility = typeof entry.visibility === "string" ? entry.visibility.toUpperCase() : "";
      const approved = entry.isApproved !== false && !["PENDING", "REJECTED", "DELETED"].includes(status);
      const publicEnough = visibility !== "PRIVATE";
      if (!approved || !publicEnough) return;
      const url = entry.url ?? entry.publicUrl ?? entry.imageUrl ?? entry.src;
      const primary = entry.isPrimary === true || entry.primary === true;
      const sortOrder = typeof entry.sortOrder === "number" ? entry.sortOrder : index;
      add(url, primary, sortOrder);
    });
  }

  const byUrl = new Map<string, GalleryImage>();
  for (const image of collected) {
    const current = byUrl.get(image.url);
    if (!current) {
      byUrl.set(image.url, image);
      continue;
    }
    byUrl.set(image.url, {
      url: image.url,
      thumbnailUrl: image.thumbnailUrl,
      isPrimary: current.isPrimary || image.isPrimary,
      order: Math.min(current.order, image.order),
    });
  }

  return Array.from(byUrl.values()).sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.order - b.order;
  });
}

export function VehicleGallery({ vehicle }: { vehicle: unknown }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const allImages = useMemo(() => collectVehicleImages(vehicle), [vehicle]);
  const visibleImages = allImages.filter((image) => !failedUrls.has(image.url));

  useEffect(() => {
    if (selectedIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIndex(null);
      if (event.key === "ArrowRight" && visibleImages.length > 1) {
        setSelectedIndex((current) => current === null ? 0 : (current - 1 + visibleImages.length) % visibleImages.length);
      }
      if (event.key === "ArrowLeft" && visibleImages.length > 1) {
        setSelectedIndex((current) => current === null ? 0 : (current + 1) % visibleImages.length);
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [selectedIndex, visibleImages.length]);

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= visibleImages.length) {
      setSelectedIndex(visibleImages.length ? 0 : null);
    }
  }, [selectedIndex, visibleImages.length]);

  useEffect(() => {
    if (selectedIndex === null || visibleImages.length < 2) return;

    const neighborIndexes = new Set([
      (selectedIndex - 1 + visibleImages.length) % visibleImages.length,
      (selectedIndex + 1) % visibleImages.length,
    ]);
    for (const index of neighborIndexes) {
      const image = new Image();
      image.decoding = "async";
      image.src = visibleImages[index].url;
    }
  }, [selectedIndex, visibleImages]);

  function fail(url: string) {
    setFailedUrls((current) => new Set([...current, url]));
  }

  function fallbackFromThumbnail(event: React.SyntheticEvent<HTMLImageElement>, image: GalleryImage) {
    const element = event.currentTarget;
    if (element.src !== image.url) {
      element.src = image.url;
      return;
    }
    fail(image.url);
  }

  if (!allImages.length) {
    return (
      <section className="panel rider-detail-panel" aria-label="صور المركبة">
        <div className="section-heading rider-section-heading">
          <div><span className="eyebrow">المركبة المعيّنة</span><h2>صور المركبة</h2></div>
        </div>
        <div className="empty-state">لم تتم إضافة صور عامة ومعتمدة للمركبة بعد.</div>
      </section>
    );
  }

  return (
    <>
      <section className="panel rider-detail-panel" aria-label="صور المركبة">
        <div className="section-heading rider-section-heading">
          <div>
            <span className="eyebrow">المركبة المعيّنة</span>
            <h2>صور المركبة</h2>
            <p className="subtitle">الصورة الرئيسية وجميع الصور الفرعية المعتمدة.</p>
          </div>
          <span className="status">{visibleImages.length} صور</span>
        </div>

        {visibleImages.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
            {visibleImages.map((image, index) => (
              <button
                key={image.url}
                type="button"
                aria-label={`فتح صورة المركبة رقم ${index + 1}`}
                onClick={() => setSelectedIndex(index)}
                style={{ position: "relative", padding: 0, border: 0, borderRadius: 16, overflow: "hidden", cursor: "pointer", background: "rgba(127,127,127,.1)" }}
              >
                <img
                  src={image.thumbnailUrl}
                  alt={`صورة المركبة رقم ${index + 1}`}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "low"}
                  decoding="async"
                  draggable={false}
                  onError={(event) => fallbackFromThumbnail(event, image)}
                  style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
                />
                {image.isPrimary ? (
                  <span style={{ position: "absolute", top: 10, right: 10, padding: "5px 9px", borderRadius: 999, background: "rgba(0,0,0,.72)", color: "white", fontSize: ".75rem", fontWeight: 700 }}>
                    الصورة الرئيسية
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : <div className="empty-state">تعذر تحميل صور المركبة من التخزين. أعد رفع الصور القديمة بعد تفعيل التخزين المركزي.</div>}
      </section>

      {selectedIndex !== null && visibleImages[selectedIndex] ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="معاينة صورة المركبة"
          onClick={() => setSelectedIndex(null)}
          style={{ position: "fixed", inset: 0, zIndex: 2000, display: "grid", placeItems: "center", padding: 18, background: "rgba(0,0,0,.9)" }}
        >
          <button type="button" aria-label="إغلاق" onClick={() => setSelectedIndex(null)} style={{ position: "fixed", top: 18, left: 18, width: 44, height: 44, border: 0, borderRadius: 999, fontSize: 25, cursor: "pointer" }}>×</button>
          <img
            src={visibleImages[selectedIndex].url}
            alt={`صورة المركبة رقم ${selectedIndex + 1}`}
            fetchPriority="high"
            decoding="async"
            draggable={false}
            onClick={(event) => event.stopPropagation()}
            onError={() => fail(visibleImages[selectedIndex].url)}
            style={{ maxWidth: "96vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 16 }}
          />
          {visibleImages.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="الصورة السابقة"
                onClick={(event) => { event.stopPropagation(); setSelectedIndex((selectedIndex - 1 + visibleImages.length) % visibleImages.length); }}
                style={{ position: "fixed", top: "50%", right: 18, width: 48, height: 48, border: 0, borderRadius: 999, fontSize: 28, cursor: "pointer" }}
              >›</button>
              <button
                type="button"
                aria-label="الصورة التالية"
                onClick={(event) => { event.stopPropagation(); setSelectedIndex((selectedIndex + 1) % visibleImages.length); }}
                style={{ position: "fixed", top: "50%", left: 18, width: 48, height: 48, border: 0, borderRadius: 999, fontSize: 28, cursor: "pointer" }}
              >‹</button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
