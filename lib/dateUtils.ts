export function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

export function buildCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const firstDow = first.getDay()
  const startOffset = firstDow === 0 ? 6 : firstDow - 1
  const days: Date[] = []
  const start = new Date(year, month, 1 - startOffset)
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return days
}

export function toYMD(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export const MONTHS_UK_SHORT = ['СІЧ.', 'ЛЮТ.', 'БЕРЕ.', 'КВІТ.', 'ТРАВ.', 'ЧЕРВ.', 'ЛИП.', 'СЕРП.', 'ВЕРЕ.', 'ЖОВ.', 'ЛИСТ.', 'ГРУД.']
export const MONTHS_UK_FULL = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень']

export function getISOWeek(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

/* ── Дні тижня ──────────────────────────────────────────────────
   ⚠️ ДВІ конвенції індексації, не плутати:
   - SUNDAY-based (0=Нд..6=Сб) = БД `day_of_week`, `series.day_of_week`,
     `activeDow`. Індексувати ТІЛЬКИ значенням з БД.
   - MONDAY-based (0=Пн..6=Нд) = порядок відображення (заголовки сітки
     Пн→Нд, week view). Для JS Date: dowMondayIndex(date).
   Не індексувати MONDAY-масив значенням day_of_week і навпаки. */

// SUNDAY-based: індекс = day_of_week з БД (0=Нд)
export const DOW_LABELS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const
export const DOW_LABELS_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'] as const

// MONDAY-based: порядок відображення (0=Пн..6=Нд)
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const
export const WEEKDAYS_FULL = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'] as const

// JS Date.getDay() (0=Нд) → MONDAY-based індекс (0=Пн..6=Нд)
export function dowMondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}
