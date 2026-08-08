export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      style={{
        minHeight: "60dvh",
        display: "grid",
        placeItems: "center",
        padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))",
      }}
    >
      <div style={{ textAlign: "center", color: "#52655f" }}>
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            margin: "0 auto 14px",
            borderRadius: "50%",
            border: "4px solid #dce8e3",
            borderTopColor: "#0b7a53",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>جاري تحميل البيانات...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </main>
  );
}
