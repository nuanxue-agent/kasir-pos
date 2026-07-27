import { test, expect } from '@playwright/test'

// ── Auth flow tests ───────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows login form', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /masuk/i })).toBeVisible()
  })

  test('shows Lakoo branding', async ({ page }) => {
    await expect(page.getByText('Lakoo')).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.getByRole('textbox', { name: /email/i }).fill('wrong@test.com')
    await page.getByRole('textbox', { name: /password/i }).fill('wrongpassword')
    await page.getByRole('button', { name: /masuk/i }).click()
    await expect(page.getByText(/invalid|salah|tidak valid/i)).toBeVisible({ timeout: 5000 })
  })

  test('shows validation error for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /masuk/i }).click()
    // HTML5 required validation or our custom error
    const emailInput = page.getByRole('textbox', { name: /email/i })
    await expect(emailInput).toBeFocused()
  })

  test('has link to signup', async ({ page }) => {
    await expect(page.getByRole('link', { name: /daftar/i })).toBeVisible()
  })
})

test.describe('Signup page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup')
  })

  test('shows signup form with all fields', async ({ page }) => {
    await expect(page.getByLabel(/nama usaha/i)).toBeVisible()
    await expect(page.getByLabel(/nama kamu/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })

  test('has link back to login', async ({ page }) => {
    await expect(page.getByRole('link', { name: /masuk/i })).toBeVisible()
  })

  test('shows validation errors for empty submit', async ({ page }) => {
    await page.getByRole('button', { name: /buat akun/i }).click()
    // Should show required field errors
    const errors = page.locator('p.text-red-500, [role="alert"]')
    await expect(errors.first()).toBeVisible({ timeout: 3000 })
  })
})
