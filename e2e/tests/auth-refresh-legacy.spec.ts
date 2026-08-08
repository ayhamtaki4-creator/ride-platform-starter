import { expect, test } from "@playwright/test";
import { accounts, apiBaseURL } from "../helpers/accounts";

test("legacy refresh token body remains supported when cookies are disabled", async ({ request }) => {
  const login = await request.post(`${apiBaseURL}/auth/login`, {
    data: {
      email: accounts.admin.email,
      password: accounts.admin.password,
    },
  });

  expect(login.status()).toBe(201);
  expect(login.headers()["cache-control"]).toContain("no-store");
  const loginBody = (await login.json()) as {
    accessToken?: string;
    refreshToken?: string;
  };
  expect(loginBody.accessToken).toBeTruthy();
  expect(loginBody.refreshToken).toBeTruthy();

  const refresh = await request.post(`${apiBaseURL}/auth/refresh`, {
    data: { refreshToken: loginBody.refreshToken },
  });
  expect(refresh.status()).toBe(201);
  const refreshBody = (await refresh.json()) as {
    accessToken?: string;
    refreshToken?: string;
  };
  expect(refreshBody.accessToken).toBeTruthy();
  expect(refreshBody.refreshToken).toBeTruthy();
  expect(refreshBody.refreshToken).not.toBe(loginBody.refreshToken);

  const logout = await request.post(`${apiBaseURL}/auth/logout`, {
    data: { refreshToken: refreshBody.refreshToken },
  });
  expect(logout.status()).toBe(201);

  const reused = await request.post(`${apiBaseURL}/auth/refresh`, {
    data: { refreshToken: refreshBody.refreshToken },
  });
  expect(reused.status()).toBe(401);
});
