"use client";

import { useEffect, useMemo, useState } from "react";

type UnknownRecord = Record<string, unknown>;

type GalleryImage = {
  url: string;
  isPrimary: boolean;
  order: number;
};

const URL_KEYS = new Set([
  "url",
  "src",
  "imageUrl",
  "imageURL",
  "primaryImageUrl",
  "primaryImageURL",
  "publicUrl",
  "publicURL",
  "fileUrl",
  "fileURL",
  "downloadUrl",
  "downloadURL",
  "thumbnailUrl",
  "thumbnailURL",
]);

const CONTAINER_KEYS = new Set([
  "images",
  "vehicleImages",
  "mediaImages",
  "photos",
  "gallery",
  "media",
  "assets",
  "mediaAssets",
  "mediaAsset",
  "asset",
  "file",
  "primaryImage",
  "coverImage",
  "publicProfile",
]);

const BLOCKED_STATUSES = new Set([
  "PENDING",
  "REJECTED",
  "PRIVATE",
  "DRAFT",
  "DELETED",
  "EXPIRED",
  "ARCHIVED",
]);

const DOCUMENT_TYPES = new Set([
  "DOCUMENT",
  "DRIVER_DOCUMENT",
  "VEHICLE_DOCUMENT",
  "LICENSE",
  "REGISTRATION",
  "INSURANCE",
  "INSPECTION",
  "PERMIT",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function booleanValue(record: UnknownRecord, keys: string[]): boolean {
  return keys.some((key) => record[key] === true);
}

function numberValue(record: UnknownRecord, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function isPublicApprovedImage(record: UnknownRecord): boolean {
  const status = textValue(record, [
    "status",
    "approvalStatus",
    "reviewStatus",
  ])?.toUpperCase();

  const visibility = textValue(record, [
    "visibility",
    "access",
    "accessLevel",
  ])?.toUpperCase();

  const type = textValue(record, [
    "type",
    "kind",
    "category",
    "purpose",
    "documentType",
  ])?.toUpperCase();

  const mimeType = textValue(record, [
    "mimeType",
    "contentType",
  ])?.toLowerCase();

  if (status && BLOCKED_STATUSES.has(status)) {
    return false;
  }

  if (visibility && BLOCKED_STATUSES.has(visibility)) {
    return false;
  }

  if (type && DOCUMENT_TYPES.has(type)) {
    return false;
  }

  if (mimeType && !mimeType.startsWith("image/")) {
    return false;
  }

  return true;
}

function looksLikeUrl(value: string): boolean {
  const candidate = value.trim();

  return (
    candidate.startsWith("http://") ||
    candidate.startsWith("https://") ||
    candidate.startsWith("/")
  );
}

function collectVehicleImages(vehicle: unknown): GalleryImage[] {
  const images: GalleryImage[] = [];
  const visited = new Set<object>();
  let discoveryOrder = 0;

  const addImage = (
    rawUrl: string,
    record: UnknownRecord | null,
    key: string,
  ): void => {
    if (!looksLikeUrl(rawUrl)) {
      return;
    }

    const isPrimary =
      key.toLowerCase().includes("primary") ||
      (record
        ? booleanValue(record, ["isPrimary", "primary", "isCover", "cover"])
        : false);

    const explicitOrder = record
      ? numberValue(record, ["sortOrder", "displayOrder", "position", "order"])
      : Number.MAX_SAFE_INTEGER;

    images.push({
      url: rawUrl.trim(),
      isPrimary,
      order:
        explicitOrder === Number.MAX_SAFE_INTEGER
          ? discoveryOrder
          : explicitOrder,
    });

    discoveryOrder += 1;
  };

  const visit = (value: unknown, depth: number): void => {
    if (depth > 7 || value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (!isRecord(value) || visited.has(value)) {
      return;
    }

    visited.add(value);

    if (!isPublicApprovedImage(value)) {
      return;
    }

    for (const [key, item] of Object.entries(value)) {
      if (URL_KEYS.has(key) && typeof item === "string") {
        addImage(item, value, key);
        continue;
      }

      if (CONTAINER_KEYS.has(key)) {
        visit(item, depth + 1);
      }
    }
  };

  visit(vehicle, 0);

  const deduplicated = new Map<string, GalleryImage>();

  for (const image of images) {
    const existing = deduplicated.get(image.url);

    if (!existing) {
      deduplicated.set(image.url, image);
      continue;
    }

    deduplicated.set(image.url, {
      url: image.url,
      isPrimary: existing.isPrimary || image.isPrimary,
      order: Math.min(existing.order, image.order),
    });
  }

  return Array.from(deduplicated.values()).sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) {
      return left.isPrimary ? -1 : 1;
    }

    return left.order - right.order;
  });
}

function getApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configured) {
    return configured.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "";
}

function normalizeImageUrl(rawUrl: string): string {
  const origin = getApiOrigin();

  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      const parsed = new URL(rawUrl);

      if (
        typeof window !== "undefined" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ) {
        parsed.hostname = window.location.hostname;
      }

      return parsed.toString();
    }

    if (rawUrl.startsWith("/") && origin) {
      return `${origin}${rawUrl}`;
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function VehicleGallery({ vehicle }: { vehicle: unknown }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const allImages = useMemo(
    () =>
      collectVehicleImages(vehicle).map((image) => ({
        ...image,
        url: normalizeImageUrl(image.url),
      })),
    [vehicle],
  );

  const visibleImages = allImages.filter(
    (image) => !failedUrls.has(image.url),
  );

  useEffect(() => {
    if (selectedIndex === null) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedIndex(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedIndex]);

  useEffect(() => {
    if (
      selectedIndex !== null &&
      selectedIndex >= visibleImages.length
    ) {
      setSelectedIndex(visibleImages.length ? 0 : null);
    }
  }, [selectedIndex, visibleImages.length]);

  const failImage = (url: string) => {
    setFailedUrls((current) => {
      const next = new Set(current);
      next.add(url);
      return next;
    });
  };

  if (allImages.length === 0) {
    return (
      <section
        aria-label="صور المركبة"
        style={{
          marginTop: 20,
          padding: 20,
          border: "1px dashed rgba(127, 127, 127, 0.45)",
          borderRadius: 18,
          textAlign: "center",
        }}
      >
        <strong style={{ display: "block", marginBottom: 6 }}>
          صور المركبة
        </strong>
        <span style={{ opacity: 0.72 }}>
          لم تتم إضافة صور عامة ومعتمدة للمركبة بعد.
        </span>
      </section>
    );
  }

  if (visibleImages.length === 0) {
    return (
      <section
        aria-label="صور المركبة"
        style={{
          marginTop: 20,
          padding: 20,
          border: "1px dashed rgba(127, 127, 127, 0.45)",
          borderRadius: 18,
          textAlign: "center",
        }}
      >
        <strong style={{ display: "block", marginBottom: 6 }}>
          صور المركبة
        </strong>
        <span style={{ opacity: 0.72 }}>
          تعذر تحميل الصور. تحقق من PUBLIC_API_URL وروابط ملفات الصور.
        </span>
      </section>
    );
  }

  return (
    <>
      <section
        aria-label="صور المركبة"
        style={{
          marginTop: 20,
          padding: 18,
          border: "1px solid rgba(127, 127, 127, 0.22)",
          borderRadius: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              صور المركبة
            </h2>
            <p
              style={{
                margin: "5px 0 0",
                fontSize: "0.9rem",
                opacity: 0.7,
              }}
            >
              جميع الصور المعتمدة الموجودة في معرض المركبة
            </p>
          </div>

          <span
            style={{
              minWidth: 34,
              padding: "6px 10px",
              borderRadius: 999,
              textAlign: "center",
              background: "rgba(127, 127, 127, 0.12)",
              fontWeight: 700,
            }}
          >
            {visibleImages.length}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
            gap: 12,
          }}
        >
          {visibleImages.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`فتح صورة المركبة رقم ${index + 1}`}
              style={{
                position: "relative",
                display: "block",
                width: "100%",
                minHeight: 190,
                padding: 0,
                border: 0,
                borderRadius: 16,
                overflow: "hidden",
                cursor: "pointer",
                background: "rgba(127, 127, 127, 0.1)",
              }}
            >
              <img
                src={image.url}
                alt={`صورة المركبة رقم ${index + 1}`}
                loading={index === 0 ? "eager" : "lazy"}
                onError={() => failImage(image.url)}
                style={{
                  display: "block",
                  width: "100%",
                  height: 220,
                  objectFit: "cover",
                }}
              />

              {image.isPrimary ? (
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    padding: "5px 9px",
                    borderRadius: 999,
                    background: "rgba(0, 0, 0, 0.72)",
                    color: "#fff",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  الصورة الرئيسية
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {selectedIndex !== null && visibleImages[selectedIndex] ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="معاينة صورة المركبة"
          onClick={() => setSelectedIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: "rgba(0, 0, 0, 0.88)",
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedIndex(null)}
            aria-label="إغلاق الصورة"
            style={{
              position: "fixed",
              top: 18,
              left: 18,
              width: 42,
              height: 42,
              border: 0,
              borderRadius: 999,
              cursor: "pointer",
              background: "#fff",
              color: "#111",
              fontSize: 24,
              lineHeight: 1,
            }}
          >
            ×
          </button>

          <img
            src={visibleImages[selectedIndex].url}
            alt={`صورة المركبة رقم ${selectedIndex + 1}`}
            onClick={(event) => event.stopPropagation()}
            onError={() => failImage(visibleImages[selectedIndex].url)}
            style={{
              display: "block",
              maxWidth: "min(1100px, 96vw)",
              maxHeight: "88vh",
              objectFit: "contain",
              borderRadius: 16,
            }}
          />

          {visibleImages.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(
                    (selectedIndex - 1 + visibleImages.length) %
                      visibleImages.length,
                  );
                }}
                aria-label="الصورة السابقة"
                style={{
                  position: "fixed",
                  top: "50%",
                  right: 18,
                  width: 46,
                  height: 46,
                  border: 0,
                  borderRadius: 999,
                  cursor: "pointer",
                  background: "#fff",
                  color: "#111",
                  fontSize: 26,
                }}
              >
                ‹
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(
                    (selectedIndex + 1) % visibleImages.length,
                  );
                }}
                aria-label="الصورة التالية"
                style={{
                  position: "fixed",
                  top: "50%",
                  left: 18,
                  width: 46,
                  height: 46,
                  border: 0,
                  borderRadius: 999,
                  cursor: "pointer",
                  background: "#fff",
                  color: "#111",
                  fontSize: 26,
                }}
              >
                ›
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
