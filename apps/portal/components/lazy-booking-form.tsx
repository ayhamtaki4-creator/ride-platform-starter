"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const DynamicBookingForm = dynamic(
  () => import("./booking-form-lazy-content"),
  {
    ssr: false,
    loading: () => <BookingLoadingPlaceholder label="جارٍ تجهيز نموذج الحجز..." />,
  },
);

function BookingLoadingPlaceholder({ label = "مرّر قليلًا لبدء الحجز" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: 520,
        border: "1px solid var(--border)",
        borderRadius: 20,
        background: "var(--surface)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <strong style={{ display: "block", marginBottom: 8 }}>نموذج الحجز</strong>
        <span style={{ color: "var(--muted)", lineHeight: 1.8 }}>{label}</span>
      </div>
    </div>
  );
}

export function LazyBookingForm() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    const activate = () => setReady(true);
    const root = rootRef.current;
    const timeout = window.setTimeout(activate, 5_000);

    if (window.location.hash === "#booking") {
      activate();
    }

    const onHashChange = () => {
      if (window.location.hash === "#booking") activate();
    };
    window.addEventListener("hashchange", onHashChange);

    let observer: IntersectionObserver | undefined;
    if (root && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) activate();
        },
        { rootMargin: "300px 0px" },
      );
      observer.observe(root);
    }

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("hashchange", onHashChange);
      observer?.disconnect();
    };
  }, [ready]);

  return (
    <div
      ref={rootRef}
      data-booking-lazy-state={ready ? "active" : "waiting"}
      style={{ minHeight: ready ? undefined : 520 }}
    >
      {ready ? <DynamicBookingForm /> : <BookingLoadingPlaceholder />}
    </div>
  );
}
