import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { R2ObjectStorageService } from "../../apps/api/src/media/r2-object-storage.service";
import { accounts, apiBaseURL } from "../helpers/accounts";

test.describe("R2 public media delivery", () => {
  test("builds a short-lived signed GET URL without making the bucket public", () => {
    const service = new R2ObjectStorageService(
      new ConfigService({
        R2_ACCOUNT_ID: "account123",
        R2_ACCESS_KEY_ID: "access123",
        R2_SECRET_ACCESS_KEY: "secret123",
        R2_BUCKET: "ride-platform-media",
        R2_KEY_PREFIX: "ride-platform/media",
      }),
    );

    const signed = service.signedGetUrl(
      "r2://ride-platform-media/ride-platform/media/vehicle-photo.webp",
      600,
    );
    const url = new URL(signed);

    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("account123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/ride-platform-media/ride-platform/media/vehicle-photo.webp");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("access123/");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  test("returns 404 for a missing legacy local file without crashing the API", async ({ request }) => {
    const prisma = new PrismaClient();
    const storedName = `missing-${randomUUID()}.jpg`;
    let assetId: string | null = null;

    try {
      const uploader = await prisma.user.findUnique({
        where: { email: accounts.admin.email },
        select: { id: true },
      });
      expect(uploader).toBeTruthy();

      const asset = await prisma.mediaAsset.create({
        data: {
          originalName: "missing-legacy-image.jpg",
          storedName,
          mimeType: "image/jpeg",
          sizeBytes: 128,
          sha256: "0".repeat(64),
          storagePath: `/tmp/ride-platform-does-not-exist/${storedName}`,
          purpose: "VEHICLE_IMAGE",
          visibility: "PUBLIC",
          status: "APPROVED",
          uploadedById: uploader!.id,
          approvedAt: new Date(),
          metadata: {
            storageProvider: "LOCAL",
            variantKind: "ORIGINAL",
          },
        },
      });
      assetId = asset.id;

      const missingResponse = await request.get(`${apiBaseURL}/media/public/${asset.id}`);
      expect(missingResponse.status()).toBe(404);
      const body = await missingResponse.json();
      expect(body.message).toContain("ملف الوسائط غير موجود");

      const healthResponse = await request.get(`${apiBaseURL}/health`);
      expect(healthResponse.ok(), await healthResponse.text()).toBeTruthy();
    } finally {
      if (assetId) {
        await prisma.mediaAsset.delete({ where: { id: assetId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
