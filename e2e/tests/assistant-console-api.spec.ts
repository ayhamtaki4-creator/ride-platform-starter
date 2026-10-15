import { expect, test } from "@playwright/test";
import { apiBaseURL } from "../helpers/accounts";

test.describe("Assistant admin configuration security", () => {
  test("public settings expose only approved fields", async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/assistant/config`);
    expect(response.status()).toBe(200);
    const data = await response.json() as Record<string, unknown>;
    expect(data).toMatchObject({ enabled: true });
    expect(typeof data.welcomeMessage).toBe("string");
    expect(Array.isArray(data.faqs)).toBeTruthy();
    expect(Object.keys(data).sort()).toEqual(["enabled", "faqs", "welcomeMessage"].sort());
  });

  test("admin settings and metrics reject guests", async ({ request }) => {
    const getSettings = await request.get(`${apiBaseURL}/admin/assistant/config`);
    expect(getSettings.status()).toBe(401);
    const getMetrics = await request.get(`${apiBaseURL}/admin/assistant/metrics`);
    expect(getMetrics.status()).toBe(401);
    const editSettings = await request.patch(`${apiBaseURL}/admin/assistant/config`, {
      data: { enabled: false, welcomeMessage: "Unauthorized", faqs: [] },
    });
    expect(editSettings.status()).toBe(401);
  });

  test("event metrics accept categories only and no free text", async ({ request }) => {
    const invalid = await request.post(`${apiBaseURL}/assistant/metric`, {
      data: { event: "QUESTION", topic: "my phone 123456789" },
    });
    expect(invalid.status()).toBe(400);
    const extra = await request.post(`${apiBaseURL}/assistant/metric`, {
      data: { event: "OPEN", topic: "general", message: "should not be stored" },
    });
    expect(extra.status()).toBe(400);
    const okay = await request.post(`${apiBaseURL}/assistant/metric`, {
      data: { event: "OPEN", topic: "general" },
    });
    expect(okay.status()).toBe(201);
    expect(await okay.json()).toEqual({ recorded: true });
  });
});
