import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("Mobile flight-ticket upload", () => {
  test("compresses an image larger than 10 MB before applying the upload limit", async ({ page, request }) => {
    const routesResponse = await request.get(`${apiBaseURL}/routes`);
    expect(routesResponse.ok()).toBeTruthy();
    const routes = (await routesResponse.json()) as Array<{
      id: string;
      nameAr: string;
      requiresFlightDetails: boolean;
      flightTicketUploadEnabled?: boolean;
    }>;
    const route = routes.find(
      (candidate) => candidate.requiresFlightDetails && candidate.flightTicketUploadEnabled !== false,
    );
    expect(route, "Seed data must include a route with flight-ticket upload enabled").toBeTruthy();

    await page.goto("/booking");
    await expect(page.locator("#booking-card")).toBeVisible();

    await page
      .getByRole("button", { name: new RegExp(escapeRegExp(route!.nameAr)) })
      .click();
    await page.getByRole("button", { name: "التالي" }).click();

    const upload = page.locator('input[type="file"][accept*="image/jpeg"]');
    await expect(upload).toHaveCount(1);

    const originalSize = await upload.evaluate(async (node) => {
      const input = node as HTMLInputElement;
      const width = 2300;
      const height = 2300;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable in the test browser");

      const image = context.createImageData(width, height);
      // Deterministic pseudo-random pixels keep the PNG genuinely large and
      // decodable, unlike padding bytes after a tiny fixture.
      let seed = 0x12345678;
      for (let index = 0; index < image.data.length; index += 4) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        image.data[index] = seed & 0xff;
        image.data[index + 1] = (seed >>> 8) & 0xff;
        image.data[index + 2] = (seed >>> 16) & 0xff;
        image.data[index + 3] = 255;
      }
      context.putImageData(image, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error("PNG encoding failed")),
          "image/png",
        );
      });
      if (blob.size <= 10 * 1024 * 1024 || blob.size > 30 * 1024 * 1024) {
        throw new Error(`Unexpected generated PNG size: ${blob.size}`);
      }

      const file = new File([blob], "ticket-large.png", { type: "image/png" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return blob.size;
    });

    expect(originalSize).toBeGreaterThan(10 * 1024 * 1024);
    await expect(page.getByText(/تم تصغير صورة التذكرة من/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/ticket-large\.(?:webp|png)/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/تعذر تصغير التذكرة إلى أقل من 10/)).toHaveCount(0);
  });
});
