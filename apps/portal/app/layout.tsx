import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { PwaRegistration } from "@/components/pwa-registration";
import { ToastProvider } from "@/components/ui/toast-provider";
import "leaflet/dist/leaflet.css";
import "react-datepicker/dist/react-datepicker.css";
import "react-phone-input-2/lib/style.css";
import "./globals.css";
import "./tracking.css";
import "./booking-mobile.css";
import "./mobile-shell.css";

const siteUrl = "https://alnokhbaeducation.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
    icon: [{ url: "/icons/route-sham.svg", type: "image/svg+xml" }],
    shortcut: "/icons/route-sham.svg",
  },
  appleWebApp: {
    capable: true,
    title: "طريق الشام",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "ar_SY",
    url: siteUrl,
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
    <html lang="ar" dir="rtl">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        <PwaRegistration />
      </body>
    </html>
  );
}
