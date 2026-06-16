import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'fs'

const AUTH_FILE = 'e2e/.auth/state.json'
const CLIENT_AUTH_FILE = 'e2e/.auth/client-state.json'

/**
 * Логіниться двічі і зберігає окремі сесії:
 * 1. staff (email) → AUTH_FILE  (default storageState у playwright.config.ts)
 * 2. client (phone) → CLIENT_AUTH_FILE  (використовують тести, що явно передають storageState)
 *
 * Креди з .env.local:
 *   E2E_EMAIL / E2E_PASSWORD           — staff
 *   E2E_CLIENT_PHONE / E2E_CLIENT_PASSWORD — client (+380…)
 */
export default async function globalSetup(config: FullConfig) {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  const clientPhone = process.env.E2E_CLIENT_PHONE
  const clientPassword = process.env.E2E_CLIENT_PASSWORD

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL / E2E_PASSWORD не задані. Додай тестового юзера в .env.local:\n' +
      '  E2E_EMAIL=...\n  E2E_PASSWORD=...'
    )
  }

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000'
  mkdirSync('e2e/.auth', { recursive: true })

  const browser = await chromium.launch()

  // --- Staff login ---
  {
    const page = await browser.newPage({ baseURL })
    await page.goto('/login')
    await page.locator('input').first().fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: /Увійти|Вхід/ }).click()
    await page.waitForURL('**/{dashboard,sales,client}', { timeout: 15_000 })
    await page.context().storageState({ path: AUTH_FILE })
    await page.close()
  }

  // --- Client login (optional) ---
  if (clientPhone && clientPassword) {
    const page = await browser.newPage({ baseURL })
    await page.goto('/login')
    // phone field has placeholder "+380…" — use CSS selector as fallback
    const phoneInput = page.getByPlaceholder('+380…')
      .or(page.locator('input:not([type="password"])').first())
    await phoneInput.fill(clientPhone)
    await page.locator('input[type="password"]').fill(clientPassword)
    await page.getByRole('button', { name: /Увійти|Вхід/ }).click()
    // middleware redirects / → /client (possibly /client/... variants)
    await page.waitForURL(/\/client/, { timeout: 15_000 })
    await page.context().storageState({ path: CLIENT_AUTH_FILE })
    await page.close()
  }

  await browser.close()
}
