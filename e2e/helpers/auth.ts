import {
  APIRequestContext,
  expect,
  Page,
} from "@playwright/test";
import {
  accounts,
  apiBaseURL,
  TestRole,
} from "./accounts";

export async function loginAs(
  page: Page,
  role: TestRole,
): Promise<void> {
  const account = accounts[role];

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);

  await Promise.all([
    page.waitForURL(
      (url) => url.pathname === account.home,
      { timeout: 20_000 },
    ),
    page
      .getByRole("button", { name: /^تسجيل الدخول/ })
      .click(),
  ]);

  await expect(page).toHaveURL(
    new RegExp(`${escapeRegExp(account.home)}(?:\\?.*)?$`),
  );
}

export async function apiLogin(
  request: APIRequestContext,
  role: TestRole,
): Promise<string> {
  const account = accounts[role];
  const response = await request.post(
    `${apiBaseURL}/auth/login`,
    {
      data: {
        email: account.email,
        password: account.password,
      },
    },
  );

  expect(
    response.ok(),
    `API login failed for ${role}: ${response.status()}`,
  ).toBeTruthy();

  const body = (await response.json()) as {
    accessToken?: string;
  };

  expect(body.accessToken).toBeTruthy();
  return body.accessToken as string;
}

export function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
