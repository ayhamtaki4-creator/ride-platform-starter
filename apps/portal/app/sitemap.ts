import type { MetadataRoute } from "next";

const siteUrl = "https://alnokhbaeducation.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
