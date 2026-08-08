import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test.describe("Public flight-ticket analysis", () => {
  test("accepts a ticket for analysis without an authenticated session", async ({ request }) => {
    const response = await request.post(`${apiBaseURL}/bookings/flight-ticket/analyze`, {
      multipart: {
        file: {
          name: "ticket.png",
          mimeType: "image/png",
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      },
    });

    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      extraction?: {
        status?: string;
        warning?: string | null;
      };
    };
    expect(["EXTRACTED", "MANUAL_REQUIRED"]).toContain(body.extraction?.status);
  });
});
