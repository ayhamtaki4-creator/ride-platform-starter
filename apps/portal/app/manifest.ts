import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "طريق الشام",
    short_name: "طريق الشام",
    description: "منصة حجز ومتابعة نقل منظم وآمن بين سوريا ولبنان والأردن.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f8f7",
    theme_color: "#0b7a53",
    lang: "ar",
    dir: "rtl",
    categories: ["travel", "transportation"],
    icons: [
      {
        src: "/icons/route-sham.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/route-sham-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
