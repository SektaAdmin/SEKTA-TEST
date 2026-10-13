// Відпускні тренера — спільне для /settings/salary/vacation (власник) і /trainer/salary (тренер).
//
// Квартал = 3 місяці від trainers.vacation_start_date (01.05 → 31.07, 01.08 → 31.10, …).
// Робочих днів = календарних днів у кварталі − днів відпустки, що припали на квартал.
// Відпускні   = ЗП за квартал ÷ робочих днів × 7  (7 днів/квартал = 28/рік).
// Усі дати — РРРР-ММ-ДД; арифметика в UTC, щоб DST не з'їдав/додавав добу.

export const VACATION_DAYS_PER_QUARTER = 7

const DAY_MS = 86_400_000

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Кількість днів [from..to] включно. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((ymdToUtc(to) - ymdToUtc(from)) / DAY_MS) + 1
}

/** startDate + n місяців; день місяця обрізається до останнього (31.01 + 1 міс = 28/29.02). */
function addMonths(startDate: string, n: number): string {
  const [y, m, d] = startDate.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
  return utcToYmd(Date.UTC(y, m - 1 + n, Math.min(d, lastDay)))
}

export type VacationQuarter = {
  index: number      // 1, 2, … (номер відпускного кварталу від дати старту)
  start: string
  end: string
  isCurrent: boolean // сьогодні всередині кварталу → сума ще рухома (прогноз)
}

/** Квартали від дати старту до поточного включно, від нових до старих. Майбутні не повертаємо. */
export function buildVacationQuarters(startDate: string, today: string): VacationQuarter[] {
  const result: VacationQuarter[] = []
  for (let i = 0; ; i++) {
    const start = addMonths(startDate, i * 3)
    if (start > today) break
    const end = utcToYmd(ymdToUtc(addMonths(startDate, (i + 1) * 3)) - DAY_MS)
    result.push({ index: i + 1, start, end, isCurrent: today <= end })
  }
  return result.reverse()
}

/** Днів відпустки, що припали на [start..end] (перетин включно; відпустка на межі ділиться). */
export function vacationDaysInRange(
  vacations: { date_from: string; date_to: string }[],
  start: string,
  end: string
): number {
  let total = 0
  for (const v of vacations) {
    const from = v.date_from > start ? v.date_from : start
    const to = v.date_to < end ? v.date_to : end
    if (from <= to) total += daysInclusive(from, to)
  }
  return total
}

/** Відпускні за квартал, ₴ integer (інв. гроші — integer). */
export function calcVacationPay(
  salary: number,
  daysInQuarter: number,
  vacationDays: number
): { workedDays: number; accrued: number } {
  const workedDays = daysInQuarter - vacationDays
  if (workedDays <= 0 || salary <= 0) return { workedDays: Math.max(0, workedDays), accrued: 0 }
  return { workedDays, accrued: Math.round((salary / workedDays) * VACATION_DAYS_PER_QUARTER) }
}

export type VacationQuarterRow = VacationQuarter & {
  days: number
  vacationDays: number
  workedDays: number
  salary: number
  accrued: number
  paid: number
}

/** Збирає рядки кварталів: ЗП (по індексу кварталу) + відпустки + виплати (payment_type='vacation', по period_start). */
export function buildVacationRows(
  quarters: VacationQuarter[],
  salaries: number[],
  vacations: { date_from: string; date_to: string }[],
  payments: { period_start: string; paid_amount: number | string }[]
): VacationQuarterRow[] {
  return quarters.map((q, i) => {
    const days = daysInclusive(q.start, q.end)
    const vacationDays = vacationDaysInRange(vacations, q.start, q.end)
    const salary = salaries[i] ?? 0
    const { workedDays, accrued } = calcVacationPay(salary, days, vacationDays)
    const paid = payments
      .filter(p => p.period_start === q.start)
      .reduce((s, p) => s + Number(p.paid_amount), 0)
    return { ...q, days, vacationDays, workedDays, salary, accrued, paid }
  })
}

/** Відмінювання «день»: 1→день, 2-4→дні, 0/5+/11-14→днів. */
export function pluralDays(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'день'
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'дні'
  return 'днів'
}
