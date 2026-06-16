'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listBookableClasses, listMySessionBalances } from '@/lib/queries/client-cabinet-data'
import type { BookableClassRow, ClassAvailability } from '@/lib/queries/client-cabinet-data'
import { clientEnroll } from '@/lib/queries/client-cabinet'
import { useListQuery } from '@/hooks/useListQuery'
import { useAsync } from '@/hooks/useAsync'
import { ticketTypeShortLabel, ticketTypeNominativeLabel, enrollmentStatusLabel, balanceClass } from '@/lib/badges'
import { hhmm, fullWhen, pluralHours } from '@/lib/formatters'
import { DOW_LABELS_SHORT, DOW_LABELS_FULL, MONTHS_UK_SHORT, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { goesToWaitlist } from '@/lib/scheduleMetrics'
import { kyivParts } from '@/lib/cancellation'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

const ENROLL_ERROR_LABEL: Record<string, string> = {
  no_sessions: 'Немає оплачених занять цього типу',
  conflict: 'У вас уже є запис на цей час',
  duplicate: 'Ви вже записані на це заняття',
}

function dayParts(startISO: string): { dow: number; day: number; month: number } {
  const k = kyivParts(new Date(startISO))
  const utcDate = new Date(Date.UTC(k.year, k.month - 1, k.day, 12, 0, 0))
  return { dow: utcDate.getUTCDay(), day: k.day, month: k.month }
}

function dayKey(startISO: string): string {
  const k = kyivParts(new Date(startISO))
  return `${k.year}-${k.month}-${k.day}`
}

function todayKey(): string {
  return dayKey(new Date().toISOString())
}

function dayHeading(key: string, dp: { dow: number; day: number; month: number }): string {
  return `${DOW_LABELS_FULL[dp.dow]}, ${dp.day} ${MONTHS_UK_GENITIVE[dp.month - 1]}`
}

function sessionCost(durationMin: number): number {
  return durationMin >= 120 ? 2 : 1
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

type EnrolledState = 'enrolled' | 'waitlist'
type TrainerOption = { id: string; name: string }
type DayGroup = { key: string; dow: number; day: number; month: number }

type Props = {
  clientId: string
  fromISO: string
  toISO: string
  typeLabels: Record<string, string>
  initialBalanceByType: Record<string, number>
  availability: Record<string, ClassAvailability>
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
  const [enrolled, setEnrolled] = useState<Record<string, EnrolledState>>(initialEnrolled)
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<BookableClassRow | null>(null)
  const [trainerFilter, setTrainerFilter] = useState<string | null>(null)

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

  const { data: classes, loading, error: classesError } = useListQuery(
    () => listBookableClasses(supabase, fromISO, toISO),
    [fromISO, toISO],
    { refetchOnVisible: true, initialData: initialClasses }
  )

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)
  const serviceName = (t: string) => ticketTypeNominativeLabel(t) || typeLabel(t)

  // Оптимістичний захист: кожен активний запис у вікні = зайнята сесія.
  const reservedByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of classes) {
      if (enrolled[c.id]) m[c.ticket_type] = (m[c.ticket_type] ?? 0) + sessionCost(c.duration_min)
    }
    return m
  }, [classes, enrolled])

  const availableByType = (t: string) => (balanceByType[t] ?? 0) - (reservedByType[t] ?? 0)

  // Усі дні вікна (незалежно від фільтра тренера) — для рядка чипів дат.
  const allDays = useMemo<DayGroup[]>(() => {
    const seen = new Set<string>()
    const result: DayGroup[] = []
    for (const c of classes) {
      const k = dayKey(c.starts_at)
      if (!seen.has(k)) {
        seen.add(k)
        const dp = dayParts(c.starts_at)
        result.push({ key: k, ...dp })
      }
    }
    return result
  }, [classes])

  // dateSel: сьогодні якщо є заняття, інакше перший доступний день.
  const today = todayKey()
  const defaultDay = allDays.find(d => d.key === today)?.key ?? allDays[0]?.key ?? today
  const [dateSel, setDateSel] = useState<string>(defaultDay)

  // Валідний вибраний день (якщо після refetch зник — береться перший).
  const activeDayKey = allDays.find(d => d.key === dateSel)?.key ?? allDays[0]?.key ?? dateSel
  const activeDay = allDays.find(d => d.key === activeDayKey) ?? null

  // Distinct тренери всього вікна (для рядка фільтра).
  const allTrainers = useMemo<TrainerOption[]>(() => {
    const map = new Map<string, string>()
    for (const c of classes) {
      if (c.trainer_id && !map.has(c.trainer_id)) {
        map.set(c.trainer_id, c.trainers?.name ?? 'Тренер')
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  }, [classes])

  // Заняття обраного дня з фільтром тренера.
  const visibleClasses = useMemo(() => {
    return classes.filter(c => {
      if (dayKey(c.starts_at) !== activeDayKey) return false
      if (trainerFilter && c.trainer_id !== trainerFilter) return false
      return true
    })
  }, [classes, activeDayKey, trainerFilter])

  // Валідація фільтра тренера — якщо після зміни дня тренер не веде, залишаємо
  // фільтр як є (клієнт побачить порожній стан із підказкою).
  const trainerFilterName = allTrainers.find(t => t.id === trainerFilter)?.name ?? null

  async function handleEnroll(classId: string) {
    setEnrolling(classId)
    const { success, status, error } = await clientEnroll(supabase, classId)
    setEnrolling(null)
    if (!success) {
      const msg = (error && ENROLL_ERROR_LABEL[error]) || 'Не вдалося записатись'
      toast.error(msg)
      if (error === 'duplicate') setEnrolled(prev => ({ ...prev, [classId]: 'enrolled' }))
      setConfirm(null)
      return
    }
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
  if (loading && classes.length === 0) {
    return <div className="loading-dots"><span /><span /><span /></div>
  }
  if (allDays.length === 0) {
    return <p className={styles.empty}>{MSG.empty.bookableClasses}.</p>
  }

  return (
    <>
      {/* ── Горизонтальний скрол дат ── */}
      <div className={styles.bookDays}>
        {allDays.map((d, i) => {
          const isToday = d.key === today
          const showMonth = i === 0 || d.month !== allDays[i - 1].month
          return (
            <button
              key={d.key}
              type="button"
              className={`${styles.bookDay} ${activeDayKey === d.key ? styles.bookDayOn : ''}`}
              aria-pressed={activeDayKey === d.key}
              onClick={() => setDateSel(d.key)}
            >
              <span className={styles.bookDayDow}>
                {isToday ? 'Сьог.' : DOW_LABELS_SHORT[d.dow]}
              </span>
              <span className={styles.bookDayNum}>{d.day}</span>
              <span className={styles.bookDayMonth}>{showMonth ? MONTHS_UK_SHORT[d.month - 1] : ''}</span>
            </button>
          )
        })}
      </div>

      {/* ── Фільтр тренерів ── */}
      {allTrainers.length > 1 && (
        <div className={styles.bookTrainerFilter}>
          <button
            type="button"
            className={`${styles.bookTrainerChip} ${trainerFilter === null ? styles.bookTrainerChipOn : ''}`}
            onClick={() => setTrainerFilter(null)}
          >
            Всі
          </button>
          {allTrainers.map(t => (
            <button
              key={t.id}
              type="button"
              className={`${styles.bookTrainerChip} ${trainerFilter === t.id ? styles.bookTrainerChipOn : ''}`}
              onClick={() => setTrainerFilter(t.id)}
            >
              <span className={styles.bookChipAvatar}>{initials(t.name)}</span>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Заголовок дня ── */}
      {activeDay && (
        <div className={styles.bookDayHeading}>
          {dayHeading(activeDayKey, activeDay)}
        </div>
      )}

      {/* ── Список занять дня ── */}
      <div className={styles.bookSlots}>
        {visibleClasses.length === 0 && (
          <p className={styles.bookNoSessions}>
            {trainerFilter && trainerFilterName
              ? `${trainerFilterName} не веде занять у цей день. Спробуйте «Всі» або іншу дату.`
              : 'Занять у цей день немає.'}
          </p>
        )}
        {visibleClasses.map(c => {
          const state = enrolled[c.id]
          const cost = sessionCost(c.duration_min)
          const hasSessions = availableByType(c.ticket_type) >= cost
          const av = availability[c.id]
          const toWaitlist = goesToWaitlist(av)
          const free = av?.capacity != null ? av.capacity - Math.min(av.active_count, av.capacity) : null
          const busy = enrolling === c.id

          const metaParts = [
            c.trainers?.name,
            c.halls?.name,
            `${c.duration_min} хв`,
          ].filter(Boolean).join(' · ')

          // Вже записаний — картка неактивна.
          if (state) {
            return (
              <div
                key={c.id}
                className={`${styles.bookSlot} ${styles.bookSlotEnrolled} ${state === 'waitlist' ? styles.bookSlotEnrolledWaitlist : ''}`}
              >
                <span className={styles.bookSlotTime}>{hhmm(new Date(c.starts_at))}</span>
                <span className={styles.bookSlotInfo}>
                  <span className={styles.bookSlotName}>{c.title || serviceName(c.ticket_type)}</span>
                  <span className={styles.bookSlotMeta}>{metaParts}</span>
                </span>
                <span className={styles.bookSlotTag}>{enrollmentStatusLabel(state)}</span>
              </div>
            )
          }

          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.bookSlot} ${toWaitlist ? styles.bookSlotReserve : ''}`}
              disabled={!hasSessions || busy}
              onClick={() => setConfirm(c)}
            >
              <span className={styles.bookSlotTime}>{hhmm(new Date(c.starts_at))}</span>
              <span className={styles.bookSlotInfo}>
                <span className={styles.bookSlotName}>{c.title || serviceName(c.ticket_type)}</span>
                <span className={styles.bookSlotMeta}>{metaParts}</span>
              </span>
              <span className={styles.bookSlotTag}>
                {!hasSessions
                  ? 'Немає занять'
                  : toWaitlist
                  ? 'У резерв'
                  : free != null
                  ? `Вільно: ${free}`
                  : 'Записатись'}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Залишок сесій під списком ── */}
      {(() => {
        const balance = balanceByType['group'] ?? 0
        return (
          <div className={styles.bookBalanceBar} style={{ marginTop: 16 }}>
            <span>Залишок занять</span>
            <span className={balanceClass(balance)}>{balance} {pluralHours(balance)}</span>
          </div>
        )
      })()}

      {/* ── Модалка підтвердження (без змін) ── */}
      {confirm && (() => {
        const toWaitlist = goesToWaitlist(availability[confirm.id])
        const cost = sessionCost(confirm.duration_min)
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
            <div className={styles.confirmHero}>
              <div className={styles.confirmHeroName}>{confirm.title || typeLabel(confirm.ticket_type)}</div>
              <div className={styles.confirmHeroWhen}>{fullWhen(confirm.starts_at, confirm.duration_min)}</div>
              {confirm.trainers?.name && (
                <div className={styles.confirmHeroTrainer}>Тренер: {confirm.trainers.name}</div>
              )}
            </div>

            <div className={styles.confirmStageBox}>
              <span className={styles.confirmStageBoxLabel}>Етап хореографії</span>
              <span className={styles.confirmStageBoxValue}>
                {confirm.choreo_stage || <span className={styles.confirmStageEmpty}>не вказано</span>}
              </span>
            </div>

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

            {!toWaitlist && (reservedByType[confirm.ticket_type] ?? 0) > 0 && (() => {
              const afterAll = availableByType(confirm.ticket_type) - cost
              return (
                <p className={styles.confirmInfo}>
                  Після всіх запланованих занять залишиться {afterAll} {pluralHours(afterAll)}.
                </p>
              )
            })()}

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
