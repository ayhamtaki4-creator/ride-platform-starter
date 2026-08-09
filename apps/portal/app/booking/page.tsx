import Link from "next/link";
import BookingFormContent from "@/components/booking-form-lazy-content";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";

export default function BookingPage() {
  return (
    <Shell>
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 20px 18px" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--muted)", marginBottom: 18 }}>
          <Icon name="arrow-right" size={17} /> العودة إلى الرئيسية
        </Link>
        <div style={{ maxWidth: 760 }}>
          <span className="eyebrow-v2">حجز جديد</span>
          <h1 style={{ margin: "10px 0 12px", fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.15 }}>احجز سيارتك بخطوات واضحة</h1>
          <p className="subtitle" style={{ fontSize: "1.02rem", lineHeight: 1.9 }}>
            اختر خط الرحلة والسيارة والموعد، ثم راجع بياناتك والسعر قبل إرسال الطلب إلى مركز العمليات.
          </p>
        </div>
      </section>
      <section className="booking-section-v2" style={{ paddingTop: 18 }}>
        <BookingFormContent />
      </section>
    </Shell>
  );
}
