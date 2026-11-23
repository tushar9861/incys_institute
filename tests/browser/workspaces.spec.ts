import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function signIn(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${role}@demo.incys.local`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-demo-only-change-me");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**/portal/${role}`);
  await expect(
    page.getByRole("heading", { name: /Welcome/, level: 1 }),
  ).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  expect(
    (await (await request.get("/api/v1/config")).json()).demo,
    "These browser tests require a local synthetic-data environment",
  ).toBe(true);
});

for (const role of [
  "patient",
  "student",
  "trainer",
  "admin",
  "clinician",
  "vendor",
  "reception",
  "finance",
]) {
  test(`${role} can sign in and open each authorized view`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signIn(page, role);
    const navigation = page.locator("aside nav");
    for (const name of await navigation.getByRole("button").allTextContents()) {
      await navigation.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test("student navigation and support fit a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page
    .locator("aside nav")
    .getByRole("button", { name: "Support", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Authorized documents" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("student can attach an uploaded file and the assigned trainer can download it", async ({
  page,
  browser,
}) => {
  await signIn(page, "student");
  await page
    .locator("aside nav")
    .getByRole("button", { name: "Support", exact: true })
    .click();
  const filename = `reflection-${Date.now()}.pdf`;
  const bytes = Buffer.from(
    "%PDF-1.4\nSynthetic browser acceptance attachment",
  );
  await page
    .getByLabel("Document purpose")
    .selectOption("assignment_attachment");
  await page.getByLabel("Select a document").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Download ${filename}`, exact: true }),
  ).toBeVisible();
  await page
    .locator("aside nav")
    .getByRole("button", { name: "My learning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open course", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Submit work|Update submission/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Your response")
    .fill("Synthetic browser acceptance response with a private attachment.");
  await dialog.getByLabel(/^Attachment/).selectOption({ label: filename });
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Download ${filename}`, exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const trainer = await context.newPage();
    await signIn(trainer, "trainer");
    await trainer
      .locator("aside nav")
      .getByRole("button", { name: "Academic workspace", exact: true })
      .click();
    const response = trainer.locator("details").filter({
      hasText:
        "Synthetic browser acceptance response with a private attachment.",
    });
    await response.locator("summary").click();
    const downloadEvent = trainer.waitForEvent("download");
    await trainer
      .getByRole("button", { name: `Download ${filename}`, exact: true })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(filename);
    expect(await readFile((await download.path())!)).toEqual(bytes);
  } finally {
    await context.close();
  }
});
