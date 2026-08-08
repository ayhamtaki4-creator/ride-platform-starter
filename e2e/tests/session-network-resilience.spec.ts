import { expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Session network resilience", () => {
  test("a transient refresh outage does not erase a valid local session", async ({ page }) => {
    await loginAs(page, "admin");

    const before = await page.evaluate(() => ({
      refreshToken: localStorage.getItem("ride_refresh_token"),
      user: localStorage.getItem("ride_user"),
    }));
    expect(before.refreshToken).toBeTruthy();
    expect(before.user).toBeTruthy();

    await page.evaluate(() => {
      localStorage.setItem("ride_access_token", "expired-access-token-for-network-test");
    });

    await page.route("**/api/auth/refresh", async (route) => {
      await route.abort("connectionfailed");
    });

    await page.reload();
    await page.waitForTimeout(1_500);

    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);

    const duringOutage = await page.evaluate(() => ({
      accessToken: localStorage.getItem("ride_access_token"),
      refreshToken: localStorage.getItem("ride_refresh_token"),
      user: localStorage.getItem("ride_user"),
    }));

    expect(duringOutage.accessToken).toBe("expired-access-token-for-network-test");
    expect(duringOutage.refreshToken).toBe(before.refreshToken);
    expect(duringOutage.user).toBe(before.user);

    await page.unroute("**/api/auth/refresh");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect
      .poll(
        async () => page.evaluate(() => localStorage.getItem("ride_access_token")),
        { timeout: 15_000 },
      )
      .not.toBe("expired-access-token-for-network-test");

    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    const recoveredRefresh = await page.evaluate(() =>
      localStorage.getItem("ride_refresh_token"),
    );
    expect(recoveredRefresh).toBeTruthy();
  });

  test("an actually invalid refresh token still expires the session", async ({ page }) => {
    await loginAs(page, "admin");

    await page.evaluate(() => {
      localStorage.setItem("ride_access_token", "expired-access-token-for-invalid-refresh-test");
      localStorage.setItem("ride_refresh_token", "invalid-refresh-token");
    });

    await page.reload();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 15_000 });

    const stored = await page.evaluate(() => ({
      accessToken: localStorage.getItem("ride_access_token"),
      refreshToken: localStorage.getItem("ride_refresh_token"),
      user: localStorage.getItem("ride_user"),
    }));

    expect(stored).toEqual({ accessToken: null, refreshToken: null, user: null });
  });
});
