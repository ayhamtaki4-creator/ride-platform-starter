import { absoluteSiteUrl } from "./site";

export function serializedJsonLd(data: unknown): string {
  // Prevent closing the script element when content changes in the future.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": absoluteSiteUrl("/#organization"),
  name: "طريق الشام",
  alternateName: "Tareeq Al-Sham",
  url: absoluteSiteUrl("/"),
  logo: absoluteSiteUrl("/icons/route-sham-512.png"),
  description: "منصة حجز رحلات بسيارة خاصة بين دمشق والمطارات والمدن ضمن المسارات المتاحة.",
  contactPoint: [
    { "@type": "ContactPoint", telephone: "+963965350502", contactType: "customer support", availableLanguage: "Arabic", areaServed: "SY" },
    { "@type": "ContactPoint", telephone: "+96171967194", contactType: "customer support", availableLanguage: "Arabic", areaServed: "LB" },
  ],
  areaServed: [
    { "@type": "Country", name: "Syria" },
    { "@type": "Country", name: "Lebanon" },
    { "@type": "Country", name: "Jordan" },
  ],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": absoluteSiteUrl("/#website"),
  name: "طريق الشام",
  url: absoluteSiteUrl("/"),
  inLanguage: "ar",
  publisher: { "@id": absoluteSiteUrl("/#organization") },
};
