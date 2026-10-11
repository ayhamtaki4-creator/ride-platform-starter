import Link from "next/link";
import { Shell } from "@/components/shell";

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
        <p>إذا كان لديك حساب سابق، فلن يظهر فيه هذا الحجز إلا بعد إثبات ملكية الرقم وربطه بالحساب.</p>
        <p>إذا كنت عميلًا جديدًا، فسيتم التحقق من رقم هاتفك قبل تفعيل الحساب الجديد.</p>
        <p><Link className="button primary" href="/activate">التحقق من الهاتف وتفعيل الحساب</Link></p>
        <p><Link href="/">العودة إلى الرئيسية</Link></p>
      </main>
    </Shell>
  );
}
