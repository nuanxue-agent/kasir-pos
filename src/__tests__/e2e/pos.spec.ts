import { test, expect } from '@playwright/test'

/**
 * POS E2E tests
 * These tests require a running dev server at http://localhost:3000
 * They are skipped automatically when the server is not available.
 */

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'demo@lakoo.id'
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'demo123'

let serverAvailable = false

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get('http://localhost:3000/', { timeout: 3000 })
    serverAvailable = res.ok() || res.status() === 307 || res.status() === 302
  } catch {
    serverAvailable = false
  }
})

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

test.describe('POS page', () => {
  test('navigate to /dashboard/pos', async ({ page }) => {
    test.skip(!serverAvailable, 'Dev server not running')
    await login(page)
    await page.goto('/dashboard/pos')
    await expect(page).toHaveURL(/.*pos/)
    await expect(page.locator('h1, [data-testid="pos-title"]').first()).toBeVisible({
      timeout: 8000,
    })
  })

  test('search for a product', async ({ page }) => {
    test.skip(!serverAvailable, 'Dev server not running')
    await login(page)
    await page.goto('/dashboard/pos')
    const searchInput = page
      .locator(
        'input[placeholder*="cari" i], input[placeholder*="search" i], input[type="search"]'
      )
      .first()
    await searchInput.waitFor({ timeout: 8000 })
    await searchInput.fill('a')
    // Products or no-results feedback should be visible
    const result = page.locator(
      '[data-testid="product-card"], .product-card, [data-testid="no-results"], text=/tidak ditemukan/i'
    )
    await expect(result.first()).toBeVisible({ timeout: 6000 })
  })

  test('add product to cart', async ({ page }) => {
    test.skip(!serverAvailable, 'Dev server not running')
    await login(page)
    await page.goto('/dashboard/pos')
    // Wait for products to load
    const productBtn = page
      .locator('[data-testid="product-card"] button, .product-card button, button[data-product]')
      .first()
    await productBtn.waitFor({ timeout: 8000 })
    await productBtn.click()
    // Cart should now have at least one item — check for a quantity indicator or non-zero total
    const cartItem = page.locator(
      '[data-testid="cart-item"], .cart-item, text=/Rp [1-9]/i'
    )
    await expect(cartItem.first()).toBeVisible({ timeout: 5000 })
  })
})
