"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal route error", error);
  }, [error]);

  return (
    <main style={styles.page}>
      <section style={styles.card} role="alert" aria-live="assertive">
        <div style={styles.icon} aria-hidden="true">!</div>
        <h1 style={styles.title}>تعذر تحميل الصفحة</h1>
        <p style={styles.text}>
          تحقق من اتصال الإنترنت ثم حاول مرة أخرى. لن يتم حذف بيانات حسابك أو حجوزاتك.
        </p>
        <div style={styles.actions}>
          <button type="button" onClick={reset} style={styles.primaryButton}>
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={styles.secondaryButton}
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "70dvh",
    display: "grid",
    placeItems: "center",
    padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))",
    background: "#f6f8f7",
  },
  card: {
    width: "min(100%, 520px)",
    background: "#ffffff",
    border: "1px solid #dfe7e3",
    borderRadius: 20,
    padding: "28px 20px",
    textAlign: "center" as const,
    boxShadow: "0 12px 34px rgba(15, 59, 45, 0.08)",
  },
  icon: {
    width: 52,
    height: 52,
    margin: "0 auto 14px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "#eef7f3",
    color: "#0b7a53",
    fontSize: 28,
    fontWeight: 800,
  },
  title: { margin: "0 0 10px", fontSize: 24, color: "#17362d" },
  text: { margin: 0, lineHeight: 1.8, color: "#5c6f68" },
  actions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 10,
    justifyContent: "center",
    marginTop: 22,
  },
  primaryButton: {
    minHeight: 46,
    border: 0,
    borderRadius: 12,
    padding: "0 20px",
    background: "#0b7a53",
    color: "white",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 46,
    border: "1px solid #cbdad4",
    borderRadius: 12,
    padding: "0 20px",
    background: "white",
    color: "#17362d",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
};
