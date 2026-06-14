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
import { typeColor } from '@/lib/typeColor'
import { hhmm, fullWhen, pluralHours } from '@/lib/formatters'
import { DOW_LABELS_FULL, DOW_LABELS_SHORT, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
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
  const { dow, day, month } = dayParts(startISO)
  return `${DOW_LABELS_FULL[dow]}, ${day} ${MONTHS_UK_GENITIVE[month - 1]}`
}

// Частини дня у київському поясі: день тижня (0=Нд), число, місяць.
// Для дня тижня — UTC-полудень київської дати (день тижня залежить від того, як
// UTC-інстант розкладається по днях у різних поясах).
function dayParts(startISO: string): { dow: number; day: number; month: number } {
  const k = kyivParts(new Date(startISO))
  const utcDate = new Date(Date.UTC(k.year, k.month - 1, k.day, 12, 0, 0))
  return { dow: utcDate.getUTCDay(), day: k.day, month: k.month }
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

// Ключ «послуги» = тип + тривалість. Тип у клієнта завжди group, тож реальний
// різнитель — тривалість (60 хв → 1 год списання, 120 хв → 2 год). Це дає
// крок «Заняття» осмислений вибір там, де тренер веде і годинні, і двогодинні.
function serviceKey(ticketType: string, durationMin: number): string {
  return `${ticketType}|${durationMin}`
}

// Ініціали для аватарки тренера (фото в БД немає): «Оля Пономаренко» → «ОП», «Олена» → «О».
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

// Відмінювання «заняття» за числом: 1/2-4 → заняття, 5+/11 → занять.
function pluralClasses(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'заняття'
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'заняття'
  return 'занять'
}

type EnrolledState = 'enrolled' | 'waitlist'

type TrainerOption = { id: string; name: string; count: number }
type ServiceOption = { key: string; ticketType: string; durationMin: number; count: number }
type DayGroup = { key: string; startsAtISO: string; dow: number; day: number; items: BookableClassRow[] }

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

  // Вибір кроків Altegio-флоу: тренер → послуга (тип+тривалість) → день.
  // Тримаємо «сирі» id; крок виводимо з провалідованих значень нижче, тож
  // застарілий вибір (після refetch) сам відкочується на попередній крок.
  const [trainerSel, setTrainerSel] = useState<string | null>(null)
  const [serviceSel, setServiceSel] = useState<string | null>(null)
  const [daySel, setDaySel] = useState<string | null>(null)

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
  // Клієнтська назва типу заняття (нейтральна, не бренд-лейбл training_types).
  const serviceName = (t: string) => ticketTypeNominativeLabel(t) || typeLabel(t)

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

  // ── Крок 1: тренери з майбутніми заняттями (стабільний ключ — trainer_id). ──
  const trainers = useMemo<TrainerOption[]>(() => {
    const map = new Map<string, TrainerOption>()
    for (const c of classes) {
      if (!c.trainer_id) continue // заняття без тренера у trainer-first флоу не показуємо
      const ex = map.get(c.trainer_id)
      if (ex) ex.count++
      else map.set(c.trainer_id, { id: c.trainer_id, name: c.trainers?.name ?? 'Тренер', count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  }, [classes])

  const activeTrainer = trainerSel ? trainers.find(t => t.id === trainerSel) ?? null : null

  // ── Крок 2: послуги обраного тренера (тип + тривалість). ──
  const services = useMemo<ServiceOption[]>(() => {
    if (!activeTrainer) return []
    const map = new Map<string, ServiceOption>()
    for (const c of classes) {
      if (c.trainer_id !== activeTrainer.id) continue
      const key = serviceKey(c.ticket_type, c.duration_min)
      const ex = map.get(key)
      if (ex) ex.count++
      else map.set(key, { key, ticketType: c.ticket_type, durationMin: c.duration_min, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => a.durationMin - b.durationMin)
  }, [classes, activeTrainer])

  const activeService = activeTrainer && serviceSel ? services.find(s => s.key === serviceSel) ?? null : null

  // ── Крок 3: дні обраної послуги (групування по київських днях). ──
  const days = useMemo<DayGroup[]>(() => {
    if (!activeTrainer || !activeService) return []
    const groups: DayGroup[] = []
    let cur: DayGroup | null = null
    for (const c of classes) {
      if (c.trainer_id !== activeTrainer.id) continue
      if (serviceKey(c.ticket_type, c.duration_min) !== activeService.key) continue
      const k = dayKey(c.starts_at)
      if (!cur || cur.key !== k) {
        const dp = dayParts(c.starts_at)
        cur = { key: k, startsAtISO: c.starts_at, dow: dp.dow, day: dp.day, items: [] }
        groups.push(cur)
      }
      cur.items.push(c)
    }
    return groups
  }, [classes, activeTrainer, activeService])

  // Обраний день (або перший доступний за замовчуванням — слоти видно одразу).
  const shownDay = (daySel ? days.find(d => d.key === daySel) : null) ?? days[0] ?? null

  // Поточний крок виводимо з провалідованих значень (1 → тренер, 2 → послуга, 3 → час).
  const step: 1 | 2 | 3 = !activeTrainer ? 1 : !activeService ? 2 : 3

  function pickTrainer(id: string) { setTrainerSel(id); setServiceSel(null); setDaySel(null) }
  function pickService(key: string) { setServiceSel(key); setDaySel(null) }
  function goBack() {
    if (step === 3) { setServiceSel(null); setDaySel(null) }
    else if (step === 2) { setTrainerSel(null); setServiceSel(null); setDaySel(null) }
  }

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

  // ── Стани завантаження / помилки / порожнечі ──
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
  if (trainers.length === 0) {
    return <p className={styles.empty}>{MSG.empty.bookableClasses}.</p>
  }

  const STEP_LABELS = ['Тренер', 'Заняття', 'Час'] as const

  return (
    <>
      {/* Прогрес-індикатор кроків (sticky — лишається при скролі списків). */}
      <div className={styles.bookStepper}>
        <div className={styles.bookSegs}>
          {[1, 2, 3].map(n => (
            <span key={n} className={`${styles.bookSeg} ${step >= n ? styles.bookSegOn : ''}`} />
          ))}
        </div>
        <div className={styles.bookStepLabels}>
          {STEP_LABELS.map((label, i) => (
            <span key={label} className={`${styles.bookStepLabel} ${step === i + 1 ? styles.bookStepLabelOn : ''}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Заголовок кроку + кнопка «назад». */}
      <div className={styles.bookHead2}>
        {step > 1 && (
          <button type="button" className={styles.bookBack} onClick={goBack} aria-label="Назад">‹</button>
        )}
        <h2 className={styles.bookTitle}>
          {step === 1 ? 'Оберіть тренера' : step === 2 ? 'Оберіть заняття' : 'Оберіть час'}
        </h2>
      </div>

      {/* Хлібні крихти зробленого вибору — тапом повертають на відповідний крок. */}
      {step > 1 && activeTrainer && (
        <div className={styles.bookCrumbs}>
          <button type="button" className={styles.bookCrumb} onClick={() => { setTrainerSel(null); setServiceSel(null); setDaySel(null) }}>
            <span className={styles.bookCrumbDot}>{initials(activeTrainer.name)}</span>
            {activeTrainer.name}
          </button>
          {step > 2 && activeService && (
            <button type="button" className={styles.bookCrumb} onClick={() => { setServiceSel(null); setDaySel(null) }}>
              {serviceName(activeService.ticketType)} · {activeService.durationMin} хв
            </button>
          )}
        </div>
      )}

      {/* ── Крок 1: тренери ── */}
      {step === 1 && (
        <div className={styles.bookOptions}>
          {trainers.map(t => (
            <button key={t.id} type="button" className={styles.bookOption} onClick={() => pickTrainer(t.id)}>
              <span className={styles.bookAvatar}>{initials(t.name)}</span>
              <span className={styles.bookOptionMain}>
                <span className={styles.bookOptionName}>{t.name}</span>
                <span className={styles.bookOptionSub}>{t.count} {pluralClasses(t.count)} на тижні</span>
              </span>
              <span className={styles.bookChevron}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Крок 2: послуги (тип + тривалість) ── */}
      {step === 2 && (
        <div className={styles.bookOptions}>
          {services.map(s => {
            const cost = sessionCost(s.durationMin)
            return (
              <button key={s.key} type="button" className={styles.bookOption} onClick={() => pickService(s.key)}>
                <span className={styles.bookServiceIcon}>
                  <span className={styles.bookServiceDot} style={{ background: typeColor(s.ticketType) }} />
                </span>
                <span className={styles.bookOptionMain}>
                  <span className={styles.bookOptionName}>{serviceName(s.ticketType)}</span>
                  <span className={styles.bookOptionSub}>
                    {s.durationMin} хв · спишеться {cost} {pluralHours(cost)}
                  </span>
                </span>
                <span className={styles.bookChevron}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Крок 3: день + час ── */}
      {step === 3 && activeService && (() => {
        const balance = balanceByType[activeService.ticketType] ?? 0
        return (
          <>
            <div className={styles.bookBalanceBar}>
              <span>Залишок занять</span>
              <span className={balanceClass(balance)}>{balance} {pluralHours(balance)}</span>
            </div>

            {/* Дні (горизонтальний скрол), перший — обраний за замовчуванням. */}
            <div className={styles.bookDays}>
              {days.map(d => (
                <button
                  key={d.key}
                  type="button"
                  className={`${styles.bookDay} ${shownDay?.key === d.key ? styles.bookDayOn : ''}`}
                  aria-pressed={shownDay?.key === d.key}
                  onClick={() => setDaySel(d.key)}
                >
                  <span className={styles.bookDayDow}>{DOW_LABELS_SHORT[d.dow]}</span>
                  <span className={styles.bookDayNum}>{d.day}</span>
                </button>
              ))}
            </div>

            {shownDay && (
              <>
                <div className={styles.bookDayHeading}>{dayHeading(shownDay.startsAtISO)}</div>
                <div className={styles.bookSlots}>
                  {shownDay.items.map(c => {
                    const state = enrolled[c.id]
                    const cost = sessionCost(c.duration_min)
                    const hasSessions = availableByType(c.ticket_type) >= cost
                    const av = availability[c.id]
                    const toWaitlist = goesToWaitlist(av)
                    const free = av?.capacity != null ? av.capacity - Math.min(av.active_count, av.capacity) : null
                    const busy = enrolling === c.id

                    // Вже записаний — слот заблокований (не дублюємо запис), статус міткою.
                    if (state) {
                      return (
                        <div
                          key={c.id}
                          className={`${styles.bookSlot} ${styles.bookSlotEnrolled} ${state === 'waitlist' ? styles.bookSlotEnrolledWaitlist : ''}`}
                        >
                          <span className={styles.bookSlotTime}>{hhmm(new Date(c.starts_at))}</span>
                          <span className={styles.bookSlotInfo}>
                            {c.halls?.name ? `${c.halls.name} · ` : ''}{c.duration_min} хв
                          </span>
                          <span className={styles.bookSlotTag}>{enrollmentStatusLabel(state)}</span>
                        </div>
                      )
                    }

                    // Немає оплачених занять цього типу (з урахуванням інших записів вікна) →
                    // слот заблокований; пояснення під списком. Повний зал → бурштинова мітка
                    // «Немає місць», але слот лишається активним (зберігаємо запис у резерв).
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
                          {c.halls?.name ? `${c.halls.name} · ` : ''}{c.duration_min} хв
                        </span>
                        <span className={styles.bookSlotTag}>
                          {toWaitlist ? 'Немає місць' : free != null ? `Вільно: ${free}` : 'Записатись'}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {availableByType(activeService.ticketType) < sessionCost(activeService.durationMin) && (
                  <p className={styles.bookNoSessions}>
                    {balance > 0
                      ? 'Залишок занять цього типу вже зайнятий іншими записами на тиждень.'
                      : 'Немає оплачених занять цього типу — зверніться до адміністрації, щоб придбати абонемент.'}
                  </p>
                )}
              </>
            )}
          </>
        )
      })()}

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
