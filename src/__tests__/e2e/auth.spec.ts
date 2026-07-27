import { test, expect } from '@playwright/test'

/**
 * Auth E2E tests
 * These tests require a running dev server at http://localhost:3000
 * They are skipped automatically when the server is not available.
 */

let serverAvailable = false

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get('http://localhost:3000/', { timeout: 3000 })
    serverAvailable = res.ok() || res.status() === 307 || res.status() === 302
  } catch {
    serverAvailable = false
  }
})

test.describe('Auth flows', () => {
  test('navigate to / redirects to /login', async ({ page }) => {
    test.skip(!serverAvailable, 'Dev server not running')
    await page.goto('/')
    await page.waitForURL(/\/login/, { timeout: 8000 })
    expect(page.url()).toContain('/login')
  })

  test('login with demo credentials redirects to /dashboard', async ({ page }) => {
    test.skip(!serverAvailable, 'Dev server not running')
    await page.goto('/login')
    await page.fill('input[type="email"]', 'demo@lakoo.id')
    await page.fill('input[type="password"]', 'demo123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    expect(page.url()).toContain('/dashboard')
  })

  test('invalid login shows error message', async ({ page }) => {
    test.skip(!serverAvailable, 'Dev server not running')
    await page.goto('/login')
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    const error = page.locator(
      '[role="alert"], p.text-red-500, .text-destructive, text=/invalid|salah|tidak valid/i'
    )
    await expect(error.first()).toBeVisible({ timeout: 6000 })
  })
})
