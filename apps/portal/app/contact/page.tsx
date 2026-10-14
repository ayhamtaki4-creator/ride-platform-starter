import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { whatsappHref } from "@/lib/whatsapp-link";
import styles from "../services/services.module.css";

export const metadata: Metadata = {
  title: "تواصل معنا | حجز نقل خاص إلى المطارات",
  description: "تواصل مع دعم طريق الشام للاستفسار عن حجز سيارة خاصة من دمشق إلى مطار بيروت أو عمّان أو من مطار دمشق إلى المحافظات.",
  alternates: { canonical: "/contact" },
};

const phones = [
  { country: "سوريا", number: "+963 965 350 502", tel: "+963965350502" },
  { country: "لبنان", number: "+961 71 967 194", tel: "+96171967194" },
];

export default function ContactPage() {
  return (
    <Shell>
      <section className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><span>تواصل معنا</span></nav>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>الدعم والاستفسارات</span>
          <h1>تواصل مع طريق الشام</h1>
          <p>هل تحتاج إلى مساعدة في اختيار المسار أو فئة السيارة، أو لديك استفسار عن حجزك؟ يمكنك مراسلتنا عبر وسائل التواصل التالية.</p>
        </header>
        <div className={styles.cards}>
          {phones.map((contact) => (
            <section className={styles.card} key={contact.tel}>
              <h2>الدعم — {contact.country}</h2>
              <p dir="ltr">{contact.number}</p>
              <div className={styles.heroActions}>
                <a className="button primary" href={whatsappHref(contact.tel)} target="_blank" rel="noopener noreferrer" aria-label={`مراسلة دعم ${contact.country} عبر واتساب`}>
                  واتساب <Icon name="arrow-left" size={16} />
                </a>
                <a className="button" href={`tel:${contact.tel}`} data-contact-channel="phone">اتصال هاتفي</a>
              </div>
            </section>
          ))}
          <section className={styles.card}>
            <h2>حجز جديد</h2>
            <p>يمكنك إرسال طلب حجز مباشرة من الموقع، دون الحاجة إلى تسجيل الدخول أولاً.</p>
            <Link href="/booking" className="button primary">ابدأ الحجز <Icon name="arrow-left" size={16} /></Link>
          </section>
        </div>
        <section className={styles.helpStrip}>
          <div><h2>لديك حجز سابق؟</h2><p>اذكر مرجع الحجز عند مراسلة فريق الدعم ليسهل التحقق من طلبك. لا ترسل كلمة المرور أو رمز استعادة الحساب لأي شخص.</p></div>
          <Link href="/terms" className="button">شروط الحجز</Link>
        </section>
      </section>
    </Shell>
  );
}
