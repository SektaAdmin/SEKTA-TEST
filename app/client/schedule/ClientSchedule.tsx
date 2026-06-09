'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listBookableClasses } from '@/lib/queries/client-cabinet-data'
import type { BookableClassRow, ClassAvailability } from '@/lib/queries/client-cabinet-data'
import { clientEnroll } from '@/lib/queries/client-cabinet'
import { useListQuery } from '@/hooks/useListQuery'
import { ticketTypeShortLabel } from '@/lib/badges'
import { typeColor } from '@/lib/typeColor'
import { hhmm } from '@/lib/formatters'
import { DOW_LABELS_FULL, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

// Локальний стан запису: машинні коди client_enroll → людський текст.
const ENROLL_ERROR_LABEL: Record<string, string> = {
  no_sessions: 'Немає оплачених занять цього типу',
  conflict: 'У вас уже є запис на цей час',
  duplicate: 'Ви вже записані на це заняття',
}

// Заголовок дня: «Понеділок, 9 червня». capitalize у CSS робить першу велику.
function dayHeading(d: Date): string {
  return `${DOW_LABELS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_UK_GENITIVE[d.getMonth()]}`
}

function dayKey(startISO: string): string {
  const d = new Date(startISO)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

type EnrolledState = 'enrolled' | 'waitlist'

type Props = {
  fromISO: string
  toISO: string
  typeLabels: Record<string, string>
  /** ticket_type → залишок сесій (для блокування запису без оплати). */
  balanceByType: Record<string, number>
  /** class_id → заповненість (active/waitlist/capacity) для тексту «у резерв». */
  availability: Record<string, ClassAvailability>
  /** class_id → статус активного запису клієнта (вже записаний — без дубля). */
  initialEnrolled: Record<string, EnrolledState>
  initialClasses: BookableClassRow[]
}

// Чи піде запис у резерв: місць немає АБО в черзі вже хтось є (дзеркало логіки
// client_enroll — новий не перестрибує тих, хто чекає). Має лишатися синхронним з RPC.
function goesToWaitlist(a: ClassAvailability | undefined): boolean {
  if (!a) return false
  if (a.waitlist_count > 0) return true
  return a.capacity != null && a.active_count >= a.capacity
}

export default function ClientSchedule({
  fromISO,
  toISO,
  typeLabels,
  balanceByType,
  availability,
  initialEnrolled,
  initialClasses,
}: Props) {
  // Локальні зміни статусу запису (оптимістично після clientEnroll), зливаються
  // з initialEnrolled зі сервера. enrolling — id заняття у процесі запиту.
  const [enrolled, setEnrolled] = useState<Record<string, EnrolledState>>(initialEnrolled)
  const [enrolling, setEnrolling] = useState<string | null>(null)

  const { data: classes } = useListQuery(
    () => listBookableClasses(supabase, fromISO, toISO),
    [fromISO, toISO],
    { refetchOnVisible: true, initialData: initialClasses }
  )

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  // client_enroll НЕ списує сесію одразу (списання — в auto_close), тож БД пропустила
  // б кілька записів на 1 сесію. Щоб клієнт не «записався на 5 занять маючи 1»,
  // вважаємо кожен активний запис у вікні (і початковий, і зроблений зараз) зайнятою
  // сесією і блокуємо кнопку, коли по типу вичерпано. enrolled — єдине джерело правди
  // (оновлюється після успішного clientEnroll). Сервер — остання інстанція.
  const reservedByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of classes) {
      if (enrolled[c.id]) m[c.ticket_type] = (m[c.ticket_type] ?? 0) + 1
    }
    return m
  }, [classes, enrolled])

  // Доступно по типу = куплено − активні записи у вікні.
  const availableByType = (t: string) => (balanceByType[t] ?? 0) - (reservedByType[t] ?? 0)

  // Групування по днях у хронології (classes уже відсортовані запитом).
  const days = useMemo(() => {
    const groups: { key: string; date: Date; items: BookableClassRow[] }[] = []
    let cur: { key: string; date: Date; items: BookableClassRow[] } | null = null
    for (const c of classes) {
      const k = dayKey(c.starts_at)
      if (!cur || cur.key !== k) {
        cur = { key: k, date: new Date(c.starts_at), items: [] }
        groups.push(cur)
      }
      cur.items.push(c)
    }
    return groups
  }, [classes])

  async function handleEnroll(classId: string) {
    setEnrolling(classId)
    const { success, status, error } = await clientEnroll(supabase, classId)
    setEnrolling(null)
    if (!success) {
      const msg = (error && ENROLL_ERROR_LABEL[error]) || 'Не вдалося записатись'
      toast.error(msg)
      // Дубль — клієнт уже в списку; підтягнемо реальний стан із сервера.
      if (error === 'duplicate') setEnrolled(prev => ({ ...prev, [classId]: 'enrolled' }))
      return
    }
    // status — реальний результат ПІСЛЯ тригера capacity: 'waitlist' якщо зал повний,
    // інакше 'enrolled'. Показуємо точний бейдж і тост (без оптимістичного припущення).
    const finalStatus: EnrolledState = status === 'waitlist' ? 'waitlist' : 'enrolled'
    setEnrolled(prev => ({ ...prev, [classId]: finalStatus }))
    if (finalStatus === 'waitlist') toast.info('Вас додано в резерв')
    else toast.success('Ви записані')
  }

  if (days.length === 0) {
    return <p className={styles.empty}>{MSG.empty.bookableClasses}.</p>
  }

  return (
    <>
      {days.map(day => (
        <div key={day.key}>
          <div className={styles.dayHeader}>{dayHeading(day.date)}</div>
          <div className={styles.visitList}>
            {day.items.map(c => {
              const state = enrolled[c.id]
              const hasSessions = availableByType(c.ticket_type) > 0
              const busy = enrolling === c.id
              const toWaitlist = goesToWaitlist(availability[c.id])
              return (
                <div key={c.id} className={styles.visitCardStatic}>
                  <div className={styles.bookTime}>
                    <span className={styles.bookTypeDot} style={{ background: typeColor(c.ticket_type) }} />
                    {hhmm(new Date(c.starts_at))}
                  </div>
                  <div className={styles.visitMeta}>
                    {c.title || typeLabel(c.ticket_type)}
                    {c.trainers?.name ? ` · ${c.trainers.name}` : ''}
                    {c.halls?.name ? ` · ${c.halls.name}` : ''}
                    {` · ${c.duration_min} хв`}
                  </div>

                  {state ? (
                    <span className={`${styles.bookEnrolled} ${state === 'waitlist' ? styles.bookWaitlist : ''}`}>
                      {state === 'waitlist' ? 'Ви в резерві' : 'Ви записані'}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`${styles.bookBtn} ${toWaitlist ? styles.bookBtnWaitlist : ''}`}
                        disabled={!hasSessions || busy}
                        onClick={() => handleEnroll(c.id)}
                      >
                        {busy ? 'Записуємо…' : toWaitlist ? 'Записатись у резерв' : 'Записатись'}
                      </button>
                      {!hasSessions && (
                        <p className={styles.bookHint}>
                          {(balanceByType[c.ticket_type] ?? 0) > 0
                            ? 'Залишок занять цього типу вичерпано записами'
                            : 'Немає оплачених занять цього типу — зверніться до адміністрації'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
