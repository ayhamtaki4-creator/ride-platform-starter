"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { HomeShowcaseItem } from "@/lib/admin-operations";
import { normalizePublicMediaUrl } from "@/lib/public-media-url";
import { Icon } from "./ui/icon";
import styles from "./home-vehicle-showcase.module.css";

export function HomeVehicleShowcase() {
  const [items, setItems] = useState<HomeShowcaseItem[]>([]);

  useEffect(() => {
    let active = true;
    void apiFetch<HomeShowcaseItem[]>("/home/showcase", {
      skipAuth: true,
      credentials: "omit",
    })
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!items.length) return null;

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
      <div className={styles.grid}>
        {items.map((item) => {
          const imageUrl = normalizePublicMediaUrl(item.imageUrl) ?? item.imageUrl;
          return (
            <article className={styles.card} key={item.id}>
              <img className={styles.image} src={imageUrl} alt={item.titleAr} loading="lazy" decoding="async" />
              <span className={styles.overlay} />
              <div className={styles.copy}>
                <strong>{item.titleAr}</strong>
                <span>{item.subtitleAr}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
