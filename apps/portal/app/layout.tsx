import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ride Platform',
  description: 'منصة نقل متعددة الأدوار'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
