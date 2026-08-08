"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f6f8f7" }}>
        <main
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))",
          }}
        >
          <section
            role="alert"
            style={{
              width: "min(100%, 520px)",
              background: "white",
              border: "1px solid #dfe7e3",
              borderRadius: 20,
              padding: "28px 20px",
              textAlign: "center",
              boxShadow: "0 12px 34px rgba(15, 59, 45, 0.08)",
            }}
          >
            <h1 style={{ margin: "0 0 10px", color: "#17362d" }}>حدث خطأ غير متوقع</h1>
            <p style={{ margin: "0 0 20px", lineHeight: 1.8, color: "#5c6f68" }}>
              تعذر تشغيل الصفحة بشكل صحيح. أعد المحاولة، وإذا استمرت المشكلة أعد تحميل الموقع.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 48,
                border: 0,
                borderRadius: 12,
                padding: "0 22px",
                background: "#0b7a53",
                color: "white",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              إعادة المحاولة
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
