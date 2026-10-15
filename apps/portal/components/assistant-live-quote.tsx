"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ServiceRoute, VehicleClassConfig } from "@/lib/admin-operations";
import { apiFetch } from "@/lib/api";
import { warmPublicApi } from "@/lib/public-api-warmup";
import type { BookingQuote, VehicleClass } from "@/lib/types";
import { Icon } from "@/components/ui/icon";
import styles from "./site-assistant.module.css";
import { recordAssistantEvent } from "@/lib/assistant-config";
import { assistantBookingHref } from "@/lib/assistant-booking-handoff";

const classes: VehicleClass[] = ["SMALL", "MEDIUM", "LARGE"];
const classNames: Record<VehicleClass, string> = {
  SMALL: "سيارة صغيرة",
  MEDIUM: "سيارة متوسطة",
  LARGE: "سيارة كبيرة",
};

const defaultCapacity: Record<VehicleClass, { passengerCapacity: number; luggageCapacity: number }> = {
  SMALL: { passengerCapacity: 3, luggageCapacity: 4 },
  MEDIUM: { passengerCapacity: 4, luggageCapacity: 5 },
  LARGE: { passengerCapacity: 8, luggageCapacity: 8 },
};

function capacityFor(route: ServiceRoute, vehicleClass: VehicleClass) {
  const found: VehicleClassConfig | undefined = route.vehicleClasses?.find((item) => item.vehicleClass === vehicleClass);
  return found ?? defaultCapacity[vehicleClass];
}

function validClasses(route: ServiceRoute): VehicleClass[] {
  return classes.filter((vehicleClass) =>
    route.pricingRules.some((rule) => rule.bookingType === "PRIVATE_CAR" && rule.vehicleClass === vehicleClass && rule.isActive !== false),
  );
}

function currencyPrice(quote: BookingQuote) {
  return `${new Intl.NumberFormat("ar-SY", { maximumFractionDigits: 2 }).format(quote.passengerPrice)} ${quote.currency}`;
}

export function AssistantLiveQuote({ onBack }: { onBack: () => void }) {
  const [routes, setRoutes] = useState<ServiceRoute[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [routeId, setRouteId] = useState("");
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>("SMALL");
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(0);
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoadState("loading");
      try {
        // Render may need to wake after an idle period. Keep the existing booking behavior.
        if (!(await warmPublicApi())) throw new Error("خادم الحجز لا يستجيب حالياً.");
        const active = (await apiFetch<ServiceRoute[]>("/routes", { skipAuth: true, timeoutMs: 25_000 }))
          .filter((route) => route.bookable && route.isActive && validClasses(route).length > 0);
        if (!mounted) return;
        setRoutes(active);
        setRouteId((previous) => active.some((route) => route.id === previous) ? previous : active[0]?.id ?? "");
        setLoadState("ready");
      } catch {
        if (mounted) setLoadState("error");
      }
    }
    void load();
    return () => { mounted = false; };
  }, [attempt]);

  const route = routes.find((item) => item.id === routeId);
  const availableClasses = useMemo(() => route ? validClasses(route) : [], [route]);
  const selectedClass = availableClasses.includes(vehicleClass) ? vehicleClass : availableClasses[0] ?? "SMALL";
  const capacity = route ? capacityFor(route, selectedClass) : defaultCapacity.SMALL;
  const allowedPassengers = Math.max(1, Math.min(capacity.passengerCapacity, 20));
  const allowedLuggage = Math.max(0, Math.min(capacity.luggageCapacity, 20));
  const currentPassengers = Math.min(Math.max(passengers, 1), allowedPassengers);
  const currentLuggage = Math.min(Math.max(luggage, 0), allowedLuggage);

  function clearQuote() {
    setQuote(null);
    setQuoteError("");
  }

  const getQuote = useCallback(async () => {
    if (!route || quoteBusy) return;
    setQuoteBusy(true);
    setQuote(null);
    setQuoteError("");
    try {
      const params = new URLSearchParams({
        routeId: route.id,
        bookingType: "PRIVATE_CAR",
        vehicleClass: selectedClass,
        passengerCount: String(currentPassengers),
        luggageCount: String(currentLuggage),
      });
      // Use the same public quote endpoint as the booking wizard; never compute fares in the chatbot.
      const result = await apiFetch<BookingQuote>(`/bookings/quote?${params}`, { skipAuth: true, timeoutMs: 25_000 });
      if (!Number.isFinite(result.passengerPrice) || result.passengerPrice < 0 || !result.currency ||
        result.routeId !== route.id || result.vehicleClass !== selectedClass ||
        result.passengerCount !== currentPassengers || result.luggageCount !== currentLuggage) {
        throw new Error("INVALID_QUOTE");
      }
      setQuote(result);
      recordAssistantEvent("QUOTE_SUCCESS", "prices");
    } catch {
      setQuoteError("تعذر جلب سعر معتمد لهذه الاختيارات. جرّب مرة أخرى أو افتح صفحة الحجز.");
    } finally {
      setQuoteBusy(false);
    }
  }, [route, quoteBusy, selectedClass, currentPassengers, currentLuggage]);

  return (
    <section className={styles.liveQuotes} aria-label="الأسعار والمسارات الحالية">
      <div className={styles.liveQuotesHeader}>
        <button type="button" onClick={onBack} className={styles.backButton}>
          <Icon name="arrow-right" size={16} /> العودة للمحادثة
        </button>
        <h3>المسارات والأسعار المباشرة</h3>
        <p>تُقرأ المسارات والأسعار من نظام الحجز نفسه، حسب اختياراتك.</p>
      </div>
      {loadState === "loading" ? <p role="status" className={styles.quoteNotice}>جارٍ الاتصال بخدمة الحجز وتحميل المسارات…</p> : null}
      {loadState === "error" ? (
        <div role="status" className={styles.quoteNotice}>
          <p>تعذر تحميل المسارات حالياً. يمكنك محاولة إعادة الاتصال أو الانتقال إلى صفحة الحجز.</p>
          <button className={styles.outlineButton} type="button" onClick={() => setAttempt((n) => n + 1)}>إعادة المحاولة</button>
          <Link href="/booking" className={styles.outlineButton}>صفحة الحجز</Link>
        </div>
      ) : null}
      {loadState === "ready" && !routes.length ? (
        <div className={styles.quoteNotice}>لا توجد مسارات متاحة للحجز حالياً. يمكنك مراجعة <Link href="/contact">خدمة العملاء</Link>.</div>
      ) : null}
      {loadState === "ready" && route ? (
        <div className={styles.quoteForm}>
          <label htmlFor="assistant-route">اختر المسار</label>
          <select id="assistant-route" disabled={quoteBusy} value={route.id} onChange={(event) => {
            setRouteId(event.target.value);
            const next = routes.find((item) => item.id === event.target.value);
            setVehicleClass(next ? validClasses(next)[0] ?? "SMALL" : "SMALL");
            setPassengers(1);
            setLuggage(0);
            clearQuote();
          }}>
            {routes.map((item) => (
              <option key={item.id} value={item.id}>من {item.origin.nameAr} إلى {item.destination.nameAr}</option>
            ))}
          </select>

          <label htmlFor="assistant-class">فئة السيارة</label>
          <select id="assistant-class" disabled={quoteBusy} value={selectedClass} onChange={(event) => {
            setVehicleClass(event.target.value as VehicleClass);
            setPassengers(1);
            setLuggage(0);
            clearQuote();
          }}>
            {availableClasses.map((item) => {
              const c = capacityFor(route, item);
              return <option key={item} value={item}>{classNames[item]} — {c.passengerCapacity} ركاب / {c.luggageCapacity} حقائب</option>;
            })}
          </select>

          <div className={styles.quoteCounts}>
            <div>
              <label htmlFor="assistant-passengers">الركاب</label>
              <select id="assistant-passengers" disabled={quoteBusy} value={currentPassengers} onChange={(event) => { setPassengers(Number(event.target.value)); clearQuote(); }}>
                {Array.from({ length: allowedPassengers }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="assistant-luggage">الحقائب</label>
              <select id="assistant-luggage" disabled={quoteBusy} value={currentLuggage} onChange={(event) => { setLuggage(Number(event.target.value)); clearQuote(); }}>
                {Array.from({ length: allowedLuggage + 1 }, (_, index) => index).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <button type="button" className={styles.quoteButton} onClick={() => void getQuote()} disabled={quoteBusy}>
            {quoteBusy ? "جارٍ جلب السعر…" : "عرض السعر المعتمد"}
          </button>
          {quoteError ? <p className={styles.quoteError} role="alert">{quoteError}</p> : null}
          {quote && quote.routeId === route.id && quote.vehicleClass === selectedClass &&
          quote.passengerCount === currentPassengers && quote.luggageCount === currentLuggage ? (
            <div className={styles.quoteResult} role="status">
              <small>السعر حسب المسار والفئة والأعداد المختارة</small>
              <strong>{currencyPrice(quote)}</strong>
              <span>السعر حسب الخيارات الحالية؛ ستُراجع صلاحية المسار والسعة والسعر مجدداً أثناء الحجز.</span>
              <Link
                href={assistantBookingHref({ routeId: route.id, vehicleClass: selectedClass, passengerCount: currentPassengers, luggageCount: currentLuggage })}
                className={styles.quoteButton}
                onClick={() => recordAssistantEvent("BOOKING_CLICK", "prices")}
              >احجز هذه الرحلة <Icon name="arrow-left" size={16} /></Link>
            </div>
          ) : (
            <p className={styles.quoteHelp}>الأسعار لا تُخمن بواسطة الذكاء الاصطناعي، بل تُجلب عبر واجهة التسعير الرسمية.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
