import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl5H0sAAAAASUVORK5CYII=",
  "base64",
);

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

    await page.goto("/");
    await expect(page.getByText("احجز رحلتك خلال دقائق")).toBeVisible();

    await page
      .getByRole("button", { name: new RegExp(escapeRegExp(route!.nameAr)) })
      .click();
    await page.getByRole("button", { name: "التالي" }).click();

    const upload = page.locator('input[type="file"][accept*="image/jpeg"]');
    await expect(upload).toHaveCount(1);

    // Valid PNG data with harmless trailing bytes simulates a large phone-camera
    // file without committing a >10 MB fixture to the repository. PNG decoders
    // ignore data after IEND, while the browser still reports the full file size.
    const oversizedPhonePhoto = Buffer.concat([
      ONE_PIXEL_PNG,
      Buffer.alloc(11 * 1024 * 1024, 0),
    ]);
    await upload.setInputFiles({
      name: "ticket-large.png",
      mimeType: "image/png",
      buffer: oversizedPhonePhoto,
    });

    await expect(page.getByText(/ticket-large\.(?:webp|png)/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/حجم .*يجب ألا يتجاوز 10/)).toHaveCount(0);
  });
});
