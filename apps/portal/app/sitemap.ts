import type { MetadataRoute } from "next";
import { absoluteSiteUrl, SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteSiteUrl("/booking"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
