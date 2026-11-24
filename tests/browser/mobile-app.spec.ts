import { test, expect, type Page } from "@playwright/test";
const emptyCatalog = {
  services: [],
  practitioners: [],
  availability: [],
  courses: [],
  cohorts: [],
  products: [],
  announcements: [],
};
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("patient@demo.incys.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-demo-only-change-me");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Welcome/ }),
  ).toBeVisible();
}
for (const width of [320, 390, 768, 1440]) {
  test(`five destinations work without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/v1/catalog", (route) =>
      route.fulfill({ json: emptyCatalog }),
    );
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    for (const label of ["Care", "Learn", "Shop", "Account", "Home"]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
test("empty catalogue enquiry validates consent, submits once and restores focus", async ({
  page,
}) => {
  await page.route("**/api/v1/catalog", (route) =>
    route.fulfill({ json: emptyCatalog }),
  );
  let calls = 0;
  await page.route("**/api/v1/enquiries", async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toMatchObject({
      name: "Synthetic enquiry",
      email: "qa@example.invalid",
      interest: "Care & appointments",
      consent: true,
    });
    await route.fulfill({ status: 201, json: { received: true } });
  });
  await page.goto("/care");
  const trigger = page.getByRole("button", { name: "Contact the team" });
  await trigger.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Your name").fill("Synthetic enquiry");
  await sheet.getByLabel("Email address").fill("qa@example.invalid");
  await sheet
    .getByLabel("How can we help?")
    .fill("Please send care availability.");
  await sheet.getByRole("button", { name: "Send enquiry" }).click();
  expect(calls).toBe(0);
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Send enquiry" }).click();
  await expect(
    sheet.getByRole("heading", { name: "You’re on our list." }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(calls).toBe(1);
});
test("catalogue failure recovers and search has a clear empty state", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/v1/catalog", (route) =>
    failed
      ? route.fulfill({ status: 503, body: "temporarily unavailable" })
      : route.fulfill({
          json: {
            ...emptyCatalog,
            services: [
              {
                id: "care-1",
                name: "Wellness consultation",
                description: "Meet the care team.",
                category: "Consultation",
                price_paise: 50000,
                duration_minutes: 30,
              },
            ],
          },
        }),
  );
  await page.goto("/care");
  await expect(
    page.getByRole("heading", { name: "Let’s try that again." }),
  ).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Wellness consultation" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search care" }).fill("no-match");
  await expect(
    page.getByRole("heading", { name: "No matches yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Wellness consultation" }),
  ).toBeVisible();
});
test("signed-in bottom navigation survives reload and browser Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Learn", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "My learning" }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Account" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Account" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: "My learning" }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: /Documents & support/ }).click();
  await expect(
    page.getByRole("heading", { name: "Authorized documents" }),
  ).toBeVisible();
});
test("booking only offers matching practitioner times and recovers from a conflict", async ({
  page,
}) => {
  const start = new Date(Date.now() + 86400000);
  start.setUTCHours(4, 30, 0, 0);
  const end = new Date(start.getTime() + 3600000);
  await page.route("**/api/v1/catalog", (route) =>
    route.fulfill({
      json: {
        ...emptyCatalog,
        services: [
          {
            id: "service",
            name: "Test consultation",
            duration_minutes: 30,
            price_paise: 50000,
          },
        ],
        practitioners: [
          {
            id: "practitioner",
            name: "Test practitioner",
            service_ids: ["service"],
          },
          {
            id: "other",
            name: "Unrelated practitioner",
            service_ids: ["different"],
          },
        ],
        availability: [
          {
            practitioner_id: "practitioner",
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
          },
        ],
      },
    }),
  );
  let bookings = 0;
  await page.route("**/api/v1/appointments", (route) => {
    bookings++;
    expect(route.request().postDataJSON()).toMatchObject({
      serviceId: "service",
      practitionerId: "practitioner",
      consent: true,
      mode: "in_person",
    });
    return route.fulfill({ status: 409, json: { error: "Time conflict" } });
  });
  await signIn(page);
  await page.getByRole("button", { name: "Book care", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByLabel("Practitioner").getByRole("option"),
  ).toHaveCount(1);
  const slots = sheet.locator(".time-grid button");
  await expect(slots).toHaveCount(2);
  await slots.first().click();
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Confirm booking" }).click();
  await expect(sheet.getByRole("alert")).toContainText("no longer available");
  await expect(slots).toHaveCount(1);
  await expect(
    sheet.getByRole("button", { name: "Confirm booking" }),
  ).toBeDisabled();
  expect(bookings).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});
test("reduced motion keeps breathing artwork still while the pause control works", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Start breathing exercise" }).click();
  await expect(
    page.getByRole("heading", { name: "Breathe in gently" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause breathing exercise" }).click();
  await expect(
    page.getByRole("heading", { name: "A moment for yourself" }),
  ).toBeVisible();
});
test("install manifest and offline worker never cache private responses", async ({
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).status()).toBe(200);
  const worker = await (await request.get("/sw.js")).text();
  expect(worker).toContain('cache.add("/offline.html")');
  expect(worker).not.toContain("cache.put(");
  expect((await request.get("/.well-known/assetlinks.json")).status()).toBe(
    200,
  );
});
