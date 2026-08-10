import { devices, expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.use({ ...devices["Pixel 7"] });

test.describe("Driver global GPS recovery", () => {
  test("recovers requested tracking outside the tracking page and clears stale intent", async ({ page }) => {
    const tripId = "77777777-7777-4777-8777-777777777777";
    const storageKey = `ride_driver_auto_track:${tripId}`;

    await page.addInitScript(() => {
      const state = window as typeof window & {
        __driverGpsWatchCalls?: number;
        __driverGpsClearCalls?: number;
        __driverGpsRefreshCalls?: number;
      };
      const geolocation = navigator.geolocation;

      Object.defineProperty(geolocation, "watchPosition", {
        configurable: true,
        value: () => {
          state.__driverGpsWatchCalls = (state.__driverGpsWatchCalls ?? 0) + 1;
          return state.__driverGpsWatchCalls;
        },
      });
      Object.defineProperty(geolocation, "clearWatch", {
        configurable: true,
        value: () => {
          state.__driverGpsClearCalls = (state.__driverGpsClearCalls ?? 0) + 1;
        },
      });
      Object.defineProperty(geolocation, "getCurrentPosition", {
        configurable: true,
        value: () => {
          state.__driverGpsRefreshCalls = (state.__driverGpsRefreshCalls ?? 0) + 1;
        },
      });
    });

    await loginAs(page, "driver");

    let tripActive = true;
    await page.route(/\/api\/drivers\/me\/schedule(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          tripActive
            ? [{ id: tripId, status: "IN_PROGRESS" }]
            : [],
        ),
      }),
    );

    await page.evaluate(
      ({ key }) => localStorage.setItem(key, "1"),
      { key: storageKey },
    );

    await page.goto("/driver/profile");
    await expect(page.getByRole("heading", { name: "الحساب والمركبة" })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as typeof window & { __driverGpsWatchCalls?: number }).__driverGpsWatchCalls ?? 0,
        ),
      )
      .toBeGreaterThan(0);

    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
      .toBe("1");

    tripActive = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
      .toBeNull();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as typeof window & { __driverGpsClearCalls?: number }).__driverGpsClearCalls ?? 0,
        ),
      )
      .toBeGreaterThan(0);
  });
});
