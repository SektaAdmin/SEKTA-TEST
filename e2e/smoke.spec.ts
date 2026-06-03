import { test, expect } from '@playwright/test'

/**
 * Read-only smoke-тести. НЕ створюють/не змінюють дані — лише перевіряють,
 * що сторінки відкриваються залогіненими (не редіректять на /login) і
 * рендеряться без краху. Сесія підставляється через storageState (global-setup).
 */

test('залогінений — /dashboard відкривається, не редіректить на /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)
  // бічна навігація присутня
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible()
})

test('навігація по основних розділах працює', async ({ page }) => {
  await page.goto('/dashboard')
  const nav = page.getByRole('navigation', { name: 'Основна навігація' })

  for (const [label, urlRe] of [
    ['Продажи', /\/sales$/],
    ['Клієнти', /\/clients$/],
    ['Розклад', /\/schedule$/],
    ['Журнал', /\/journal$/],
    ['Звітність', /\/accounting$/],
  ] as const) {
    await nav.getByRole('link', { name: label }).click()
    await expect(page).toHaveURL(urlRe)
  }
})

test('/sales рендерить таблицю або empty-state без помилки', async ({ page }) => {
  await page.goto('/sales')
  await expect(page).toHaveURL(/\/sales$/)
  // або є рядки, або порожній стан — головне не крах
  await expect(
    page.getByText('Продажі').or(page.getByText('Операцій немає'))
  ).toBeVisible()
})

test('неавторизований доступ закритий (sanity)', async ({ browser }) => {
  // окремий контекст БЕЗ storageState — має редіректнути на /login
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
  await ctx.close()
})
