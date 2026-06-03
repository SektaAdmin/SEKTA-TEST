import { test, expect } from '@playwright/test'

/**
 * Read-only smoke для SalesDateRangePicker на /sales.
 * Лише UI-взаємодія (відкрити попап, тицьнути пресет/день, Застосувати) —
 * фільтр діапазону живе в клієнтському стані, у БД нічого не пишеться.
 */

// «сьогодні» у форматах, які рендерить пікер
function today() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    display: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`, // ymdToDisplay → ДД.ММ.РРРР
    dayAria: d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }), // «3 червня 2026 р.»
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/sales')
  await expect(page).toHaveURL(/\/sales$/)
})

test('дефолтний лейбл «Будь-який період», попап відкривається', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Будь-який період' })
  await expect(trigger).toBeVisible()

  await trigger.click()
  await expect(page.getByRole('dialog', { name: 'Вибір діапазону дат' })).toBeVisible()
})

test('пресет «Сьогодні» застосовується миттєво і закриває попап', async ({ page }) => {
  await page.getByRole('button', { name: 'Будь-який період' }).click()
  const dialog = page.getByRole('dialog', { name: 'Вибір діапазону дат' })

  await dialog.getByRole('button', { name: 'Сьогодні', exact: true }).click()

  // пресет одразу закриває попап (handlePreset → setOpen(false)), без «Застосувати»
  await expect(dialog).toBeHidden()
  // лейбл тригера більше не дефолтний
  await expect(page.getByRole('button', { name: 'Будь-який період' })).toHaveCount(0)
})

test('ручний вибір дня заповнює інпут; Застосувати закриває попап', async ({ page }) => {
  const { display, dayAria } = today()
  await page.getByRole('button', { name: 'Будь-який період' }).click()
  const dialog = page.getByRole('dialog', { name: 'Вибір діапазону дат' })

  // лівий календар стартує з поточного місяця → сьогоднішній день видимий
  await dialog.getByRole('button', { name: dayAria }).first().click()
  // перший клік = початок діапазону → інпут «Дата початку» заповнено
  await expect(dialog.getByLabel('Дата початку')).toHaveValue(display)

  await dialog.getByRole('button', { name: 'Застосувати' }).click()
  await expect(dialog).toBeHidden()
})

test('Escape закриває попап без застосування', async ({ page }) => {
  await page.getByRole('button', { name: 'Будь-який період' }).click()
  const dialog = page.getByRole('dialog', { name: 'Вибір діапазону дат' })
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // нічого не застосовано — лейбл лишився дефолтним
  await expect(page.getByRole('button', { name: 'Будь-який період' })).toBeVisible()
})
