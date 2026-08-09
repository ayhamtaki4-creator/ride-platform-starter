import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { ConnectionStatusBanner } from "@/components/connection-status-banner";
import { PwaRegistration } from "@/components/pwa-registration";
import { ToastProvider } from "@/components/ui/toast-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";
import "./tracking.css";
import "./mobile-shell.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "طريق الشام",
  title: {
    default: "طريق الشام | نقل مسبق بين سوريا ولبنان والأردن",
    template: "%s | طريق الشام",
  },
  description:
    "احجز سيارة خاصة مسبقًا بين دمشق ومطار بيروت ومطار الملكة علياء، وبين مطار دمشق والمحافظات السورية، مع متابعة الرحلة والسائق.",
  keywords: [
    "طريق الشام",
    "نقل دمشق بيروت",
    "مطار بيروت دمشق",
    "نقل دمشق الأردن",
    "مطار الملكة علياء دمشق",
    "نقل مطار دمشق",
    "حجز سيارة سوريا",
  ],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/route-sham-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/route-sham-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/route-sham.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icons/route-sham-192.png",
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "طريق الشام",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "ar_SY",
    url: SITE_URL,
    siteName: "طريق الشام",
    title: "طريق الشام | نقل مسبق بين سوريا ولبنان والأردن",
    description:
      "حجز سيارة خاصة مسبقًا للمطارات والمسارات بين سوريا ولبنان والأردن مع متابعة الرحلة.",
  },
  twitter: {
    card: "summary",
    title: "طريق الشام",
    description: "نقل مسبق منظم للمطارات والمسارات بين سوريا ولبنان والأردن.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b7a53",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        <ConnectionStatusBanner />
        <PwaRegistration />
      </body>
    </html>
  );
}
