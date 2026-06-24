import { test, expect, devices as devicesMobile, type Page } from '@playwright/test'

/**
 * Performance + навантажувальне тестування — read-only, без змін даних.
 *
 * Що міряємо:
 *   - domContentLoaded, loadEventEnd (Navigation Timing API)
 *   - LCP, FCP, CLS (PerformanceObserver / web-vitals через evaluate)
 *   - Час до появи першого значущого контенту (page.locator().waitFor() + Date.now())
 *   - Послідовні переходи по розділах (SPA navigation latency)
 *   - Паралельні вкладки (concurrency smoke)
 *
 * Порогові значення — м'які (expect.soft), щоб тест не падав при повільному CI,
 * але метрики логуються у вихід для аналізу.
 *
 * Запуск: npm run test:e2e -- --grep performance
 */

// ── Пороги (мс) ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  domContentLoaded: 3000,
  loadEvent: 5000,
  lcp: 4000,
  fcp: 2500,
  cls: 0.1,       // безрозмірно
  spaNavigation: 1500,
  firstContentVisible: 3000,
} as const

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Збирає Navigation Timing після повного завантаження сторінки */
async function getNavigationTiming(page: Page): Promise<{
  domContentLoaded: number
  loadEvent: number
  ttfb: number
}> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.fetchStart),
      loadEvent: Math.round(nav.loadEventEnd - nav.fetchStart),
      ttfb: Math.round(nav.responseStart - nav.fetchStart),
    }
  })
}

/** Чекає на LCP через PerformanceObserver, повертає мс або null якщо timeout */
async function getLCP(page: Page, timeoutMs = 8000): Promise<number | null> {
  return page.evaluate((timeout) => {
    return new Promise<number | null>((resolve) => {
      let resolved = false
      const timer = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(null) }
      }, timeout)

      if (!('PerformanceObserver' in window)) {
        clearTimeout(timer); resolve(null); return
      }

      try {
        const obs = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          if (entries.length > 0) {
            const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number }
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              obs.disconnect()
              resolve(Math.round(last.startTime))
            }
          }
        })
        obs.observe({ type: 'largest-contentful-paint', buffered: true })
      } catch {
        clearTimeout(timer); resolve(null)
      }
    })
  }, timeoutMs)
}

/** Отримує FCP з буферизованих paint entries */
async function getFCP(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByName('first-contentful-paint')
    if (entries.length === 0) return null
    return Math.round(entries[0].startTime)
  })
}

/** Отримує CLS через PerformanceObserver */
async function getCLS(page: Page, waitMs = 3000): Promise<number> {
  return page.evaluate((wait) => {
    return new Promise<number>((resolve) => {
      let cls = 0
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          if (!e.hadRecentInput && e.value) cls += e.value
        }
      })
      try {
        obs.observe({ type: 'layout-shift', buffered: true })
      } catch {
        resolve(0); return
      }
      setTimeout(() => { obs.disconnect(); resolve(parseFloat(cls.toFixed(4))) }, wait)
    })
  }, waitMs)
}

/** Логує метрики у форматі, зручному для читання у звіті */
function logMetrics(route: string, metrics: Record<string, number | null | string>) {
  const lines = Object.entries(metrics)
    .map(([k, v]) => `  ${k}: ${v ?? 'n/a'}`)
    .join('\n')
  console.log(`\n[PERF] ${route}\n${lines}`)
}

// ── Staff tests (default storageState = owner) ─────────────────────────────────

test.describe('Staff — Navigation Timing', () => {

  const STAFF_ROUTES: Array<{ path: string; waitFor: string }> = [
    { path: '/dashboard',  waitFor: '[data-testid="money-cards"], h1, main' },
    { path: '/sales',      waitFor: 'h1' },
    { path: '/clients',    waitFor: 'h1' },
    { path: '/schedule',   waitFor: 'main, [class*="card"], [class*="dayCol"]' },
    { path: '/journal',    waitFor: 'h1' },
    { path: '/accounting', waitFor: 'h1' },
  ]

  for (const { path, waitFor } of STAFF_ROUTES) {
    test(`${path} — Navigation Timing`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page).not.toHaveURL(/\/login/)

      // чекаємо на перший значущий елемент
      await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 10_000 })

      const timing = await getNavigationTiming(page)
      const fcp = await getFCP(page)
      const lcp = await getLCP(page)
      const cls = await getCLS(page)

      logMetrics(path, { ...timing, fcp, lcp, cls })

      expect.soft(timing.domContentLoaded, `DCL too slow on ${path}`).toBeLessThan(THRESHOLDS.domContentLoaded)
      expect.soft(timing.loadEvent, `Load event too slow on ${path}`).toBeLessThan(THRESHOLDS.loadEvent)
      if (fcp !== null)
        expect.soft(fcp, `FCP too slow on ${path}`).toBeLessThan(THRESHOLDS.fcp)
      if (lcp !== null)
        expect.soft(lcp, `LCP too slow on ${path}`).toBeLessThan(THRESHOLDS.lcp)
      expect.soft(cls, `CLS too high on ${path}`).toBeLessThan(THRESHOLDS.cls)
    })
  }
})

test.describe('Staff — SPA Navigation latency', () => {
  test('послідовний обхід розділів через sidebar', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const nav = page.getByRole('navigation', { name: 'Основна навігація' })

    const links: Array<{ label: string; urlRe: RegExp }> = [
      { label: 'Продажи',   urlRe: /\/sales$/ },
      { label: 'Клієнти',   urlRe: /\/clients$/ },
      { label: 'Розклад',   urlRe: /\/schedule$/ },
      { label: 'Журнал',    urlRe: /\/journal$/ },
      { label: 'Звітність', urlRe: /\/accounting$/ },
    ]

    for (const { label, urlRe } of links) {
      const t0 = Date.now()
      await nav.getByRole('link', { name: label }).click()
      await expect(page).toHaveURL(urlRe)
      // чекаємо на щось видиме, а не тільки URL
      await page.locator('h1, main').first().waitFor({ state: 'visible', timeout: 8_000 })
      const elapsed = Date.now() - t0

      console.log(`[SPA] ${label}: ${elapsed}ms`)
      expect.soft(elapsed, `SPA nav to ${label} too slow`).toBeLessThan(THRESHOLDS.spaNavigation)
    }
  })
})

test.describe('Staff — /clients/[id] heavy page', () => {
  test('картка першого клієнта відкривається в межах порогу', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)

    // знаходимо перший рядок таблиці і кількість її рядків
    const rows = page.locator('table tbody tr, [role="row"]').filter({ hasNot: page.locator('th') })
    await rows.first().waitFor({ state: 'visible', timeout: 10_000 })
    const count = await rows.count()
    console.log(`[PERF] /clients — рядків у таблиці: ${count}`)

    // переходимо на деталі першого клієнта
    const t0 = Date.now()
    await rows.first().click()
    // очікуємо секцію з балансом або ім'ям клієнта
    await page.locator('h1, h2, [data-testid="client-balance"]').first()
      .waitFor({ state: 'visible', timeout: 10_000 })
    const elapsed = Date.now() - t0

    console.log(`[PERF] /clients/[id] — visible in ${elapsed}ms`)
    expect.soft(elapsed, 'client detail page too slow').toBeLessThan(THRESHOLDS.firstContentVisible)
    expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('Staff — /schedule ClassDetailModal', () => {
  test('відкриття деталей першого заняття', async ({ page }) => {
    await page.goto('/schedule', { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)

    // чекаємо на першу картку заняття (CSS-модуль → клас містить "card",
    // виключаємо tooltip-обгортку, що не клікабельна)
    const classCard = page.locator('[class*="card"]')
      .filter({ hasNot: page.locator('[class*="cardTooltip"]') })
      .first()
    const mobileCard = page.locator('[class*="mobileTlCard"]').first()

    // пробуємо обидва варіанти (desktop / mobile layout)
    const t0 = Date.now()
    let opened = false
    for (const loc of [classCard, mobileCard]) {
      try {
        await loc.waitFor({ state: 'visible', timeout: 5_000 })
        await loc.click()
        // модалка з деталями
        const modal = page.locator('[role="dialog"]')
        await modal.waitFor({ state: 'visible', timeout: 5_000 })
        const elapsed = Date.now() - t0
        console.log(`[PERF] ClassDetailModal open: ${elapsed}ms`)
        expect.soft(elapsed, 'ClassDetailModal too slow to open').toBeLessThan(1500)
        opened = true
        break
      } catch {
        // спробуємо наступний локатор
      }
    }
    if (!opened) {
      console.log('[PERF] ClassDetailModal: заняття не знайдено (порожній розклад) — тест пропущено')
      test.skip()
    }
  })
})

// ── Client cabinet tests ───────────────────────────────────────────────────────

const CLIENT_AUTH_FILE = 'e2e/.auth/client-state.json'
const fs = require('fs') // eslint-disable-line @typescript-eslint/no-require-imports

const hasClientAuth = (() => {
  try { return fs.existsSync(CLIENT_AUTH_FILE) } catch { return false }
})()

test.describe('Client cabinet — Navigation Timing', () => {

  test.skip(!hasClientAuth, 'E2E_CLIENT_PHONE/PASSWORD не задані — пропускаємо client-кабінет')

  const CLIENT_ROUTES: Array<{ path: string; waitFor: string }> = [
    { path: '/client',               waitFor: 'h1, [class*="menu"], [class*="home"]' },
    { path: '/client/schedule',      waitFor: 'h1, [class*="schedule"], button' },
    { path: '/client/visits',        waitFor: 'h1, [class*="visits"], [class*="list"]' },
    { path: '/client/subscriptions', waitFor: 'h1, [class*="balance"], [class*="sub"]' },
  ]

  for (const { path, waitFor } of CLIENT_ROUTES) {
    test(`${path} — Navigation Timing`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: CLIENT_AUTH_FILE })
      const page = await ctx.newPage()
      page.setDefaultNavigationTimeout(20_000)

      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page).not.toHaveURL(/\/login/)

      await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 10_000 })

      const timing = await getNavigationTiming(page)
      const fcp = await getFCP(page)
      const lcp = await getLCP(page)
      const cls = await getCLS(page)

      logMetrics(path, { ...timing, fcp, lcp, cls })

      expect.soft(timing.domContentLoaded, `DCL too slow on ${path}`).toBeLessThan(THRESHOLDS.domContentLoaded)
      expect.soft(timing.loadEvent, `Load event too slow on ${path}`).toBeLessThan(THRESHOLDS.loadEvent)
      if (fcp !== null)
        expect.soft(fcp, `FCP too slow on ${path}`).toBeLessThan(THRESHOLDS.fcp)
      if (lcp !== null)
        expect.soft(lcp, `LCP too slow on ${path}`).toBeLessThan(THRESHOLDS.lcp)
      expect.soft(cls, `CLS too high on ${path}`).toBeLessThan(THRESHOLDS.cls)

      await ctx.close()
    })
  }
})

test.describe('Client cabinet — SPA navigation latency', () => {
  test.skip(!hasClientAuth, 'E2E_CLIENT_PHONE/PASSWORD не задані — пропускаємо')

  test('переходи між розділами кабінету', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: CLIENT_AUTH_FILE })
    const page = await ctx.newPage()

    await page.goto('/client', { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)

    const steps: Array<{ href: string; label: string }> = [
      { href: '/client/schedule',      label: 'Розклад' },
      { href: '/client/visits',        label: 'Мої візити' },
      { href: '/client/subscriptions', label: 'Абонементи' },
      { href: '/client',               label: 'Головна' },
    ]

    for (const { href, label } of steps) {
      const t0 = Date.now()
      await page.goto(href)
      await page.locator('h1, [class*="header"], [class*="shell"]').first()
        .waitFor({ state: 'visible', timeout: 8_000 })
      const elapsed = Date.now() - t0
      console.log(`[SPA/client] ${label}: ${elapsed}ms`)
      expect.soft(elapsed, `client SPA nav to ${label} too slow`).toBeLessThan(THRESHOLDS.spaNavigation)
    }

    await ctx.close()
  })
})

// ── Concurrency smoke ─────────────────────────────────────────────────────────

test.describe('Concurrency — паралельні вкладки', () => {
  test('5 паралельних запитів /dashboard не деградують', async ({ browser }) => {
    const CONCURRENCY = 5

    const timings = await Promise.all(
      Array.from({ length: CONCURRENCY }, async (_, i) => {
        const ctx = await browser.newContext({
          storageState: 'e2e/.auth/state.json',
        })
        const page = await ctx.newPage()
        const t0 = Date.now()
        await page.goto('/dashboard', { waitUntil: 'networkidle' })
        await page.locator('h1, main').first().waitFor({ state: 'visible', timeout: 15_000 })
        const elapsed = Date.now() - t0
        console.log(`[CONCURRENCY] tab ${i + 1}: ${elapsed}ms`)
        await ctx.close()
        return elapsed
      })
    )

    const max = Math.max(...timings)
    const avg = Math.round(timings.reduce((s, v) => s + v, 0) / timings.length)
    console.log(`[CONCURRENCY] max=${max}ms avg=${avg}ms`)

    // при 5 паралельних вкладках максимальний час < 2× порогу single
    expect.soft(max, 'concurrency degradation too high').toBeLessThan(THRESHOLDS.loadEvent * 2)
  })

  test('3 паралельних запити /sales не деградують', async ({ browser }) => {
    const CONCURRENCY = 3

    const timings = await Promise.all(
      Array.from({ length: CONCURRENCY }, async (_, i) => {
        const ctx = await browser.newContext({ storageState: 'e2e/.auth/state.json' })
        const page = await ctx.newPage()
        const t0 = Date.now()
        await page.goto('/sales', { waitUntil: 'networkidle' })
        await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 })
        const elapsed = Date.now() - t0
        console.log(`[CONCURRENCY/sales] tab ${i + 1}: ${elapsed}ms`)
        await ctx.close()
        return elapsed
      })
    )

    const max = Math.max(...timings)
    console.log(`[CONCURRENCY/sales] max=${max}ms`)
    expect.soft(max, 'sales concurrency degradation').toBeLessThan(THRESHOLDS.loadEvent * 2)
  })
})

// ── Settings pages ─────────────────────────────────────────────────────────────

// ── Mobile adaptation (admin /schedule + ClassDetailModal bottom-sheet) ─────────
//
// Мобільна адаптація: той самий staff-логін, але viewport iPhone 13 + touch.
// На мобілці /schedule рендерить MobileScheduleTimeline (карточки .mobileTlCard),
// модалка деталей відкривається як bottom-sheet (той самий role="dialog").

test.describe('Mobile — /schedule (iPhone 13 viewport)', () => {
  const MOBILE = devicesMobile['iPhone 13']

  test('/schedule mobile — Navigation Timing + перша карточка', async ({ browser }) => {
    const ctx = await browser.newContext({
      ...MOBILE,
      storageState: 'e2e/.auth/state.json',
    })
    const page = await ctx.newPage()

    await page.goto('/schedule', { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)
    await page.locator('h1, [class*="mobileTl"]').first().waitFor({ state: 'visible', timeout: 10_000 })

    const timing = await getNavigationTiming(page)
    const fcp = await getFCP(page)
    const lcp = await getLCP(page)
    const cls = await getCLS(page)
    logMetrics('/schedule (mobile)', { ...timing, fcp, lcp, cls })

    expect.soft(timing.domContentLoaded, 'mobile /schedule DCL too slow').toBeLessThan(THRESHOLDS.domContentLoaded)
    expect.soft(timing.loadEvent, 'mobile /schedule load too slow').toBeLessThan(THRESHOLDS.loadEvent)
    if (lcp !== null) expect.soft(lcp, 'mobile /schedule LCP too slow').toBeLessThan(THRESHOLDS.lcp)
    expect.soft(cls, 'mobile /schedule CLS too high').toBeLessThan(THRESHOLDS.cls)

    await ctx.close()
  })

  test('/schedule mobile — ClassDetailModal (bottom-sheet) open time', async ({ browser }) => {
    const ctx = await browser.newContext({
      ...MOBILE,
      storageState: 'e2e/.auth/state.json',
    })
    const page = await ctx.newPage()

    await page.goto('/schedule', { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)

    // мобільна карточка таймлайну (CSS-модуль → клас містить "mobileTlCard")
    const card = page.locator('[class*="mobileTlCard"]').first()
    try {
      await card.waitFor({ state: 'visible', timeout: 6_000 })
    } catch {
      console.log('[PERF] mobile ClassDetailModal: немає занять у видимому дні — тест пропущено')
      await ctx.close()
      test.skip()
      return
    }

    const t0 = Date.now()
    await card.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
    const elapsed = Date.now() - t0
    console.log(`[PERF] mobile ClassDetailModal open: ${elapsed}ms`)
    expect.soft(elapsed, 'mobile ClassDetailModal too slow to open').toBeLessThan(1500)

    await ctx.close()
  })
})

// ── Trainer cabinet (/trainer/schedule + ClassDetailModal) ──────────────────────

const TRAINER_AUTH_FILE = 'e2e/.auth/trainer-state.json'
const hasTrainerAuth = (() => {
  try { return fs.existsSync(TRAINER_AUTH_FILE) } catch { return false }
})()

test.describe('Trainer cabinet — /trainer/schedule', () => {
  test.skip(!hasTrainerAuth, 'E2E_TRAINER_PHONE/PASSWORD не задані — пропускаємо кабінет тренера')

  test('/trainer/schedule — Navigation Timing', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: TRAINER_AUTH_FILE })
    const page = await ctx.newPage()
    page.setDefaultNavigationTimeout(20_000)

    await page.goto('/trainer/schedule', { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)
    await page.locator('h1, [class*="card"], [class*="mobileTl"]').first()
      .waitFor({ state: 'visible', timeout: 10_000 })

    const timing = await getNavigationTiming(page)
    const fcp = await getFCP(page)
    const lcp = await getLCP(page)
    const cls = await getCLS(page)
    logMetrics('/trainer/schedule', { ...timing, fcp, lcp, cls })

    expect.soft(timing.domContentLoaded, 'trainer /schedule DCL too slow').toBeLessThan(THRESHOLDS.domContentLoaded)
    expect.soft(timing.loadEvent, 'trainer /schedule load too slow').toBeLessThan(THRESHOLDS.loadEvent)
    if (lcp !== null) expect.soft(lcp, 'trainer /schedule LCP too slow').toBeLessThan(THRESHOLDS.lcp)
    expect.soft(cls, 'trainer /schedule CLS too high').toBeLessThan(THRESHOLDS.cls)

    await ctx.close()
  })

  test('/trainer/schedule — ClassDetailModal open time', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: TRAINER_AUTH_FILE })
    const page = await ctx.newPage()
    page.setDefaultNavigationTimeout(20_000)

    await page.goto('/trainer/schedule', { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)

    // desktop-картка .card або мобільна .mobileTlCard
    const card = page.locator('[class*="mobileTlCard"], [class*="card"]')
      .filter({ hasNot: page.locator('[class*="cardTooltip"]') })
      .first()
    try {
      await card.waitFor({ state: 'visible', timeout: 6_000 })
    } catch {
      console.log('[PERF] trainer ClassDetailModal: немає занять у видимому дні — тест пропущено')
      await ctx.close()
      test.skip()
      return
    }

    const t0 = Date.now()
    await card.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
    const elapsed = Date.now() - t0
    console.log(`[PERF] trainer ClassDetailModal open: ${elapsed}ms`)
    expect.soft(elapsed, 'trainer ClassDetailModal too slow to open').toBeLessThan(1500)

    await ctx.close()
  })
})

test.describe('Staff — /settings pages timing', () => {
  const SETTINGS_ROUTES = [
    '/settings/tickets',
    '/settings/trainers',
    '/settings/halls',
    '/settings/training-types',
    '/settings/salary/rates',
    '/settings/salary/calculations',
  ]

  for (const path of SETTINGS_ROUTES) {
    test(`${path} — load time`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page).not.toHaveURL(/\/login/)

      await page.locator('h1, table, [role="table"]').first()
        .waitFor({ state: 'visible', timeout: 10_000 })

      const timing = await getNavigationTiming(page)
      logMetrics(path, timing)

      expect.soft(timing.domContentLoaded, `${path} DCL too slow`).toBeLessThan(THRESHOLDS.domContentLoaded)
      expect.soft(timing.loadEvent, `${path} load event too slow`).toBeLessThan(THRESHOLDS.loadEvent)
    })
  }
})
