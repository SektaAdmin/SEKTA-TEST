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
import { hhmm, fullWhen, pluralHours } from '@/lib/formatters'
import { DOW_LABELS_FULL, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
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
  // Заняття, для якого відкрита модалка підтвердження (деталі + етап хореографії).
  const [confirm, setConfirm] = useState<BookableClassRow | null>(null)

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
      setConfirm(null)
      return
    }
    // status — реальний результат ПІСЛЯ тригера capacity: 'waitlist' якщо зал повний,
    // інакше 'enrolled'. Показуємо точний бейдж і тост (без оптимістичного припущення).
    const finalStatus: EnrolledState = status === 'waitlist' ? 'waitlist' : 'enrolled'
    setEnrolled(prev => ({ ...prev, [classId]: finalStatus }))
    if (finalStatus === 'waitlist') toast.info('Вас додано в резерв')
    else toast.success('Ви записані')
    setConfirm(null)
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
              const av = availability[c.id]
              const toWaitlist = goesToWaitlist(av)
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
                  {c.choreo_stage && (
                    <div className={styles.bookStage}>{c.choreo_stage}</div>
                  )}
                  {av?.capacity != null && (
                    <div className={styles.bookSeats}>
                      Місця: {Math.min(av.active_count, av.capacity)}/{av.capacity}
                      {av.waitlist_count > 0 ? ` · у резерві ${av.waitlist_count}` : ''}
                    </div>
                  )}

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
        const cost = 1 // group-заняття = 1 сесія
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
            {/* Блок 1 — про заняття: що / коли / тренер-зал / етап. */}
            <div className={styles.confirmSectionLabel}>Заняття</div>
            <div className={styles.confirmTitle}>
              {confirm.title || typeLabel(confirm.ticket_type)}
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmRowLabel}>Коли</span>
              <span className={styles.confirmRowValue}>{fullWhen(confirm.starts_at, confirm.duration_min)}</span>
            </div>
            {confirm.trainers?.name && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmRowLabel}>Тренер</span>
                <span className={styles.confirmRowValue}>{confirm.trainers.name}</span>
              </div>
            )}
            {confirm.halls?.name && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmRowLabel}>Зал</span>
                <span className={styles.confirmRowValue}>{confirm.halls.name}</span>
              </div>
            )}
            <div className={styles.confirmRow}>
              <span className={styles.confirmRowLabel}>Етап хореографії</span>
              <span className={styles.confirmRowValue}>
                {confirm.choreo_stage || <span className={styles.confirmStageEmpty}>не вказано</span>}
              </span>
            </div>

            {/* Блок 2 — про запис: списання/залишок або резерв. */}
            <div className={styles.confirmSectionLabel}>Запис</div>
            {toWaitlist ? (
              <p className={styles.confirmReserve}>
                Зал заповнений — вас додамо в <b>резерв</b> (чергу). Місце не гарантоване;
                адміністрація повідомить, якщо звільниться.
              </p>
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
          </ModalShell>
        )
      })()}
    </>
  )
}
