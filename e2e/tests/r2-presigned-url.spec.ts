import { ConfigService } from "@nestjs/config";
import { expect, test } from "@playwright/test";
import { R2ObjectStorageService } from "../../apps/api/src/media/r2-object-storage.service";

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
});
