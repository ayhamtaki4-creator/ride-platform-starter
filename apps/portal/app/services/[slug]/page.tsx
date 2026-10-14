import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { findPublicService, publicServices } from "@/lib/public-services";
import { absoluteSiteUrl } from "@/lib/site";
import { serializedJsonLd } from "@/lib/structured-data";
import styles from "../services.module.css";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return publicServices.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const service = findPublicService(slug);
  if (!service) return { title: "الخدمة غير موجودة", robots: { index: false } };
  return {
    title: service.title,
    description: service.description,
    alternates: { canonical: `/services/${service.slug}` },
    openGraph: {
      type: "website",
      locale: "ar_SY",
      url: `/services/${service.slug}`,
      title: service.title,
      description: service.description,
    },
  };
}

export default async function PublicServiceDetailsPage({ params }: Props) {
  const { slug } = await params;
  const service = findPublicService(slug);
  if (!service) notFound();

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.description,
    url: absoluteSiteUrl(`/services/${service.slug}`),
    serviceType: "Private airport and intercity transfer",
    provider: { "@id": absoluteSiteUrl("/#organization") },
    areaServed: [
      { "@type": "Country", name: "Syria" },
      { "@type": "Country", name: "Lebanon" },
      { "@type": "Country", name: "Jordan" },
    ],
  };

  return (
    <Shell>
      <section className={styles.container}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializedJsonLd(serviceSchema) }} />
        <nav className={styles.breadcrumb} aria-label="مسار الصفحة">
          <Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><Link href="/services">الخدمات</Link><span aria-hidden="true">/</span><span>{service.shortTitle}</span>
        </nav>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>حجز سيارة خاصة</span>
          <h1>{service.title}</h1>
          <p>{service.introduction}</p>
          <div className={styles.heroActions}>
            <Link href="/booking" className="button primary">عرض السعر والحجز <Icon name="arrow-left" size={18} /></Link>
            <Link href="/contact" className="button">استفسر عبر الدعم</Link>
          </div>
          <p className={styles.disclaimer}>المسارات والأسعار وتوافر فئات السيارات يحددها نموذج الحجز الحالي.</p>
        </header>
        <section aria-labelledby="service-details-heading" className={styles.detailSection}>
          <h2 id="service-details-heading">كيف تتم الرحلة؟</h2>
          <div className={styles.cards}>
            {service.sections.map((item) => (
              <article className={styles.card} key={item.title}>
                <h3>{item.title}</h3><p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="service-faq-heading" className={styles.detailSection}>
          <h2 id="service-faq-heading">أسئلة شائعة عن هذه الخدمة</h2>
          <div className={styles.faqs}>{service.faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}</div>
        </section>
        <section className={styles.helpStrip}>
          <div><h2>هل حددت وجهتك وموعد سفرك؟</h2><p>أرسل طلبك دون الحاجة إلى تسجيل الدخول، ثم تتولى الإدارة مراجعته.</p></div>
          <Link href="/booking" className="button primary">ابدأ الحجز</Link>
        </section>
      </section>
    </Shell>
  );
}
