import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // السماح بالوصول إلى خادم التطوير من الهاتف عبر الشبكة المحلية
  allowedDevOrigins: [
    "172.20.10.2",
  ],
};

export default nextConfig;