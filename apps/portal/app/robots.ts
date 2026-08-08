import type { MetadataRoute } from "next";

const siteUrl = "https://alnokhbaeducation.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/driver/",
        "/rider/",
        "/notifications/",
        "/tracking/",
        "/login",
        "/register",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
