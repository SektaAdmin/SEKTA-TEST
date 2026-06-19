import { test, expect, type Page } from '@playwright/test'

/**
 * Огляд через браузер: проходить ключові екрани кожної ролі (owner / trainer / client)
 * під відповідною сесією і робить скріншоти в e2e/.review/<role>/.
 *
 * Це НЕ регресійні assertions — це «погляд» на живий додаток (як дивиться impeccable):
 * dev-сервер піднімається сам (webServer у playwright.config.ts), сторінки реально
 * рендеряться з prod-Supabase, скрін зберігається для перегляду очима.
 *
 * Запуск:  npm run review:browser
 * Звіт:    скріншоти в e2e/.review/  (gitignored)
 *
 * Креди ролей — у .env.local (див. e2e/README.md). Якщо trainer/client-кредів немає,
 * відповідний блок просто пропускається (skip), а не падає.
 */

const STAFF_STATE = 'e2e/.auth/state.json'
const CLIENT_STATE = 'e2e/.auth/client-state.json'
const TRAINER_STATE = 'e2e/.auth/trainer-state.json'

const hasTrainer = !!process.env.E2E_TRAINER_PHONE
const hasClient = !!process.env.E2E_CLIENT_PHONE

/** Перейти, дочекатись мережевого спокою і зняти повний скрін під назвою екрана. */
async function shoot(page: Page, role: string, path: string, name: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle').catch(() => {})
  // дати dom-аніміціям/скелетонам осісти
  await page.waitForTimeout(500)
  await expect(page.locator('body')).toBeVisible()
  await page.screenshot({
    path: `e2e/.review/${role}/${name}.png`,
    fullPage: true,
  })
}

// ── Адмінка (owner/admin) ──────────────────────────────────────────────
test.describe('review · admin', () => {
  test.use({ storageState: STAFF_STATE })

  const SCREENS: [string, string][] = [
    ['/dashboard', '01-dashboard'],
    ['/sales', '02-sales'],
    ['/clients', '03-clients'],
    ['/schedule', '04-schedule'],
    ['/schedule/templates', '05-templates'],
    ['/journal', '06-journal'],
    ['/accounting', '07-accounting'],
    ['/settings/salary/rates', '08-salary-rates'],
    ['/settings/salary/calculations', '09-salary-calc'],
    ['/settings/trainers', '10-settings-trainers'],
    ['/settings/tickets', '11-settings-tickets'],
  ]

  for (const [path, name] of SCREENS) {
    test(name, async ({ page }) => {
      await shoot(page, 'admin', path, name)
    })
  }
})

// ── Кабінет тренера ────────────────────────────────────────────────────
test.describe('review · trainer', () => {
  test.skip(!hasTrainer, 'E2E_TRAINER_PHONE не заданий у .env.local')
  test.use({ storageState: TRAINER_STATE })

  const SCREENS: [string, string][] = [
    ['/trainer', '01-home'],
    ['/trainer/schedule', '02-schedule'],
    ['/trainer/my', '03-my-classes'],
  ]

  for (const [path, name] of SCREENS) {
    test(name, async ({ page }) => {
      await shoot(page, 'trainer', path, name)
    })
  }
})

// ── Кабінет клієнта ────────────────────────────────────────────────────
test.describe('review · client', () => {
  test.skip(!hasClient, 'E2E_CLIENT_PHONE не заданий у .env.local')
  test.use({ storageState: CLIENT_STATE })

  const SCREENS: [string, string][] = [
    ['/client', '01-home'],
    ['/client/schedule', '02-schedule'],
    ['/client/visits', '03-visits'],
    ['/client/subscriptions', '04-subscriptions'],
  ]

  for (const [path, name] of SCREENS) {
    test(name, async ({ page }) => {
      await shoot(page, 'client', path, name)
    })
  }
})
