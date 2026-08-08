import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test.describe("API health", () => {
  test("liveness responds without exposing framework headers", async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/health`);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-powered-by"]).toBeUndefined();
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");

    const body = (await response.json()) as {
      status?: string;
      service?: string;
      uptimeSeconds?: number;
    };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ride-platform-api");
    expect(body.uptimeSeconds).toEqual(expect.any(Number));
  });

  test("readiness verifies PostgreSQL and Redis", async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/health/ready`);
    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      status?: string;
      checks?: {
        database?: { status?: string; required?: boolean };
        redis?: { status?: string; required?: boolean };
      };
    };

    expect(body.status).toBe("ok");
    expect(body.checks?.database).toMatchObject({ status: "ok", required: true });
    expect(body.checks?.redis?.status).toBe("ok");
  });
});
