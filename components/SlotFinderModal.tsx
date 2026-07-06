'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useRefs } from '@/contexts/RefsContext'
import {
  listClassesForSlotFinder,
  insertClassReturningId,
  checkClassConflicts,
  type ClassPayload,
  type SlotFinderClass,
} from '@/lib/queries/classes'
import { enrollClient, getClientSessionBalance } from '@/lib/queries/enrollments'
import { computeSlotMatrix, hasFutureSlotToday, type SlotStatus } from '@/lib/slotFinder'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import { toYMD, parseYMD, ymdToDisplay } from '@/lib/dateUtils'
import type { Client } from '@/types'
import styles from './SlotFinderModal.module.css'

const TICKET_TYPE = 'individual'
// Точка розширення на duo/trio: додати код → capacity, і селект типу в UI.
const CAPACITY_BY_TYPE: Record<string, number> = { individual: 1 }

const DURATIONS = [60, 90, 120]

const STATUS_TITLE: Record<SlotStatus, string> = {
  free: 'Вільний слот',
  hall_busy: 'Зал зайнятий',
  trainer_busy: 'Тренер зайнятий',
  selftraining: 'Самостійне тренування — за домовленістю',
  past: 'Час минув',
}

interface Props {
  onClose: () => void
  onSaved: () => void
  initialDate?: string
}

export default function SlotFinderModal({ onClose, onSaved, initialDate }: Props) {
  const { trainers, halls } = useRefs()
  const activeHalls = halls.filter(h => h.is_active)
  const activeTrainers = trainers.filter(t => t.is_active)

  const todayYMD = toYMD(new Date())
  const [client, setClient] = useState<Client | null>(null)
  const [clientBalance, setClientBalance] = useState<number | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [trainerId, setTrainerId] = useState('')
  const [dateYMD, setDateYMD] = useState(() => {
    // Прошедшие дни — через звичайний «+ Заняття»; тут тільки сьогодні й далі.
    const resolved = initialDate && initialDate >= todayYMD ? initialDate : todayYMD
    // Сьогодні вже не лишилось майбутніх годин (за замовч. тривалістю) — одразу відкриваємо завтра.
    if (resolved === todayYMD && !hasFutureSlotToday(new Date(), 60)) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      return toYMD(tomorrow)
    }
    return resolved
  })
  const [durationMin, setDurationMin] = useState(60)
  const [dayClasses, setDayClasses] = useState<SlotFinderClass[]>([])
  const [dayError, setDayError] = useState<string | null>(null)
  const [loadingDay, setLoadingDay] = useState(true)
  const [selected, setSelected] = useState<{ hallId: string; hour: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchDay = useCallback(async () => {
    setLoadingDay(true)
    try {
      const { data, error } = await listClassesForSlotFinder(supabase, dateYMD)
      if (error) {
        // Дані про минулу дату не годяться для нової — не показуємо матрицю як «все вільно».
        setDayError(error)
      } else {
        setDayError(null)
        setDayClasses(data)
      }
    } catch {
      // Обрив мережі кидає виняток, а не {error} — без catch модалка зависла б на «Завантаження…».
      setDayError('Немає з’єднання із сервером')
    } finally {
      setLoadingDay(false)
    }
  }, [dateYMD])

  useEffect(() => { fetchDay() }, [fetchDay])

  // Зміна параметрів робить вибраний слот потенційно невалідним — скидаємо.
  useEffect(() => { setSelected(null) }, [dateYMD, trainerId, durationMin])

  const { hours, matrix } = useMemo(
    () => computeSlotMatrix({
      classes: dayClasses,
      hallIds: activeHalls.map(h => h.id),
      durationMin,
      trainerId: trainerId || null,
      isToday: dateYMD === todayYMD,
    }),
    [dayClasses, halls, durationMin, trainerId, dateYMD, todayYMD]
  )

  async function handleClientSelect(c: Client) {
    setClient(c)
    setClientBalance(null)
    setBalanceError(null)
    const { balance, error } = await getClientSessionBalance(supabase, c.id, TICKET_TYPE)
    if (error) setBalanceError(error)
    else setClientBalance(balance)
  }

  function handleClientClear() {
    setClient(null)
    setClientBalance(null)
    setBalanceError(null)
  }

  function handleRetryBalance() {
    if (client) handleClientSelect(client)
  }

  const selectedHallName = selected ? activeHalls.find(h => h.id === selected.hallId)?.name ?? '' : ''
  const selectedTrainerName = trainerId
    ? activeTrainers.find(t => t.id === trainerId)?.name ?? ''
    : 'будь-який тренер'

  async function handleConfirm() {
    if (!client || !selected) return
    setSaving(true)

    const base = parseYMD(dateYMD)
    if (!base) { setSaving(false); return }
    base.setHours(selected.hour, 0, 0, 0)
    const startsAt = base.toISOString()

    // Серверна перевірка: матриця могла застаріти (інший адмін, realtime-лаг).
    const conflict = await checkClassConflicts(supabase, {
      starts_at: startsAt,
      duration_min: durationMin,
      hall_id: selected.hallId,
      trainer_id: trainerId || null,
    })
    if (conflict) {
      toast.error(conflict)
      setSelected(null)
      await fetchDay()
      setSaving(false)
      return
    }

    const payload: ClassPayload = {
      ticket_type: TICKET_TYPE,
      trainer_id: trainerId || null,
      hall_id: selected.hallId,
      starts_at: startsAt,
      duration_min: durationMin,
      capacity: CAPACITY_BY_TYPE[TICKET_TYPE],
      title: null,
      notes: null,
    }
    const { id: classId, error: insertError } = await insertClassReturningId(supabase, payload)
    if (insertError || !classId) {
      toast.error(insertError ?? 'Помилка створення заняття')
      setSaving(false)
      return
    }

    const { error: enrollError, closeError } = await enrollClient(supabase, classId, client.id)
    if (enrollError) {
      toast.warning('Заняття створено, але клієнта не записано — відкрийте заняття і запишіть вручну')
    } else {
      if (closeError) toast.warning(`Записано, але відвідування не зафіксовано: ${closeError}`)
      toast.success('Заняття створено, клієнта записано')
    }
    onSaved()
  }

  const canSave = !!client && !!selected && !saving

  return (
    <ModalShell
      title="Підбір слота для індива"
      onClose={onClose}
      size="detail"
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleConfirm}
          saveLabel="Створити та записати"
          loading={saving}
          disabled={!canSave}
        />
      }
    >
      <div className={styles.settings}>
        <FormField id="sf-client" label="Клієнт" required>
          <ClientSearchCombobox
            inputId="sf-client"
            onSelect={handleClientSelect}
            onClear={handleClientClear}
            disabled={saving}
          />
        </FormField>
        {client && balanceError && (
          <p className={styles.balanceWarn}>
            Не вдалося перевірити залишок занять —{' '}
            <button type="button" className={styles.inlineRetry} onClick={handleRetryBalance}>
              спробувати ще раз
            </button>
          </p>
        )}
        {client && clientBalance !== null && (
          clientBalance > 0 ? (
            <p className={styles.balanceLine}>
              Залишок: <span className="balance-ok">{clientBalance}</span> інд. занять
            </p>
          ) : (
            <p className={styles.balanceWarn}>
              Немає оплачених індивідуальних занять — спершу оформіть продаж
            </p>
          )
        )}

        <div className={styles.settingsRow}>
          <FormField id="sf-trainer" label="Тренер">
            <select
              id="sf-trainer"
              value={trainerId}
              onChange={e => setTrainerId(e.target.value)}
              disabled={saving}
            >
              <option value="">Будь-який тренер</option>
              {activeTrainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>
          <FormField id="sf-date" label="Дата">
            <input
              id="sf-date"
              type="date"
              value={dateYMD}
              min={todayYMD}
              onChange={e => setDateYMD(e.target.value)}
              disabled={saving}
            />
          </FormField>
          <FormField id="sf-dur" label="Тривалість">
            <select
              id="sf-dur"
              value={durationMin}
              onChange={e => setDurationMin(Number(e.target.value))}
              disabled={saving}
            >
              {DURATIONS.map(d => <option key={d} value={d}>{d} хв</option>)}
            </select>
          </FormField>
        </div>
      </div>

      {activeHalls.length === 0 ? (
        <div className={styles.matrixWrap}>
          <p className={styles.matrixMessage}>Немає активних залів — додайте зал у довідниках</p>
        </div>
      ) : loadingDay ? (
        <div className={styles.matrixWrap}>
          <p className={styles.matrixMessage}>Завантаження розкладу…</p>
        </div>
      ) : dayError ? (
        <div className={styles.matrixWrap}>
          <div className={styles.matrixError}>
            <span className={styles.matrixErrorMsg}>Не вдалося завантажити розклад дня</span>
            <button type="button" className="btn-secondary btn-sm" onClick={fetchDay}>
              Спробувати ще раз
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.matrixWrap}>
            <div
              className={styles.matrix}
              style={{ gridTemplateColumns: `44px repeat(${activeHalls.length}, minmax(84px, 1fr))` }}
            >
              <div className={styles.headCell} />
              {activeHalls.map(h => (
                <div key={h.id} className={styles.headCell}>{h.name}</div>
              ))}
              {hours.map(hour => (
                <div key={hour} className={styles.rowContents}>
                  <div className={styles.hourCell}>{String(hour).padStart(2, '0')}:00</div>
                  {activeHalls.map(h => {
                    const status = matrix.get(h.id)?.get(hour) ?? 'free'
                    const isSelected = selected?.hallId === h.id && selected?.hour === hour
                    return (
                      <button
                        key={h.id}
                        type="button"
                        className={`${styles.cell} ${styles[`cell_${status}`]} ${isSelected ? styles.cellSelected : ''}`}
                        disabled={status !== 'free' || saving}
                        title={STATUS_TITLE[status]}
                        onClick={() => setSelected({ hallId: h.id, hour })}
                      >
                        {status === 'selftraining' ? 'самотрен.' : status === 'hall_busy' ? 'зайнято' : status === 'trainer_busy' ? 'тренер' : ''}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.legend}>
            <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendFree}`} />вільно</span>
            <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendBusy}`} />зайнято</span>
            <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendSelf}`} />самотрен — за домовленістю</span>
          </div>

          {selected && (
            <p className={styles.summary}>
              {ymdToDisplay(dateYMD)}, {String(selected.hour).padStart(2, '0')}:00–
              {String(selected.hour + Math.floor(durationMin / 60)).padStart(2, '0')}:{String(durationMin % 60).padStart(2, '0')},
              {' '}{selectedHallName}, {selectedTrainerName}
            </p>
          )}
        </>
      )}
    </ModalShell>
  )
}
