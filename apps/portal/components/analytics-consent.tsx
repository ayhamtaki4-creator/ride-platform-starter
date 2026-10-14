"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ANALYTICS_SETTINGS_EVENT,
  analyticsConfigured,
  initializeAnalytics,
  isPublicAnalyticsPath,
  readAnalyticsConsent,
  setAnalyticsRouteAllowed,
  trackPublicPageView,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics";
import styles from "./analytics-consent.module.css";

export function AnalyticsConsentManager() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<AnalyticsConsent | null>(null);
  const [editing, setEditing] = useState(false);
  const lastPageView = useRef<string | null>(null);

  useEffect(() => {
    setChoice(readAnalyticsConsent());
    setReady(true);
    const openSettings = () => setEditing(true);
    window.addEventListener(ANALYTICS_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(ANALYTICS_SETTINGS_EVENT, openSettings);
  }, []);

  useEffect(() => {
    if (!ready || !analyticsConfigured()) return;
    const isPublic = isPublicAnalyticsPath(pathname);
    setAnalyticsRouteAllowed(isPublic && choice === "accepted");
    if (!isPublic || choice !== "accepted") {
      lastPageView.current = null;
      return;
    }
    if (!initializeAnalytics()) return;
    // Never send the query string: success links may contain booking references.
    if (lastPageView.current !== pathname) {
      trackPublicPageView();
      lastPageView.current = pathname;
    }
  }, [choice, pathname, ready]);

  if (!analyticsConfigured() || !ready || !isPublicAnalyticsPath(pathname) || (choice !== null && !editing)) {
    return null;
  }

  function choose(next: AnalyticsConsent) {
    writeAnalyticsConsent(next);
    setChoice(readAnalyticsConsent());
    setEditing(false);
    if (next === "rejected") lastPageView.current = null;
  }

  return (
    <section className={styles.banner} role="region" aria-label="اختيار التحليلات">
      <div className={styles.copy}>
        <strong>خصوصيتك مهمة</strong>
        <p>
          هل تسمح باستخدام Google Analytics لقياس زيارات الصفحات العامة وتحسين خطوات الحجز؟
          لن نرسل الاسم أو رقم الهاتف أو مرجع الحجز أو تفاصيل الرحلة إلى التحليلات.
          يمكنك رفض التحليلات دون التأثير على الحجز وتغيير اختيارك لاحقاً.
          {" "}<Link href="/privacy">سياسة الخصوصية</Link>
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.decline} onClick={() => choose("rejected")}>رفض التحليلات</button>
        <button type="button" className={styles.accept} onClick={() => choose("accepted")}>السماح بالتحليلات</button>
      </div>
    </section>
  );
}

export function AnalyticsPreferencesButton() {
  if (!analyticsConfigured()) return null;
  return (
    <button
      className={styles.preference}
      type="button"
      onClick={() => window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))}
    >
      إعدادات خصوصية التحليلات
    </button>
  );
}
