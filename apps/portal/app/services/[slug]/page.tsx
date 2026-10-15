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
    title: service.searchTitle,
    description: service.description,
    alternates: { canonical: `/services/${service.slug}` },
    openGraph: {
      type: "website",
      locale: "ar_SY",
      url: `/services/${service.slug}`,
      title: service.searchTitle,
      description: service.description,
    },
  };
}

export default async function PublicServiceDetailsPage({ params }: Props) {
  const { slug } = await params;
  const service = findPublicService(slug);
  if (!service) notFound();

  const serviceUrl = absoluteSiteUrl(`/services/${service.slug}`);
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${serviceUrl}#service`,
    name: service.title,
    description: service.description,
    url: serviceUrl,
    inLanguage: "ar",
    mainEntityOfPage: serviceUrl,
    serviceType: "Private airport and intercity transfer",
    provider: { "@id": absoluteSiteUrl("/#organization") },
    areaServed: [
      { "@type": "Country", name: "Syria" },
      { "@type": "Country", name: "Lebanon" },
      { "@type": "Country", name: "Jordan" },
    ],
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: absoluteSiteUrl("/") },
      { "@type": "ListItem", position: 2, name: "خدمات النقل الخاص", item: absoluteSiteUrl("/services") },
      { "@type": "ListItem", position: 3, name: service.shortTitle, item: serviceUrl },
    ],
  };

  const related = publicServices.filter((item) => item.slug !== service.slug);

  return (
    <Shell>
      <section className={styles.container}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializedJsonLd([serviceSchema, breadcrumbs]) }} />
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
          <p className={styles.disclaimer}>يُعرض السعر الرسمي عند اختيار المسار وفئة السيارة وعدد الركاب والحقائب. إرسال الطلب لا يضمن قبوله قبل مراجعته.</p>
        </header>
        <section className={styles.detailSection} aria-labelledby="service-directions-heading">
          <h2 id="service-directions-heading">اتجاهات الرحلة: الذهاب والعودة</h2>
          <p className={styles.sectionLead}>اختر الاتجاه الذي يناسب رحلتك. توافر كل خط مرتبط بالمسارات التي فعّلتها الإدارة عند الحجز.</p>
          <div className={styles.directionGrid}>
            {service.directions.map((direction, index) => (
              <article className={styles.directionCard} key={direction.title}>
                <span className={styles.eyebrow}>{index === 0 ? "الاتجاه الأول" : "الاتجاه العكسي"}</span>
                <h3>{direction.title}</h3>
                <p>{direction.description}</p>
                <h4>قبل إرسال طلب الحجز</h4>
                <ul>{direction.checklist.map((step) => <li key={step}>{step}</li>)}</ul>
                <Link href="/booking" className={styles.textLink}>استعرض المسار والسعر <Icon name="arrow-left" size={16} /></Link>
              </article>
            ))}
          </div>
        </section>
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
        <section className={styles.travelNote} aria-labelledby="travel-information-heading">
          <h2 id="travel-information-heading">معلومات مهمة قبل السفر</h2>
          <p>{service.travelNote}</p>
          <Link href="/terms" className={styles.textLink}>اطّلع على شروط الحجز <Icon name="arrow-left" size={16} /></Link>
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
        <section className={styles.detailSection} aria-labelledby="related-services-heading">
          <h2 id="related-services-heading">مسارات أخرى قد تهمك</h2>
          <div className={styles.relatedRoutes}>
            {related.map((item) => (
              <Link key={item.slug} href={`/services/${item.slug}`} className={styles.relatedRoute}>
                <span>{item.shortTitle}</span>
                <Icon name="arrow-left" size={17} />
              </Link>
            ))}
          </div>
        </section>
        <section className={styles.helpStrip}>
          <div><h2>هل حددت وجهتك وموعد سفرك؟</h2><p>أرسل طلبك دون الحاجة إلى تسجيل الدخول، ثم تتولى الإدارة مراجعته.</p></div>
          <Link href="/booking" className="button primary">ابدأ الحجز</Link>
        </section>
      </section>
    </Shell>
  );
}
