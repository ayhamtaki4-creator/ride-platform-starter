import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "70dvh",
        display: "grid",
        placeItems: "center",
        padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))",
        background: "#f6f8f7",
      }}
    >
      <section
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
        <p style={{ margin: "0 0 8px", color: "#0b7a53", fontSize: 34, fontWeight: 800 }}>404</p>
        <h1 style={{ margin: "0 0 10px", color: "#17362d" }}>الصفحة غير موجودة</h1>
        <p style={{ margin: "0 0 20px", lineHeight: 1.8, color: "#5c6f68" }}>
          قد يكون الرابط قديمًا أو تم نقل الصفحة إلى مكان آخر.
        </p>
        <Link
          href="/"
          style={{
            minHeight: 48,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            padding: "0 22px",
            background: "#0b7a53",
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          العودة إلى الرئيسية
        </Link>
      </section>
    </main>
  );
}
