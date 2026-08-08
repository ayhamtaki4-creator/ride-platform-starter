import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test.describe("API health", () => {
  test("liveness responds without exposing framework headers", async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/health`);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-powered-by"]).toBeUndefined();
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

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
    expect(response.headers()["cache-control"]).toContain("no-store");

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

  test("safe incoming request IDs are echoed and exposed through CORS", async ({ request }) => {
    const requestId = "e2e-request-20260808";
    const response = await request.get(`${apiBaseURL}/health`, {
      headers: {
        "X-Request-Id": requestId,
        Origin: "http://127.0.0.1:3000",
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["x-request-id"]).toBe(requestId);
    expect(response.headers()["access-control-expose-headers"]?.toLowerCase()).toContain(
      "x-request-id",
    );
  });

  test("unsafe incoming request IDs are replaced", async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/health`, {
      headers: { "X-Request-Id": "unsafe request id with spaces !" },
    });

    expect(response.status()).toBe(200);
    const requestId = response.headers()["x-request-id"];
    expect(requestId).not.toBe("unsafe request id with spaces !");
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
