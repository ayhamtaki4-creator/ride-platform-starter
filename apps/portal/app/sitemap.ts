import type { MetadataRoute } from "next";
import { absoluteSiteUrl, SITE_URL } from "@/lib/site";
import { publicServices } from "@/lib/public-services";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/booking", priority: 0.9, changeFrequency: "weekly" },
    { path: "/services", priority: 0.9, changeFrequency: "weekly" },
    { path: "/contact", priority: 0.7, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.4, changeFrequency: "monthly" },
    ...publicServices.map((service) => ({
      path: `/services/${service.slug}`,
      priority: 0.85,
      changeFrequency: "weekly" as const,
    })),
  ];

  return pages.map(({ path, priority, changeFrequency }) => ({
    url: path === "/" ? SITE_URL : absoluteSiteUrl(path),
    changeFrequency,
    priority,
  }));
}
