import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import "leaflet/dist/leaflet.css";
import "react-datepicker/dist/react-datepicker.css";
import "react-phone-input-2/lib/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "طريق الشام",
    template: "%s | طريق الشام",
  },
  description: "منصة حجز نقل منظم وآمن بين مطار بيروت ودمشق",
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
