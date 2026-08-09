import { expect, test } from "@playwright/test";
import { accounts, apiBaseURL } from "../helpers/accounts";

const testEndpoint = "https://fcm.googleapis.com/fcm/send/mobile-e2e-device";
const testP256dh = "BOeEgIs4pVqcHNpQbKpvtzbDQzphJo9Udx5-iU_Ujk4CDLMcuksk3NedDYSF6t0iCdnLySBRTLYmD1vEtxwNw6M";
const testAuth = "mobile-e2e-auth-secret";

test.describe("Web Push subscriptions", () => {
  test("exposes the public VAPID key and persists only trusted push-service endpoints", async ({ request }) => {
    const login = await request.post(`${apiBaseURL}/auth/login`, {
      data: {
        email: accounts.rider.email,
        password: accounts.rider.password,
      },
    });
    expect(login.status()).toBe(201);
    const session = (await login.json()) as { accessToken: string };
    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
    };

    const config = await request.get(`${apiBaseURL}/web-push/config`, { headers });
    expect(config.status()).toBe(200);
    const configBody = (await config.json()) as {
      enabled: boolean;
      publicKey: string | null;
    };
    expect(configBody.enabled).toBe(true);
    expect(configBody.publicKey).toBe(process.env.WEB_PUSH_PUBLIC_KEY);

    const insecure = await request.post(`${apiBaseURL}/web-push/subscriptions`, {
      headers,
      data: {
        endpoint: "http://fcm.googleapis.com/fcm/send/not-secure",
        p256dh: testP256dh,
        auth: testAuth,
      },
    });
    expect(insecure.status()).toBe(400);

    const unknownHttpsHost = await request.post(`${apiBaseURL}/web-push/subscriptions`, {
      headers,
      data: {
        endpoint: "https://internal.example.test/push/device",
        p256dh: testP256dh,
        auth: testAuth,
      },
    });
    expect(unknownHttpsHost.status()).toBe(400);
    expect(JSON.stringify(await unknownHttpsHost.json())).toContain("غير معتمد");

    const subscribe = await request.post(`${apiBaseURL}/web-push/subscriptions`, {
      headers,
      data: {
        endpoint: testEndpoint,
        p256dh: testP256dh,
        auth: testAuth,
        expirationTime: Date.now() + 86_400_000,
      },
    });
    expect(subscribe.status()).toBe(201);
    const subscription = (await subscribe.json()) as {
      endpoint: string;
      expiresAt: string | null;
    };
    expect(subscription.endpoint).toBe(testEndpoint);
    expect(subscription.expiresAt).toBeTruthy();

    const update = await request.post(`${apiBaseURL}/web-push/subscriptions`, {
      headers,
      data: {
        endpoint: testEndpoint,
        p256dh: testP256dh,
        auth: "updated-mobile-e2e-auth-secret",
      },
    });
    expect(update.status()).toBe(201);

    const remove = await request.delete(`${apiBaseURL}/web-push/subscriptions`, {
      headers,
      data: { endpoint: testEndpoint },
    });
    expect(remove.status()).toBe(200);
    expect(await remove.json()).toEqual({ deleted: true });
  });
});
