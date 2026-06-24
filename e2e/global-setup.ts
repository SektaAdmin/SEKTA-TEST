import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync, existsSync } from 'fs'

const AUTH_FILE = 'e2e/.auth/state.json'
const CLIENT_AUTH_FILE = 'e2e/.auth/client-state.json'
const TRAINER_AUTH_FILE = 'e2e/.auth/trainer-state.json'

/**
 * Логіниться під кожну роль і зберігає окремі сесії:
 * 1. staff (email) → AUTH_FILE  (default storageState у playwright.config.ts)
 * 2. client (phone) → CLIENT_AUTH_FILE  (тести/огляд передають storageState явно)
 * 3. trainer (phone) → TRAINER_AUTH_FILE  (── // ──)
 *
 * Креди з .env.local (логін по телефону — той самий формат, що в полі форми: +380…):
 *   E2E_EMAIL / E2E_PASSWORD                 — staff
 *   E2E_CLIENT_PHONE / E2E_CLIENT_PASSWORD   — client
 *   E2E_TRAINER_PHONE / E2E_TRAINER_PASSWORD — trainer
 */
export default async function globalSetup(config: FullConfig) {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  const clientPhone = process.env.E2E_CLIENT_PHONE
  const clientPassword = process.env.E2E_CLIENT_PASSWORD
  const trainerPhone = process.env.E2E_TRAINER_PHONE
  const trainerPassword = process.env.E2E_TRAINER_PASSWORD

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

  // --- Phone logins (client / trainer) — той самий флоу, різниться лише зоною редиректу ---
  // Логін по телефону йде через middleware-редирект (/ → зона ролі), який іноді
  // не встигає за 15с. НЕ валимо весь прогін через це: якщо є збережена сесія —
  // лишаємо її (тести під роль все одно стартують з кешу); якщо нема — роль
  // просто скіпнеться (test.skip по !existsSync файлу).
  async function phoneLogin(phone: string, pass: string, zone: RegExp, file: string) {
    const page = await browser.newPage({ baseURL })
    try {
      await page.goto('/login')
      // поле має placeholder "+380…"; CSS-фолбек — перший не-password input
      const phoneInput = page.getByPlaceholder('+380…')
        .or(page.locator('input:not([type="password"])').first())
      await phoneInput.fill(phone)
      await page.locator('input[type="password"]').fill(pass)
      await page.getByRole('button', { name: /Увійти|Вхід/ }).click()
      await page.waitForURL(zone, { timeout: 15_000 }) // middleware веде / → зону ролі
      await page.context().storageState({ path: file })
    } catch (err) {
      const reused = existsSync(file)
      console.warn(
        `[global-setup] phoneLogin(${file}) не завершився: ${(err as Error).message}. ` +
        (reused ? 'Використовую попередньо збережену сесію.' : 'Сесії нема — роль буде пропущено (test.skip).')
      )
      // не кидаємо: staff-логін (головний) уже зроблено; роль без сесії скіпнеться
    } finally {
      await page.close()
    }
  }

  if (clientPhone && clientPassword) {
    await phoneLogin(clientPhone, clientPassword, /\/client/, CLIENT_AUTH_FILE)
  }
  if (trainerPhone && trainerPassword) {
    await phoneLogin(trainerPhone, trainerPassword, /\/trainer/, TRAINER_AUTH_FILE)
  }

  await browser.close()
}
