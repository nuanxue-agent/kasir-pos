import { test, expect } from '@playwright/test'

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'demo@lakoo.id'
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'demo123'

async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10_000 })
}

test.describe('Inventory', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('inventory page loads', async ({ page }) => {
    await page.goto('/dashboard/inventory')
    await expect(page).toHaveURL(/.*inventory/)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })

  test('can view stock list', async ({ page }) => {
    await page.goto('/dashboard/inventory')
    // Should show table or list with items or empty state
    await expect(
      page.locator('table, [data-testid="inventory-list"], text=stok, text=stock, text=kosong').first()
    ).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Orders', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('orders page loads', async ({ page }) => {
    await page.goto('/dashboard/orders')
    await expect(page).toHaveURL(/.*orders/)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Reports', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('reports page loads', async ({ page }) => {
    await page.goto('/dashboard/reports')
    await expect(page).toHaveURL(/.*reports/)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })

  test('export buttons are present', async ({ page }) => {
    await page.goto('/dashboard/reports')
    // PDF or Excel export button should be visible
    const exportBtn = page.locator('button:has-text("PDF"), button:has-text("Excel"), button:has-text("Export")').first()
    await expect(exportBtn).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Customers', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('customers page loads', async ({ page }) => {
    await page.goto('/dashboard/customers')
    await expect(page).toHaveURL(/.*customers/)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })

  test('can open add customer modal', async ({ page }) => {
    await page.goto('/dashboard/customers')
    const addBtn = page.locator('button:has-text("Tambah"), button:has-text("Add"), button:has-text("+")').first()
    await expect(addBtn).toBeVisible({ timeout: 8_000 })
    await addBtn.click()
    // Modal should appear
    await expect(page.locator('form, [role="dialog"]').first()).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Products', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('products page loads', async ({ page }) => {
    await page.goto('/dashboard/products')
    await expect(page).toHaveURL(/.*products/)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('settings page loads', async ({ page }) => {
    await page.goto('/dashboard/settings')
    await expect(page).toHaveURL(/.*settings/)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })
})
