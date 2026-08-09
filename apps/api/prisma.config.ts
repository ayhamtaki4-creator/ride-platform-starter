import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const envPath = join(projectRoot, ".env");

// prisma.config.ts disables Prisma's historical automatic .env loading.
// Keep local development behavior without adding a dotenv dependency; CI and
// production continue to use environment variables supplied by the platform.
if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
