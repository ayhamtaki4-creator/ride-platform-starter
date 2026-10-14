"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { warmPublicApi } from "@/lib/public-api-warmup";
import type { HomeShowcaseItem } from "@/lib/admin-operations";
import { normalizePublicMediaUrl } from "@/lib/public-media-url";
import { Icon } from "./ui/icon";
import styles from "./home-vehicle-showcase.module.css";

type LoadStatus = "loading" | "ready" | "error";

export function HomeVehicleShowcase() {
  const [items, setItems] = useState<HomeShowcaseItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [brokenImages, setBrokenImages] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setStatus("loading");

    void (async () => {
      try {
        // A sleeping free-tier API can take a while to wake up.
        // Share the public health probe with the booking page instead of
        // making guests interpret a cold start as an empty car gallery.
        await warmPublicApi();
        if (!active) return;
        const rows = await apiFetch<HomeShowcaseItem[]>("/home/showcase", {
          skipAuth: true,
          credentials: "omit",
          timeoutMs: 30_000,
        });
        if (!active) return;
        setItems(rows);
        setBrokenImages([]);
        setStatus("ready");
      } catch {
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [retryKey]);

  // No photos configured by the administrator is not an error.
  if (status === "ready" && items.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="vehicle-showcase-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}><Icon name="sparkles" size={17} /> أسطولنا</span>
          <h2 id="vehicle-showcase-title">سيارات تليق بالرحلات الطويلة</h2>
          <p>صور مختارة من الإدارة لسيارات الخدمة. نهتم بالنظافة والراحة والتكييف وتجهيز المركبة قبل كل رحلة.</p>
        </div>
        <span className={styles.badge}>سيارات حديثة · مكيفة · مريحة</span>
      </div>

      {status === "loading" ? (
        <div className={styles.feedback} role="status" aria-live="polite">
          جارٍ تحميل صور السيارات. قد يتأخر ظهورها قليلًا عند بدء تشغيل الخادم.
        </div>
      ) : status === "error" ? (
        <div className={styles.feedback} role="alert">
          <p>تعذر تحميل صور السيارات حاليًا. لا تحتاج إلى تسجيل الدخول لعرضها.</p>
          <button className="button" type="button" onClick={() => setRetryKey((current) => current + 1)}>
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => {
            const imageUrl = normalizePublicMediaUrl(item.imageUrl) ?? item.imageUrl;
            const broken = brokenImages.includes(item.id);
            return (
              <article className={styles.card} key={item.id}>
                {broken ? (
                  <div className={styles.imageFallback} role="img" aria-label={item.titleAr}>
                    <Icon name="car" size={40} />
                    <span>صورة السيارة غير متاحة مؤقتًا</span>
                  </div>
                ) : (
                  <img
                    className={styles.image}
                    src={imageUrl}
                    alt={item.titleAr}
                    loading="lazy"
                    decoding="async"
                    onError={() => setBrokenImages((current) => (
                      current.includes(item.id) ? current : [...current, item.id]
                    ))}
                  />
                )}
                <span className={styles.overlay} />
                <div className={styles.copy}>
                  <strong>{item.titleAr}</strong>
                  <span>{item.subtitleAr}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
