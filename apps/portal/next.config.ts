import type { NextConfig } from "next";

const configuredOrigins = (
  process.env.NEXT_ALLOWED_DEV_ORIGINS ?? ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.106",
    ...configuredOrigins,
  ],
};

export default nextConfig;