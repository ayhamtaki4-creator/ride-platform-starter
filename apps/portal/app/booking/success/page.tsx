import Link from "next/link";
import { Shell } from "@/components/shell";
import { GuestBookingProof } from "@/components/guest-booking-proof";

export default async function GuestBookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const bookingReference = typeof ref === "string" && /^[A-Za-z0-9-]{1,50}$/.test(ref) ? ref : null;
  return (
    <Shell>
      <main style={{ maxWidth: 720, margin: "60px auto", padding: "30px 20px", textAlign: "center" }}>
        <h1>تم استلام طلب الحجز</h1>
        {bookingReference ? <p>رقم حجزك: <strong dir="ltr">{bookingReference}</strong></p> : null}
        <p>سيقوم مركز العمليات بمراجعة الطلب والتواصل معك على الرقم الذي أدخلته.</p>
        <p>يمكنك متابعة الحجز كضيف دون الحاجة إلى إنشاء حساب.</p>
        <p style={{ marginTop: 24, fontWeight: 600 }}>
          إذا أردت الاستفادة من باقي مزايا الموقع، يرجى تسجيل الدخول أو إنشاء حساب.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 20 }}>
          <Link className="button primary" href="/login">تسجيل الدخول</Link>
          <Link className="button" href="/register">إنشاء حساب جديد</Link>
        </div>
        <p style={{ marginTop: 20, fontSize: "0.9rem", color: "var(--muted)" }}>
          عند التسجيل أو تسجيل الدخول من هذا المتصفح بنفس رقم هاتف الحجز،
          ستُربط الرحلة بحسابك تلقائيًا لتتمكن من عرض تفاصيلها ومتابعتها.
        </p>
        <GuestBookingProof bookingReference={bookingReference} />
        <p><Link href="/">العودة إلى الرئيسية</Link></p>
      </main>
    </Shell>
  );
}
