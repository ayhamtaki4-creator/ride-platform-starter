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
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/assistant/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          welcomeMessage: "أهلًا بك في طريق الشام! كيف يمكنني مساعدتك؟",
          faqs: [{ question: "هل تقدمون مقاعد مشتركة؟", answer: "الحجز الحالي للسيارة الخاصة فقط." }],
        }),
      });
    });
  });

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
    const priceValue = dialog.locator("[class*=quoteResult] strong");
    await expect(priceValue).toHaveText(/123|١٢٣/);
    expect(new URL(latestQuoteRequest).searchParams.get("passengerCount")).toBe("2");
    expect(new URL(latestQuoteRequest).searchParams.get("luggageCount")).toBe("3");

    await dialog.getByLabel("اختر المسار").selectOption(secondRouteId);
    await expect(priceValue).toHaveCount(0);
    await dialog.getByRole("button", { name: "عرض السعر المعتمد" }).click();
    await expect(priceValue).toHaveText(/174|١٧٤/);
    expect(new URL(latestQuoteRequest).searchParams.get("routeId")).toBe(secondRouteId);

    const syriaWhatsApp = dialog.getByRole("link", { name: "واتساب سوريا" });
    await expect(syriaWhatsApp).toHaveAttribute("href", /wa\.me\/963965350502\?text=/);
    await expect(syriaWhatsApp).toHaveAttribute("target", "_blank");
    expect(new URL((await syriaWhatsApp.getAttribute("href"))!).searchParams.get("text")).toContain("أسعار الرحلات");
    await expect(dialog.getByRole("link", { name: "واتساب لبنان" })).toHaveAttribute("href", /wa\.me\/96171967194\?text=/);
  });

  test("quoted trip carries route, vehicle, passengers and bags into a guest booking and re-quotes server side", async ({ page }) => {
    await page.route("**/api/health", async (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route("**/api/route-booking-policies", async (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.route("**/api/routes", async (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures) }));

    const quoteRequests: URLSearchParams[] = [];
    await page.route("**/api/bookings/quote?**", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      quoteRequests.push(params);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          routeId: params.get("routeId"),
          bookingType: "PRIVATE_CAR",
          vehicleClass: params.get("vehicleClass"),
          passengerCount: Number(params.get("passengerCount")),
          luggageCount: Number(params.get("luggageCount")),
          passengerPrice: 136,
          currency: "USD",
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "فتح مساعد طريق الشام" }).click();
    const chat = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await chat.getByRole("button", { name: "كم سعر الرحلة؟" }).click();
    await chat.getByLabel("الركاب").selectOption("2");
    await chat.getByLabel("الحقائب").selectOption("3");
    await chat.getByRole("button", { name: "عرض السعر المعتمد" }).click();

    const cta = chat.getByRole("link", { name: "احجز هذه الرحلة" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /from=assistant/);
    await expect(cta).toHaveAttribute("href", /passengerCount=2/);
    await expect(cta).toHaveAttribute("href", /luggageCount=3/);
    await cta.click();

    await expect(page).toHaveURL(/\/booking\?from=assistant/);
    await expect(page.getByTestId("assistant-booking-prefill")).toContainText("تم نقل اختياراتك");
    const routeCard = page.locator(".route-choice-card.is-selected");
    await expect(routeCard).toContainText("دمشق إلى مطار بيروت");
    await page.getByRole("button", { name: "التالي" }).click();

    await expect(page.locator('[data-vehicle-class="SMALL"]')).toHaveClass(/is-selected/);
    await expect(page.locator('[data-booking-field="passengerCount"] select')).toHaveValue("2");
    await expect(page.locator('[data-booking-field="luggageCount"] select')).toHaveValue("3");

    await page.getByRole("button", { name: "التالي" }).click();
    await page.locator('[data-booking-field="passengerName"] input').fill("محمود أحمد");
    await page.locator('[data-booking-field="passengerPhone"] input').fill("+963944000000");
    await page.getByRole("button", { name: "التالي" }).click();

    await expect(page.locator(".wizard-header h3")).toHaveText("المراجعة");
    await expect(page.locator(".review-grid")).toContainText("عدد الركاب");
    await expect(page.locator(".review-grid")).toContainText("عدد الحقائب");
    await expect(page.locator(".quote-card")).toContainText(/136|١٣٦/);
    expect(quoteRequests.length).toBeGreaterThanOrEqual(2);
    expect(quoteRequests.every((p) => p.get("passengerCount") === "2" &&
      p.get("luggageCount") === "3" && p.get("routeId") === firstRouteId)).toBe(true);
    // Do not submit a real booking; this is a safe end-to-end quote/handoff test.
  });

  test("stale assistant route falls back to a currently bookable route without trusting its price", async ({ page }) => {
    await page.route("**/api/health", async (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route("**/api/route-booking-policies", async (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.route("**/api/routes", async (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures) }));
    await page.goto(`/booking?from=assistant&routeId=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee&vehicleClass=LARGE&passengerCount=8&luggageCount=8&price=1`);
    await expect(page.getByTestId("assistant-booking-prefill")).toContainText("تغيّر توفر المسار");
    await expect(page.locator(".route-choice-card.is-selected")).toContainText("دمشق إلى مطار بيروت");
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.locator('[data-booking-field="passengerCount"] select')).toHaveValue("3");
    await expect(page.locator('[data-booking-field="luggageCount"] select')).toHaveValue("4");
    await expect(page.locator('[data-vehicle-class="SMALL"]')).toHaveClass(/is-selected/);
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


  test("admin can disable chatbot and hide its launch button", async ({ page }) => {
    await page.route("**/api/assistant/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false, welcomeMessage: "خارج الخدمة", faqs: [] }),
      });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "فتح مساعد طريق الشام" })).toHaveCount(0);
  });

  test("custom admin FAQs appear with exact verified answers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "فتح مساعد طريق الشام" }).click();
    const dialog = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await expect(dialog.getByText("أهلًا بك في طريق الشام! كيف يمكنني مساعدتك؟")).toBeVisible();
    await dialog.getByRole("button", { name: "هل تقدمون مقاعد مشتركة؟" }).click();
    await expect(dialog.getByText("الحجز الحالي للسيارة الخاصة فقط.")).toBeVisible();
  });

  test("compact assistant stays inside mobile viewport without page zoom, horizontal overflow, or unwanted keyboard focus", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "فتح مساعد طريق الشام" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 250));

    const before = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scale: window.visualViewport?.scale ?? 1,
    }));
    await page.getByRole("button", { name: "فتح مساعد طريق الشام" }).click();
    const dialog = page.getByRole("dialog", { name: "مساعد طريق الشام" });
    await expect(dialog).toBeVisible();
    const sizes = await page.evaluate(() => {
      const panel = document.getElementById("site-assistant-panel")!;
      const bounds = panel.getBoundingClientRect();
      const input = document.getElementById("site-assistant-message")!;
      return {
        x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom,
        width: bounds.width, height: bounds.height,
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        scale: window.visualViewport?.scale ?? 1,
        scrollY: window.scrollY,
        inputFont: parseFloat(getComputedStyle(input).fontSize),
        autoFocused: document.activeElement === input,
      };
    });

    expect(sizes.width).toBeLessThanOrEqual(320);
    expect(sizes.x).toBeGreaterThanOrEqual(0);
    expect(sizes.right).toBeLessThanOrEqual(320);
    expect(sizes.y).toBeGreaterThanOrEqual(0);
    expect(sizes.bottom).toBeLessThanOrEqual(568);
    expect(sizes.height).toBeGreaterThan(200);
    expect(sizes.documentWidth).toBeLessThanOrEqual(sizes.viewportWidth);
    expect(sizes.inputFont).toBeGreaterThanOrEqual(16);
    expect(sizes.autoFocused).toBe(false);
    expect(sizes.scale).toBeCloseTo(before.scale, 4);
    expect(sizes.scrollY).toBe(before.scrollY);

    await dialog.getByRole("button", { name: "كيف أحجز رحلة؟" }).click();
    await expect(dialog.getByText(/اضغط «ابدأ الحجز»/)).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(before.scrollY);
    await dialog.getByRole("button", { name: "إغلاق المحادثة" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("chat panel remains fully visible on smaller and larger viewports", async ({ page }) => {
    for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await page.getByRole("button", { name: "فتح مساعد طريق الشام" }).click();
      const panel = page.getByRole("dialog", { name: "مساعد طريق الشام" });
      const rect = await panel.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(size.width);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(size.height);
      await panel.getByRole("button", { name: "إغلاق المحادثة" }).click();
    }
  });

  test("assistant is also available on booking page", async ({ page }) => {
    await page.goto("/booking");
    await expect(page.getByRole("button", { name: "فتح مساعد طريق الشام" })).toBeVisible();
  });
});
