import { expect, test } from "@playwright/test";

// Assumes `make up && make migrate && make seed` — demo@acme.test / DemoPass123!
test("sign in and land on the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@acme.test");
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
});

test("unauthenticated user is redirected from the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
