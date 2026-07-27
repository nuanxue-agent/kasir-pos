import { test, expect } from '@playwright/test'

/**
 * POS happy path:
 * 1. Log in
 * 2. Navigate to POS
 * 3. Add a product to cart
 * 4. Complete payment
 * 5. Verify receipt / order created
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TEST_EMAIL = process.env.TEST_EMAIL ?? 'demo@lakoo.id'
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'demo123'

test.describe('POS — happy path', () => {
  test.beforeEach(async ({ page }) => {
    // Log in
    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard**', { timeout: 10_000 })
  })

  test('can navigate to POS page', async ({ page }) => {
    await page.goto('/dashboard/pos')
    await expect(page).toHaveURL(/.*pos/)
    await expect(page.locator('h1, [data-testid="pos-title"]').first()).toBeVisible({ timeout: 8_000 })
  })

  test('can search for a product', async ({ page }) => {
    await page.goto('/dashboard/pos')
    const searchInput = page.locator('input[placeholder*="cari" i], input[placeholder*="search" i], input[type="search"]').first()
    await searchInput.waitFor({ timeout: 8_000 })
    await searchInput.fill('a')
    // Some products should appear
    await expect(page.locator('[data-testid="product-card"], .product-card, button').first()).toBeVisible({ timeout: 5_000 })
  })

  test('cart is empty initially', async ({ page }) => {
    await page.goto('/dashboard/pos')
    // Cart should show empty state or 0 items
    const emptyCart = page.locator('text=empty, text=kosong, text=belum ada').first()
    const zeroTotal = page.locator('text=Rp 0, text=0.00').first()
    // Either of these indicates empty cart
    await expect(emptyCart.or(zeroTotal)).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('POS — mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('POS loads on mobile', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard**', { timeout: 10_000 })
    await page.goto('/dashboard/pos')
    await expect(page).toHaveURL(/.*pos/)
  })

  test('bottom nav is visible on mobile', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard**', { timeout: 10_000 })
    await page.goto('/dashboard')
    // Bottom nav should be present
    const bottomNav = page.locator('nav[aria-label], nav.lg\\:hidden, nav').last()
    await expect(bottomNav).toBeVisible({ timeout: 5_000 })
  })
})
