import { test, expect, type Page } from "@playwright/test";
async function signIn(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${role}@demo.incys.local`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-demo-only-change-me");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**/portal/${role}`);
}
async function api(page: Page, path: string, method = "GET", body?: any) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch(`/api/v1/${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      return { status: r.status, data };
    },
    { path, method, body },
  );
}
test.beforeAll(async ({ request }) => {
  expect((await (await request.get("/api/v1/config")).json()).demo).toBe(true);
});
test("institute receives multi-item stock, records supplier payment and exports account entries", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/portal/admin?tab=shopdesk&shopView=inventory");
  const name = `Browser stock ${Date.now()}`;
  await page.getByRole("button", { name: "New product", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Supplier", exact: true })
    .selectOption({ label: "INCYS Demo Wellness Store" });
  await dialog.getByLabel("Product name").fill(name);
  await dialog.getByLabel("Category", { exact: true }).fill("Browser testing");
  await dialog.getByLabel("Selling price").fill("399");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Synthetic stock for browser acceptance testing.");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row.getByText("approved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Supplies", exact: true }).click();
  await page
    .getByRole("button", { name: "Receive stock", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Supplier", exact: true })
    .selectOption({ label: "INCYS Demo Wellness Store" });
  const reference = `BROWSER-${Date.now()}`;
  await dialog
    .getByLabel("Supplier invoice / receipt reference")
    .fill(reference);
  await dialog
    .getByRole("combobox", { name: "Product 1", exact: true })
    .selectOption({ label: name });
  await dialog.getByLabel("Units", { exact: true }).fill("5");
  await dialog.getByLabel("Unit cost").fill("300");
  await dialog.getByRole("button", { name: "Add item", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Product 2", exact: true })
    .selectOption({ label: "Practice journal" });
  await dialog.getByLabel("Units", { exact: true }).nth(1).fill("2");
  await dialog.getByLabel("Unit cost").nth(1).fill("100");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Receive stock", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stock", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByText("5 PCS"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount paid").fill("50");
  await dialog
    .getByLabel("Bank / cash receipt reference")
    .fill(`PAY-${reference}`);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(`PAY-${reference}`, { exact: true }).first(),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export entries" }).click();
  expect((await download).suggestedFilename()).toBe(
    "incys-supplier-statement.csv",
  );
});
test("paid retail order issues a permanent commercial invoice with blank GSTIN and customer-only access", async ({
  page,
  browser,
}) => {
  await signIn(page, "admin");
  const ws = (await api(page, "shop/workspace")).data;
  expect(
    (
      await api(page, "shop/settings", "PATCH", {
        legalName: "Institute for Nature Cure & Yogic Sciences",
        address: "Synthetic testing address only",
        stateCode: "21",
        gstin: "",
        registration: "non_gst",
        einvoice: "not_applicable",
        signatory: "Synthetic authorised signer",
      })
    ).status,
  ).toBe(200);
  const product = (
    await api(page, "products", "POST", {
      vendorId: ws.vendors[0].id,
      name: `Invoice item ${Date.now()}`,
      category: "Test",
      description: "Synthetic invoice product",
      pricePaise: 10000,
      stock: 3,
      regulated: false,
    })
  ).data;
  expect(
    (await api(page, `products/${product.id}`, "PATCH", { status: "approved" }))
      .status,
  ).toBe(200);
  const context = await browser.newContext(),
    customer = await context.newPage();
  await signIn(customer, "patient");
  const order = (
    await api(customer, "orders", "POST", {
      items: [{ productId: product.id, quantity: 1 }],
      address: {
        name: "Synthetic customer",
        phone: "9999999999",
        line: "Synthetic test address",
        city: "Balasore",
        postcode: "756001",
        stateCode: "21",
      },
      idempotencyKey: crypto.randomUUID(),
    })
  ).data;
  const payment = (
    await api(customer, "payments", "POST", {
      referenceType: "order",
      referenceId: order.id,
    })
  ).data;
  expect(
    (await api(customer, "payments/demo", "POST", { paymentId: payment.id }))
      .status,
  ).toBe(200);
  await page.goto("/portal/admin?tab=shopdesk&shopView=orders");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText(product.name, { exact: true }) });
  await row.getByRole("button", { name: "Issue invoice" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Issue invoice", exact: true })
    .click();
  const invoice = page.getByRole("dialog", { name: "Invoice", exact: true });
  await expect(invoice).toBeVisible();
  await expect(
    invoice.getByText("GSTIN: ________________________", { exact: true }),
  ).toBeVisible();
  await expect(
    invoice.getByText("Commercial invoice. No GST collected."),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(
    invoice.getByRole("button", { name: "Print / Save PDF" }),
  ).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await invoice.getByRole("button", { name: "Close invoice" }).click();
  await customer.goto("/portal/patient?tab=orders");
  await customer
    .getByRole("row")
    .filter({ hasText: order.id.slice(0, 8).toUpperCase() })
    .getByRole("button", { name: "Invoice", exact: true })
    .click();
  await expect(
    customer.getByRole("dialog", { name: "Invoice", exact: true }),
  ).toBeVisible();
  await context.close();
  expect(
    (
      await api(page, "shop/settings", "PATCH", {
        legalName: "Institute for Nature Cure & Yogic Sciences",
        address: "",
        stateCode: "",
        gstin: "",
        registration: "pending",
        einvoice: "unknown",
        signatory: "",
      })
    ).status,
  ).toBe(200);
});
test("supplier has five relevant bottom tabs, reduced motion and no overflow on phone or desktop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "vendor");
  const nav = page.getByRole("navigation", { name: "Supplier navigation" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Home", "Stock", "Sales", "Accounts"]) {
      await nav.getByRole("link", { name, exact: true }).click();
      await expect(page.locator(".shop-console")).toBeVisible();
      await expect(page.locator(".shop-console")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".emblem-main").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await nav.getByRole("link", { name: "Stock", exact: true }).click();
  await page.waitForURL("**/portal/vendor?tab=inventory");
  await page.reload();
  await expect(
    nav.getByRole("link", { name: "Stock", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
