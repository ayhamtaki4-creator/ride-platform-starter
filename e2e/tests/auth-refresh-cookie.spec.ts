import { expect, test } from "@playwright/test";
import { accounts, apiBaseURL } from "../helpers/accounts";

test("http-only refresh cookie rotates and logs out without exposing the token body", async ({ request }) => {
  const login = await request.post(`${apiBaseURL}/auth/login`, {
    data: {
      email: accounts.admin.email,
      password: accounts.admin.password,
    },
  });

  expect(login.status()).toBe(201);
  const loginCookie = login.headers()["set-cookie"] ?? "";
  expect(loginCookie).toContain("ride_refresh_token=");
  expect(loginCookie.toLowerCase()).toContain("httponly");
  expect(loginCookie.toLowerCase()).toContain("samesite=lax");
  expect(loginCookie).toContain("Path=/api/auth");

  const loginBody = (await login.json()) as {
    accessToken?: string;
    refreshToken?: string;
  };
  expect(loginBody.accessToken).toBeTruthy();
  expect(loginBody.refreshToken).toBeUndefined();

  const refresh = await request.post(`${apiBaseURL}/auth/refresh`, {
    data: {},
  });
  expect(refresh.status()).toBe(201);
  const refreshCookie = refresh.headers()["set-cookie"] ?? "";
  expect(refreshCookie).toContain("ride_refresh_token=");
  expect(refreshCookie.toLowerCase()).toContain("httponly");

  const refreshBody = (await refresh.json()) as {
    accessToken?: string;
    refreshToken?: string;
  };
  expect(refreshBody.accessToken).toBeTruthy();
  expect(refreshBody.refreshToken).toBeUndefined();

  const logout = await request.post(`${apiBaseURL}/auth/logout`, {
    data: {},
  });
  expect(logout.status()).toBe(201);
  const clearCookie = logout.headers()["set-cookie"] ?? "";
  expect(clearCookie).toContain("ride_refresh_token=");
  expect(clearCookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);

  const afterLogout = await request.post(`${apiBaseURL}/auth/refresh`, {
    data: {},
  });
  expect(afterLogout.status()).toBe(400);
});
