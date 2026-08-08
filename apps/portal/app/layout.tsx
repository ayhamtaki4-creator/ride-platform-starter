import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import "leaflet/dist/leaflet.css";
import "react-datepicker/dist/react-datepicker.css";
import "react-phone-input-2/lib/style.css";
import "./globals.css";
import "./tracking.css";
import "./booking-mobile.css";
import "./mobile-shell.css";

export const metadata: Metadata = {
  title: {
    default: "طريق الشام",
    template: "%s | طريق الشام",
  },
  description: "منصة حجز ومتابعة نقل منظم وآمن بين سوريا ولبنان والأردن.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b7a53",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
