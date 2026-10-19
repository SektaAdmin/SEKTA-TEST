'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import { ModalShell } from '@/components/ui/ModalShell'
import PlannedChangeModal, { type PlannedPrefill } from './PlannedChangeModal'
import { getSeriesRoster, cancelPlannedChange, type ProjectedSlot, type RosterRow } from '@/lib/queries/planned'
import { kyivDateLabel, ymdShort } from '@/lib/planned'
import { formatTime } from '@/lib/formatters'
import styles from './planned.module.css'

/* Примарний слот: заняття шаблону на дату, де тиждень ще не відкрито.
   Показує майбутній склад (series_roster) і дає зафіксувати намір наперед. */

interface Props {
  slot: ProjectedSlot
  label: string
  trainerName: string | null
  hallName: string | null
  canEditTemplates: boolean
  onClose: () => void
  /** Після зміни складу — перемалювати лічильник примарної картки. */
  onChanged: () => void
}

function rosterName(r: RosterRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Клієнт'
}

export default function GhostSlotModal({ slot, label, trainerName, hallName, canEditTemplates, onClose, onChanged }: Props) {
  const [wizard, setWizard] = useState<PlannedPrefill | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const { data, loading, error, refetch } = useAsync(
    () => getSeriesRoster(supabase, slot.series_id, slot.class_date),
    [slot.series_id, slot.class_date]
  )
  const roster = data ?? []
  const active = roster.filter(r => !r.paused)
  const paused = roster.filter(r => r.paused)

  async function cancelPlanned(changeId: string) {
    const { error } = await cancelPlannedChange(supabase, changeId)
    if (error) { toast.error(error); return }
    toast.success('Запис наперед скасовано')
    setConfirmId(null)
    refetch(); onChanged()
  }

  const footer = (
    <>
      <button type="button" className="btn-secondary" onClick={onClose}>Закрити</button>
      <button
        type="button"
        className="btn-primary"
        onClick={() => setWizard({ kind: 'enroll', seriesId: slot.series_id, date: slot.class_date })}
      >
        + Записати наперед
      </button>
    </>
  )

  return (
    <>
      <ModalShell title={label} onClose={onClose} footer={footer}>
        <div className={styles.detailMeta}>
          <span>{kyivDateLabel(slot.starts_at)} {formatTime(slot.starts_at)}</span>
          {hallName && (<><span className={styles.dot}>·</span><span>{hallName}</span></>)}
          {trainerName && (<><span className={styles.dot}>·</span><span>{trainerName}</span></>)}
          {slot.capacity != null && (<><span className={styles.dot}>·</span><span>{active.length}/{slot.capacity}</span></>)}
        </div>
        <p className={styles.stepHint}>
          Заняття за шаблоном — зʼявиться, коли відкриють тиждень. Записи нижче створяться автоматично.
        </p>

        {loading && !data ? (
          <p className={styles.muted}>Завантаження...</p>
        ) : error ? (
          <p className={styles.previewError}>{error}</p>
        ) : roster.length === 0 ? (
          <p className={styles.muted}>Поки нікого — додайте запис наперед</p>
        ) : (
          <ul className={styles.dateList}>
            {[...active, ...paused].map(r => (
              <li key={`${r.client_id}-${r.source}`} className={styles.dateRow}>
                <span className={styles.dateRowResult} style={r.paused ? { color: 'var(--text-3)', textDecoration: 'line-through' } : undefined}>
                  {rosterName(r)}
                </span>
                {r.paused && <span className="badge badge-type">Пауза до {ymdShort(r.pause_to!)}</span>}
                {!r.paused && r.source === 'temp_regular' && r.valid_to && (
                  <span className="badge badge-type">до {ymdShort(r.valid_to)}</span>
                )}
                {r.source === 'planned' && <span className="badge badge-type">наперед</span>}

                {!r.paused && r.source !== 'planned' && (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setWizard({
                      kind: 'skip', seriesId: slot.series_id, date: slot.class_date,
                      client: { id: r.client_id, name: rosterName(r) },
                    })}
                  >
                    Пауза
                  </button>
                )}
                {r.source === 'planned' && r.change_id && (confirmId === r.change_id ? (
                  <button type="button" className={styles.linkBtn} onClick={() => cancelPlanned(r.change_id!)}>
                    Підтвердити
                  </button>
                ) : (
                  <button type="button" className={styles.linkBtn} onClick={() => setConfirmId(r.change_id)}>
                    Скасувати
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </ModalShell>

      {wizard && (
        <PlannedChangeModal
          canEditTemplates={canEditTemplates}
          prefill={wizard}
          onClose={() => setWizard(null)}
          onSaved={() => { setWizard(null); refetch(); onChanged() }}
        />
      )}
    </>
  )
}
