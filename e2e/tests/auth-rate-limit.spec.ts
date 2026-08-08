import { expect, test } from "@playwright/test";
import { accounts, apiBaseURL } from "../helpers/accounts";

test.describe("Authentication rate limiting", () => {
  test("repeated invalid credentials are blocked without revealing the account", async ({ request }) => {
    const payload = {
      email: `blocked-${Date.now()}@example.invalid`,
      password: "not-the-password",
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request.post(`${apiBaseURL}/auth/login`, { data: payload });
      expect(response.status()).toBe(401);
    }

    const blocked = await request.post(`${apiBaseURL}/auth/login`, {
      data: payload,
      headers: { Origin: "http://127.0.0.1:3000" },
    });
    expect(blocked.status()).toBe(429);

    const body = (await blocked.json()) as {
      message?: string;
      retryAfterSeconds?: number;
    };
    expect(body.message).toContain("محاولات كثيرة");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);

    const retryAfterHeader = Number.parseInt(blocked.headers()["retry-after"] ?? "", 10);
    expect(retryAfterHeader).toBe(body.retryAfterSeconds);
    expect(blocked.headers()["access-control-expose-headers"]?.toLowerCase()).toContain(
      "retry-after",
    );
    expect(blocked.headers()["x-request-id"]).toBeTruthy();
  });

  test("a successful login clears the identity failure counter", async ({ request }) => {
    const account = accounts.rider;

    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const invalid = await request.post(`${apiBaseURL}/auth/login`, {
          data: {
            email: account.email,
            password: `wrong-${cycle}-${attempt}`,
          },
        });
        expect(invalid.status()).toBe(401);
      }

      const valid = await request.post(`${apiBaseURL}/auth/login`, {
        data: {
          email: account.email,
          password: account.password,
        },
      });
      expect(valid.status()).toBe(201);
    }
  });
});
