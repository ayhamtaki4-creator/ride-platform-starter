import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { publicServices } from "@/lib/public-services";
import { Icon } from "@/components/ui/icon";
import styles from "./services.module.css";

export const metadata: Metadata = {
  title: "خدمات النقل الخاص إلى المطارات وبين المدن",
  description: "تعرّف على خدمات طريق الشام لحجز سيارة خاصة بين دمشق ومطار بيروت ومطار الملكة علياء ومطار دمشق والمحافظات السورية.",
  alternates: { canonical: "/services" },
  openGraph: { type: "website", url: "/services", title: "خدمات طريق الشام للنقل الخاص" },
};

export default function PublicServicesPage() {
  return (
    <Shell>
      <section className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><span>الخدمات</span></nav>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>خطوط النقل الخاص</span>
          <h1>خدمات طريق الشام إلى المطارات وبين المدن</h1>
          <p>اختر الخدمة المناسبة لرحلتك. تستطيع معرفة السعر حسب المسار وفئة السيارة وإرسال طلب حجز دون تسجيل الدخول.</p>
          <Link href="/booking" className="button primary">احجز سيارتك الآن <Icon name="arrow-left" size={18} /></Link>
        </header>
        <div className={styles.cards}>
          {publicServices.map((service) => (
            <article className={styles.card} key={service.slug}>
              <span className={styles.eyebrow}>سيارة خاصة</span>
              <h2><Link href={`/services/${service.slug}`}>{service.shortTitle}</Link></h2>
              <p>{service.description}</p>
              <Link href={`/services/${service.slug}`} className={styles.textLink}>تفاصيل الخدمة <Icon name="arrow-left" size={17} /></Link>
            </article>
          ))}
        </div>
        <section className={styles.helpStrip}>
          <div><h2>تحتاج مساعدة في اختيار المسار؟</h2><p>تواصل مع فريق الدعم للاستفسار عن المسارات المتاحة.</p></div>
          <Link href="/contact" className="button">وسائل التواصل</Link>
        </section>
      </section>
    </Shell>
  );
}
