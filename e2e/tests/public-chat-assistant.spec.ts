import { expect, test } from "@playwright/test";

const firstRouteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondRouteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const fixtures = [
  {
    id: firstRouteId,
    code: "DAMASCUS_BEIRUT",
    nameAr: "دمشق إلى مطار بيروت",
    isActive: true,
    bookable: true,
    origin: { nameAr: "دمشق" },
    destination: { nameAr: "مطار بيروت" },
    bookingTypes: ["PRIVATE_CAR"],
    vehicleClasses: [
      { vehicleClass: "SMALL", passengerCapacity: 3, luggageCapacity: 4 },
      { vehicleClass: "LARGE", passengerCapacity: 8, luggageCapacity: 8 },
    ],
    pricingRules: [
      { bookingType: "PRIVATE_CAR", vehicleClass: "SMALL", passengerPrice: 100, currency: "USD" },
      { bookingType: "PRIVATE_CAR", vehicleClass: "LARGE", passengerPrice: 150, currency: "USD" },
    ],
  },
  {
    id: secondRouteId,
    code: "DAMASCUS_AMMAN",
    nameAr: "دمشق إلى مطار الملكة علياء",
    isActive: true,
    bookable: true,
    origin: { nameAr: "دمشق" },
    destination: { nameAr: "مطار الملكة علياء" },
    bookingTypes: ["PRIVATE_CAR"],
    vehicleClasses: [{ vehicleClass: "SMALL", passengerCapacity: 3, luggageCapacity: 4 }],
    pricingRules: [{ bookingType: "PRIVATE_CAR", vehicleClass: "SMALL", passengerPrice: 110, currency: "USD" }],
  },
];

test.describe("Public booking assistant", () => {
  test("visitor can ask questions without signing in when AI is unavailable", async ({ page }) => {
    await page.route("**/api/assistant/chat", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "AI_UNAVAILABLE" }) });
    });
    await page.route("**/api/health", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route("**/api/routes", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures) }));
    await page.goto("/");

    const launcher = page.getByRole("button", { name: "فتح مساعد طريق الشام" });
    await expect(launcher).toBeVisible();
    await launcher.click();

    const dialog = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "كم سعر الرحلة؟" }).click();
    await expect(dialog.getByText("المسارات والأسعار المباشرة")).toBeVisible();
    await dialog.getByRole("button", { name: "العودة للمحادثة" }).click();
    await expect(dialog.getByText(/يختلف السعر حسب المسار/)).toBeVisible();

    await dialog.getByRole("textbox", { name: "اكتب سؤالك" }).fill("كيف أتابع حجزي؟");
    await dialog.getByRole("button", { name: "إرسال السؤال" }).click();
    await expect(dialog.getByText(/إذا حجزت كضيف/)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("live price comes from actual public quote API and gets invalidated on changes", async ({ page }) => {
    await page.route("**/api/health", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route("**/api/routes", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures) }));
    let latestQuoteRequest = "";
    await page.route("**/api/bookings/quote?**", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      latestQuoteRequest = route.request().url();
      const fare = params.get("routeId") === firstRouteId ? 123 : 174;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          routeId: params.get("routeId"),
          vehicleClass: params.get("vehicleClass"),
          passengerPrice: fare,
          currency: "USD",
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "فتح مساعد طريق الشام" }).click();
    const dialog = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await dialog.getByRole("button", { name: "كم سعر الرحلة؟" }).click();

    await expect(dialog.getByLabel("اختر المسار")).toHaveValue(firstRouteId);
    await dialog.getByLabel("الركاب").selectOption("2");
    await dialog.getByLabel("الحقائب").selectOption("3");
    await dialog.getByRole("button", { name: "عرض السعر المعتمد" }).click();
    await expect(dialog.getByText(/123|١٢٣/)).toBeVisible();
    expect(new URL(latestQuoteRequest).searchParams.get("passengerCount")).toBe("2");
    expect(new URL(latestQuoteRequest).searchParams.get("luggageCount")).toBe("3");

    await dialog.getByLabel("اختر المسار").selectOption(secondRouteId);
    await expect(dialog.getByText(/123|١٢٣/)).not.toBeVisible();
    await dialog.getByRole("button", { name: "عرض السعر المعتمد" }).click();
    await expect(dialog.getByText(/174|١٧٤/)).toBeVisible();
    expect(new URL(latestQuoteRequest).searchParams.get("routeId")).toBe(secondRouteId);

    const syriaWhatsApp = dialog.getByRole("link", { name: "واتساب سوريا" });
    await expect(syriaWhatsApp).toHaveAttribute("href", /wa\.me\/963965350502\?text=/);
    await expect(syriaWhatsApp).toHaveAttribute("target", "_blank");
    expect(new URL((await syriaWhatsApp.getAttribute("href"))!).searchParams.get("text")).toContain("أسعار الرحلات");
    await expect(dialog.getByRole("link", { name: "واتساب لبنان" })).toHaveAttribute("href", /wa\.me\/96171967194\?text=/);
  });

  test("free-form Arabic questions use AI response without login", async ({ page }) => {
    let requestBody: unknown;
    await page.route("**/api/assistant/chat", async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ answer: "يمكنك مراجعة المسارات من صفحة خدماتنا.", source: "workers-ai" }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "فتح مساعد طريق الشام" }).click();
    const dialog = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await dialog.getByRole("textbox", { name: "اكتب سؤالك" }).fill("إذا وصلت الطائرة متأخرة لمطار بيروت شو أعمل؟");
    await dialog.getByRole("button", { name: "إرسال السؤال" }).click();

    await expect(dialog.getByText("يمكنك مراجعة المسارات من صفحة خدماتنا.")).toBeVisible();
    expect(requestBody).toMatchObject({ message: "إذا وصلت الطائرة متأخرة لمطار بيروت شو أعمل؟" });
  });

  test("assistant is also available on booking page", async ({ page }) => {
    await page.goto("/booking");
    await expect(page.getByRole("button", { name: "فتح مساعد طريق الشام" })).toBeVisible();
  });
});
