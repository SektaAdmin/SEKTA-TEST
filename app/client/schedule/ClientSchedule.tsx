'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listBookableClasses, listMySessionBalances } from '@/lib/queries/client-cabinet-data'
import type { BookableClassRow, ClassAvailability } from '@/lib/queries/client-cabinet-data'
import { clientEnroll } from '@/lib/queries/client-cabinet'
import { useListQuery } from '@/hooks/useListQuery'
import { useAsync } from '@/hooks/useAsync'
import { ticketTypeShortLabel, enrollmentStatusLabel } from '@/lib/badges'
import { typeColor } from '@/lib/typeColor'
import { hhmm, fullWhen, pluralHours } from '@/lib/formatters'
import { DOW_LABELS_FULL, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { goesToWaitlist } from '@/lib/scheduleMetrics'
import { kyivParts } from '@/lib/cancellation'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

// Локальний стан запису: машинні коди client_enroll → людський текст.
const ENROLL_ERROR_LABEL: Record<string, string> = {
  no_sessions: 'Немає оплачених занять цього типу',
  conflict: 'У вас уже є запис на цей час',
  duplicate: 'Ви вже записані на це заняття',
}

// Заголовок дня: «Понеділок, 9 червня». capitalize у CSS робить першу велику.
// Обчислює день тижня у київському часовому поясі (не UTC браузера).
function dayHeading(startISO: string): string {
  const k = kyivParts(new Date(startISO))
  // Створюємо UTC дату для полудня дня в Київі, щоб отримати правильний день тижня.
  // (День тижня залежить від того, як UTC дата розподіляється по днях у різних часових поясах.)
  const utcDate = new Date(Date.UTC(k.year, k.month - 1, k.day, 12, 0, 0))
  const dowIndex = utcDate.getUTCDay()
  return `${DOW_LABELS_FULL[dowIndex]}, ${k.day} ${MONTHS_UK_GENITIVE[k.month - 1]}`
}

function dayKey(startISO: string): string {
  const k = kyivParts(new Date(startISO))
  return `${k.year}-${k.month}-${k.day}`
}

// Скільки сесій спише auto_close за self-запис: двогодинне (>=120 хв) → 2
// (client_enroll проставляє hours_attended=[1,2]), годинне → 1. Дзеркало БД.
function sessionCost(durationMin: number): number {
  return durationMin >= 120 ? 2 : 1
}

type EnrolledState = 'enrolled' | 'waitlist'

type Props = {
  clientId: string
  fromISO: string
  toISO: string
  typeLabels: Record<string, string>
  /** ticket_type → залишок сесій (server-prefetch; живе значення — useAsync нижче). */
  initialBalanceByType: Record<string, number>
  /** class_id → заповненість (active/waitlist/capacity) для тексту «у резерв». */
  availability: Record<string, ClassAvailability>
  /** class_id → статус активного запису клієнта (вже записаний — без дубля). */
  initialEnrolled: Record<string, EnrolledState>
  initialClasses: BookableClassRow[]
}



export default function ClientSchedule({
  clientId,
  fromISO,
  toISO,
  typeLabels,
  initialBalanceByType,
  availability,
  initialEnrolled,
  initialClasses,
}: Props) {
  // Локальні зміни статусу запису (оптимістично після clientEnroll), зливаються
  // з initialEnrolled зі сервера. enrolling — id заняття у процесі запиту.
  const [enrolled, setEnrolled] = useState<Record<string, EnrolledState>>(initialEnrolled)
  const [enrolling, setEnrolling] = useState<string | null>(null)
  // Заняття, для якого відкрита модалка підтвердження (деталі + етап хореографії).
  const [confirm, setConfirm] = useState<BookableClassRow | null>(null)

  const { data: liveBalance } = useAsync(
    async () => {
      const { data, error } = await listMySessionBalances(supabase, clientId)
      if (error) return { data: initialBalanceByType, error }
      return {
        data: Object.fromEntries(data.map(b => [b.ticket_type, b.sessions_balance])) as Record<string, number>,
        error: null,
      }
    },
    [clientId],
    { refetchOnVisible: true, initialData: initialBalanceByType }
  )
  const balanceByType = liveBalance ?? initialBalanceByType

  const { data: classes, error: classesError } = useListQuery(
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
      if (enrolled[c.id]) m[c.ticket_type] = (m[c.ticket_type] ?? 0) + sessionCost(c.duration_min)
    }
    return m
  }, [classes, enrolled])

  // Доступно по типу = куплено − активні записи у вікні.
  const availableByType = (t: string) => (balanceByType[t] ?? 0) - (reservedByType[t] ?? 0)

  // Групування по днях у хронології (classes уже відсортовані запитом).
  const days = useMemo(() => {
    const groups: { key: string; startsAtISO: string; items: BookableClassRow[] }[] = []
    let cur: { key: string; startsAtISO: string; items: BookableClassRow[] } | null = null
    for (const c of classes) {
      const k = dayKey(c.starts_at)
      if (!cur || cur.key !== k) {
        cur = { key: k, startsAtISO: c.starts_at, items: [] }
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
      setConfirm(null)
      return
    }
    // status — реальний результат ПІСЛЯ тригера capacity: 'waitlist' якщо зал повний,
    // інакше 'enrolled'. Показуємо точний бейдж і тост (без оптимістичного припущення).
    const finalStatus: EnrolledState = status === 'waitlist' ? 'waitlist' : 'enrolled'
    setEnrolled(prev => ({ ...prev, [classId]: finalStatus }))
    if (finalStatus === 'waitlist') toast.info(enrollmentStatusLabel('waitlist'))
    else toast.success(enrollmentStatusLabel('enrolled'))
    setConfirm(null)
  }

  if (classesError) {
    return (
      <p className="badge-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>
        Помилка завантаження. Спробуйте оновити сторінку.
      </p>
    )
  }

  if (days.length === 0) {
    return <p className={styles.empty}>{MSG.empty.bookableClasses}.</p>
  }

  return (
    <>
      {days.map(day => (
        <div key={day.key}>
          <div className={styles.dayHeader}>{dayHeading(day.startsAtISO)}</div>
          <div className={styles.visitList}>
            {day.items.map(c => {
              const state = enrolled[c.id]
              // Вистачає сесій на повну вартість заняття (2h → 2). Сервер — остання
              // інстанція, але оптимістично не даємо записатись у мінус по типу.
              const hasSessions = availableByType(c.ticket_type) >= sessionCost(c.duration_min)
              const busy = enrolling === c.id
              const av = availability[c.id]
              const toWaitlist = goesToWaitlist(av)
              return (
                <div key={c.id} className={styles.visitCardStatic}>
                  {/* Головне (велике): час + тренер. Другорядне (мале сіре): тип/зал/тривалість. */}
                  <div className={styles.bookHead}>
                    <span className={styles.bookTime}>{hhmm(new Date(c.starts_at))}</span>
                    {c.trainers?.name && <span className={styles.bookTrainer}>{c.trainers.name}</span>}
                  </div>
                  {c.choreo_stage && (
                    <div className={styles.bookStage}>{c.choreo_stage}</div>
                  )}
                  <div className={styles.bookSub}>
                    {c.title || typeLabel(c.ticket_type)}
                    {c.halls?.name ? ` · ${c.halls.name}` : ''}
                    {` · ${c.duration_min} хв`}
                    {av?.capacity != null
                      ? ` · ${
                          av.capacity - Math.min(av.active_count, av.capacity) > 0
                            ? `Вільно: ${av.capacity - Math.min(av.active_count, av.capacity)}`
                            : 'Немає місць'
                        }${av.waitlist_count > 0 ? ` · у резерві ${av.waitlist_count}` : ''}`
                      : ''}
                  </div>

                  {state ? (
                    <span className={`${styles.bookEnrolled} ${state === 'waitlist' ? styles.bookWaitlist : ''}`}>
                      {enrollmentStatusLabel(state)}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`${styles.bookBtn} ${toWaitlist ? styles.bookBtnWaitlist : ''}`}
                        disabled={!hasSessions || busy}
                        onClick={() => setConfirm(c)}
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

      {confirm && (() => {
        const toWaitlist = goesToWaitlist(availability[confirm.id])
        const cost = sessionCost(confirm.duration_min)
        // «Залишок стане» = реальний баланс сесій (client_session_balances) − cost.
        // НЕ availableByType (там віднято інші майбутні записи вікна) — списання за
        // кожен запис іде окремо в auto_close, тож «було N → стане N−1» від балансу.
        const after = (balanceByType[confirm.ticket_type] ?? 0) - cost
        const busy = enrolling === confirm.id
        return (
          <ModalShell
            title={toWaitlist ? 'Записатись у резерв?' : 'Підтвердити запис?'}
            onClose={() => !busy && setConfirm(null)}
            footer={
              <ModalFooter
                onCancel={() => setConfirm(null)}
                onSave={() => handleEnroll(confirm.id)}
                saveLabel={toWaitlist ? 'У резерв' : 'Записатись'}
                cancelLabel="Назад"
                loading={busy}
              />
            }
          >
            {/* Шапка — найважливіше для клієнта великим: назва + час + тренер. */}
            <div className={styles.confirmHero}>
              <div className={styles.confirmHeroName}>{confirm.title || typeLabel(confirm.ticket_type)}</div>
              <div className={styles.confirmHeroWhen}>{fullWhen(confirm.starts_at, confirm.duration_min)}</div>
              {confirm.trainers?.name && (
                <div className={styles.confirmHeroTrainer}>Тренер: {confirm.trainers.name}</div>
              )}
            </div>

            {/* Етап хореографії — окремий виділений блок (ключове для клієнта). */}
            <div className={styles.confirmStageBox}>
              <span className={styles.confirmStageBoxLabel}>Етап хореографії</span>
              <span className={styles.confirmStageBoxValue}>
                {confirm.choreo_stage || <span className={styles.confirmStageEmpty}>не вказано</span>}
              </span>
            </div>

            {/* Деталі запису — окрема картка з рядками-роздільниками. */}
            <div className={styles.confirmCard}>
              {confirm.halls?.name && (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowLabel}>Зал</span>
                  <span className={styles.confirmRowValue}>{confirm.halls.name}</span>
                </div>
              )}
              {toWaitlist ? (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowLabel}>Статус</span>
                  <span className={styles.confirmRowValue}>{enrollmentStatusLabel('waitlist')}</span>
                </div>
              ) : (
                <>
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmRowLabel}>Спишеться</span>
                    <span className={styles.confirmRowValue}>{cost} {pluralHours(cost)}</span>
                  </div>
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmRowLabel}>Залишок стане</span>
                    <span className={styles.confirmRowValue}>{after} {pluralHours(after)}</span>
                  </div>
                </>
              )}
            </div>

            {toWaitlist && (
              <p className={styles.confirmReserve}>
                Зал заповнений — вас додамо в <b>резерв</b>. Місце не гарантоване;
                адміністрація повідомить, якщо звільниться.
              </p>
            )}
          </ModalShell>
        )
      })()}
    </>
  )
}
