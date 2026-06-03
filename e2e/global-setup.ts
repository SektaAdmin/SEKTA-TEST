import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'fs'

const AUTH_FILE = 'e2e/.auth/state.json'

/**
 * Логіниться один раз через UI (/login) і зберігає сесію (cookies @supabase/ssr)
 * у AUTH_FILE. Усі тести потім стартують залогіненими через storageState.
 *
 * Креди беруться з .env.local: E2E_EMAIL / E2E_PASSWORD (НЕ комітяться).
 */
export default async function globalSetup(config: FullConfig) {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL / E2E_PASSWORD не задані. Додай тестового юзера в .env.local:\n' +
      '  E2E_EMAIL=...\n  E2E_PASSWORD=...'
    )
  }

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000'
  mkdirSync('e2e/.auth', { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })

  await page.goto('/login')
  await page.getByPlaceholder('admin@sekta.com').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /Увійти|Вхід/ }).click()

  // Логін редіректить на /sales — чекаємо, щоб впевнитись що сесія встановилась
  await page.waitForURL('**/sales', { timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
  await browser.close()
}
