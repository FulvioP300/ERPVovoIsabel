import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD!;

// Categoria de fixture seedada (idempotente) por global-setup.ts — mesma constante lá.
const CATEGORY_NAME = "Categoria E2E";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

function fieldset(page: Page, legend: string): Locator {
  return page.locator("fieldset", { hasText: legend }).first();
}

async function createMinimalProduct(page: Page, nome: string) {
  await page.goto("/products/new");
  await fieldset(page, "Identificação").locator('input[type="text"]').first().fill(nome);
  await fieldset(page, "Classificação").locator("select").selectOption({ label: CATEGORY_NAME });
  await fieldset(page, "Condição").locator("select").selectOption("novo");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/products");
}

// T025 — spec 005-produtos-cadastro-manual, tasks.md
test("admin edita nome e preço de uma peça e a mudança aparece na listagem", async ({ page }) => {
  await loginAsAdmin(page);

  const nomeOriginal = `E2E Peça Edição ${Date.now()}`;
  await createMinimalProduct(page, nomeOriginal);

  const row = page.locator("tr", { hasText: nomeOriginal });
  await expect(row).toBeVisible();
  await row.getByText("Editar").click();
  await page.waitForURL(/\/products\/[a-f0-9]+$/);

  const nomeEditado = `${nomeOriginal} (editado)`;
  await fieldset(page, "Identificação").locator('input[type="text"]').first().fill(nomeEditado);
  await fieldset(page, "Preço").locator('input[type="number"]').nth(2).fill("149.90");
  await page.click('button[type="submit"]');

  await page.waitForURL("**/products");
  const editedRow = page.locator("tr", { hasText: nomeEditado });
  await expect(editedRow).toBeVisible();
  await expect(editedRow).toContainText("149,90");
});
