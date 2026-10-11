import Link from "next/link";
import { Shell } from "@/components/shell";

export default function ActivateAccountPage() {
  return (
    <Shell>
      <main style={{ maxWidth: 720, margin: "60px auto", padding: "30px 20px", textAlign: "center" }}>
        <h1>استفد من مزايا طريق الشام</h1>
        <p style={{ marginTop: 18, lineHeight: 1.9 }}>
          إذا أردت الاستفادة من باقي مزايا الموقع، يرجى تسجيل الدخول أو إنشاء حساب.
        </p>
        <p style={{ color: "var(--muted)", lineHeight: 1.9 }}>
          خدمة التحقق من رقم الهاتف وتفعيل الحسابات المؤقتة غير متاحة حاليًا.
          يمكنك متابعة الحجز كضيف دون التحقق من الهاتف.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 24 }}>
          <Link className="button primary" href="/login">تسجيل الدخول</Link>
          <Link className="button" href="/register">إنشاء حساب جديد</Link>
        </div>
        <p style={{ marginTop: 22 }}><Link href="/">العودة إلى الرئيسية</Link></p>
      </main>
    </Shell>
  );
}
