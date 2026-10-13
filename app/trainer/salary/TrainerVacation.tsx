'use client'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import {
  getTrainerVacationStartDate,
  listTrainerVacations,
  listVacationPayments,
  getTrainerSalaryByQuarters,
} from '@/lib/queries/trainer-vacations'
import { buildVacationQuarters, buildVacationRows, daysInclusive, pluralDays, VACATION_DAYS_PER_QUARTER } from '@/lib/vacation'
import { formatMoney } from '@/lib/formatters'
import { toYMD, ymdToDisplay } from '@/lib/dateUtils'
import styles from './salary.module.css'

// Відпускні тренера (read-only). Не залежить від обраного періоду «Моєї зарплати» —
// завжди квартали від trainers.vacation_start_date. Не налаштовано → блок не показуємо.
export default function TrainerVacation({ trainerId }: { trainerId: string }) {
  const { data } = useAsync(async () => {
    const [start, vacs, pays] = await Promise.all([
      getTrainerVacationStartDate(supabase, trainerId),
      listTrainerVacations(supabase, trainerId),
      listVacationPayments(supabase, trainerId),
    ])
    const quarters = start.data ? buildVacationQuarters(start.data, toYMD(new Date())) : []
    const sal = await getTrainerSalaryByQuarters(supabase, trainerId, quarters)
    return {
      data: {
        vacations: vacs.data,
        rows: buildVacationRows(quarters, sal.data, vacs.data, pays.data),
      },
      error: start.error ?? vacs.error ?? pays.error ?? sal.error,
    }
  }, [trainerId], { refetchOnVisible: true })

  if (!data || data.rows.length === 0) return null

  const [current, ...past] = data.rows
  const period = (a: string, b: string) => `${ymdToDisplay(a)} – ${ymdToDisplay(b)}`

  return (
    <section className={styles.section} aria-label="Відпускні">
      <h2 className="section-title">Відпускні</h2>

      <div className={styles.summaryGrid}>
        <div className={`${styles.summaryCard} ${styles.summaryCardWide}`}>
          <span className={styles.summaryLabel}>
            {current.isCurrent ? 'Поточний квартал' : 'Останній квартал'} · {period(current.start, current.end)}
          </span>
          <span className={styles.summaryValue}>{formatMoney(current.accrued)}</span>
          <span className={styles.summaryHint}>
            ЗП {formatMoney(current.salary)} · {current.workedDays} роб. {pluralDays(current.workedDays)}
            {current.vacationDays > 0 && ` · відпустка ${current.vacationDays} ${pluralDays(current.vacationDays)}`}
            {current.isCurrent && ' · сума зростає до кінця кварталу'}
          </span>
        </div>
      </div>
      <p className={styles.formula}>
        Відпускні = ЗП за квартал ÷ робочих днів × {VACATION_DAYS_PER_QUARTER}
      </p>

      {past.length > 0 && (
        <div className={styles.paymentList}>
          {past.map(q => (
            <div key={q.start} className={styles.paymentRow}>
              <div className={styles.paymentInfo}>
                <span className={styles.paymentDate}>{period(q.start, q.end)}</span>
                <span className={styles.paymentPeriod}>
                  {q.paid > 0 ? `виплачено ${formatMoney(q.paid)}` : 'ще не виплачено'}
                  {q.vacationDays > 0 && ` · відпустка ${q.vacationDays} ${pluralDays(q.vacationDays)}`}
                </span>
              </div>
              <span className={styles.paymentAmt}>{formatMoney(q.accrued)}</span>
            </div>
          ))}
        </div>
      )}

      {data.vacations.length > 0 && (
        <div className={styles.paymentList}>
          {data.vacations.map(v => {
            const days = daysInclusive(v.date_from, v.date_to)
            return (
              <div key={v.id} className={styles.paymentRow}>
                <div className={styles.paymentInfo}>
                  <span className={styles.paymentDate}>Відпустка {period(v.date_from, v.date_to)}</span>
                  {v.notes && <span className={styles.paymentPeriod}>{v.notes}</span>}
                </div>
                <span className={styles.paymentAmt}>{days} {pluralDays(days)}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
