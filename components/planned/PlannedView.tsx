'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import { useRefs } from '@/contexts/RefsContext'
import FilterSelect from '@/components/ui/FilterSelect'
import { ModalShell } from '@/components/ui/ModalShell'
import ClassDetailModal from '@/components/ClassDetailModal'
import PlannedChangeModal, { type PlannedPrefill } from './PlannedChangeModal'
import {
  listPlannedRegister, listPlannedItemDates, cancelPlannedChange,
  type PlannedRegisterRow, type PlannedDateRow,
} from '@/lib/queries/planned'
import {
  KIND_LABEL, STATUS_LABEL, kyivDateLabel, periodLabel, statusBadgeClass,
  type PlannedKind, type PlannedStatus,
} from '@/lib/planned'
import { enrollmentStatusLabel } from '@/lib/badges'
import styles from './planned.module.css'

type Tab = 'active' | 'attention' | 'archive'

const TABS: { value: Tab; label: string }[] = [
  { value: 'active', label: 'Активні' },
  { value: 'attention', label: 'Потребують уваги' },
  { value: 'archive', label: 'Архів' },
]

const KIND_CHIPS: { value: PlannedKind | ''; label: string }[] = [
  { value: '', label: 'Усі' },
  { value: 'skip', label: KIND_LABEL.skip },
  { value: 'enroll', label: KIND_LABEL.enroll },
  { value: 'temp_regular', label: KIND_LABEL.temp_regular },
  { value: 'temp_template', label: KIND_LABEL.temp_template },
]

const EMPTY: Record<Tab, string> = {
  active: 'Запланованих змін немає',
  attention: 'Усе виконано — нічого не потребує уваги',
  archive: 'Завершених змін немає',
}

type Props = {
  /** owner/admin: фільтр тренера + «Тимчасовий шаблон». trainer: RPC сама звужує до своїх серій. */
  isStaff: boolean
  viewerTrainerId?: string
  /** Примусово картками (кабінет тренера). */
  compact?: boolean
}

export default function PlannedView({ isStaff, viewerTrainerId, compact = false }: Props) {
  const { trainers } = useRefs()
  const [tab, setTab] = useState<Tab>('active')
  const [kind, setKind] = useState<PlannedKind | ''>('')
  const [trainerId, setTrainerId] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PlannedRegisterRow | null>(null)
  const [wizard, setWizard] = useState<PlannedPrefill | null>(null)

  const { data, loading, error, refetch } = useAsync(
    () => listPlannedRegister(supabase, { trainerId: isStaff ? trainerId : undefined, includeDone: tab === 'archive' }),
    [trainerId, tab === 'archive', isStaff],
    { refetchOnVisible: true }
  )

  const all = data ?? []
  const attentionCount = all.filter(r => r.status === 'attention').length

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(r => {
      if (tab === 'archive' && r.status !== 'done') return false
      if (tab === 'active' && r.status === 'done') return false
      if (tab === 'attention' && r.status !== 'attention') return false
      if (kind && r.kind !== kind) return false
      if (q && !(r.client_name ?? '').toLowerCase().includes(q) && !(r.series_title ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [all, tab, kind, search])

  const trainerOptions = [
    { value: '', label: 'Всі тренери' },
    ...trainers.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })),
  ]

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`}>
      <div className={styles.controls}>
        <div className="tabs-segmented" role="tablist">
          {TABS.map(t => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              className={`tab-seg ${tab === t.value ? 'tab-seg-active' : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
              {t.value === 'attention' && attentionCount > 0 && <span className={styles.tabCount}>{attentionCount}</span>}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          {isStaff && <FilterSelect value={trainerId} onChange={setTrainerId} placeholder="Тренер" options={trainerOptions} />}
          <input
            className={styles.search}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Клієнт або група..."
            aria-label="Пошук"
          />
        </div>
        <button type="button" className={`btn-primary ${styles.newBtn}`} onClick={() => setWizard({})}>+ Нова зміна</button>
      </div>

      <div className="filterChips" role="tablist" aria-label="Вид">
        {KIND_CHIPS.filter(c => isStaff || c.value !== 'temp_template').map(c => (
          <button
            key={c.value || 'all'}
            type="button"
            role="tab"
            aria-selected={kind === c.value}
            className={`filterChip ${kind === c.value ? 'filterChipActive' : ''}`}
            onClick={() => setKind(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className={styles.empty} role="status">Завантаження...</div>
      ) : error ? (
        <div className={styles.empty}>Не вдалося завантажити: {error}</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>{EMPTY[tab]}</div>
      ) : (
        <>
          <div className={`data-table-wrap ${styles.tableDesktop}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Клієнт</th>
                  <th>Група</th>
                  <th>Вид</th>
                  <th>Період</th>
                  <th>Статус</th>
                  {isStaff && <th>Тренер</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.kind}-${r.id}`} className={styles.row} onClick={() => setSelected(r)}>
                    <td className={styles.nameCell}>{r.client_name ?? '—'}</td>
                    <td>{r.series_title}</td>
                    <td><span className="badge badge-type">{KIND_LABEL[r.kind as PlannedKind]}</span></td>
                    <td className={styles.num}>{periodLabel(r.date_from, r.date_to)}</td>
                    <td><StatusBadge row={r} /></td>
                    {isStaff && <td className={styles.subtle}>{r.trainer_name ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cardList}>
            {rows.map(r => (
              <button key={`${r.kind}-${r.id}`} type="button" className={styles.card} onClick={() => setSelected(r)}>
                <div className={styles.cardRow}>
                  <span className={styles.cardTitle}>{r.client_name ?? r.series_title}</span>
                  <StatusBadge row={r} />
                </div>
                <div className={styles.cardMeta}>
                  <span>{KIND_LABEL[r.kind as PlannedKind]}</span>
                  <span className={styles.dot}>·</span>
                  <span>{periodLabel(r.date_from, r.date_to)}</span>
                  {r.client_name && (<><span className={styles.dot}>·</span><span>{r.series_title}</span></>)}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <PlannedDetailModal
          row={selected}
          isStaff={isStaff}
          viewerTrainerId={viewerTrainerId}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); refetch() }}
          onEditPeriod={() => {
            const r = selected
            setSelected(null)
            setWizard({
              kind: r.kind as PlannedKind,
              seriesId: r.series_id,
              client: r.client_id ? { id: r.client_id, name: r.client_name ?? '' } : undefined,
            })
          }}
        />
      )}

      {wizard && (
        <PlannedChangeModal
          canEditTemplates={isStaff}
          prefill={wizard}
          onClose={() => setWizard(null)}
          onSaved={() => { setWizard(null); refetch() }}
        />
      )}
    </div>
  )
}

function StatusBadge({ row }: { row: PlannedRegisterRow }) {
  const label = STATUS_LABEL[row.status as PlannedStatus] ?? row.status
  return (
    <span className={statusBadgeClass(row.status)}>
      {label}{row.status === 'attention' && row.issues_count > 1 ? ` · ${row.issues_count}` : ''}
    </span>
  )
}

/** Що сталося з наміром на конкретну дату. warn — потребує рішення адміна. */
function dateResult(kind: PlannedKind, d: PlannedDateRow): { label: string; warn: boolean } {
  if (d.pending) return { label: 'очікує відкриття тижня', warn: false }
  if (d.isCancelled) return { label: 'заняття скасоване студією', warn: kind === 'enroll' }
  if (kind === 'temp_template') return { label: 'заняття створено', warn: false }
  const past = new Date(d.startsAt).getTime() < Date.now()
  const s = d.enrollment?.status
  if (past) return { label: s ? enrollmentStatusLabel(s) : 'без запису', warn: false }
  if (kind === 'skip') {
    if (s === 'enrolled' || s === 'waitlist') return { label: 'досі записаний — вирішіть вручну', warn: true }
    if (s === 'cancelled') return { label: 'не йде (запис скасовано)', warn: false }
    return { label: 'не записаний', warn: false }
  }
  if (s === 'enrolled') return { label: 'записаний', warn: false }
  if (s === 'waitlist') return { label: 'у черзі — немає місць', warn: true }
  if (s === 'cancelled') return { label: 'запис скасовано вручну', warn: false }
  return { label: 'запису немає', warn: true }
}

function PlannedDetailModal({ row, isStaff, viewerTrainerId, onClose, onChanged, onEditPeriod }: {
  row: PlannedRegisterRow
  isStaff: boolean
  viewerTrainerId?: string
  onClose: () => void
  onChanged: () => void
  onEditPeriod: () => void
}) {
  const kind = row.kind as PlannedKind
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openClassId, setOpenClassId] = useState<string | null>(null)

  const { data: dates, loading, error, refetch } = useAsync(
    () => listPlannedItemDates(supabase, {
      seriesId: row.series_id,
      clientId: kind === 'temp_template' ? null : row.client_id,
      from: row.date_from,
      to: row.date_to,
    }),
    [row.id]
  )

  const canCancel = kind === 'skip' || kind === 'enroll'
  const canEditPeriod = kind === 'temp_regular' || (kind === 'temp_template' && isStaff)

  async function doCancel() {
    setBusy(true)
    const { error } = await cancelPlannedChange(supabase, row.id)
    setBusy(false)
    if (error) { toast.error(error); return }
    toast.success('Зміну скасовано')
    onChanged()
  }

  const title = `${KIND_LABEL[kind]}${row.client_name ? ` · ${row.client_name}` : ''}`

  const footer = (
    <>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Закрити</button>
      {canEditPeriod && <button type="button" className="btn-secondary" onClick={onEditPeriod}>Змінити період</button>}
      {canCancel && (confirmCancel ? (
        <button type="button" className="btn-danger" onClick={doCancel} disabled={busy}>
          {busy ? 'Скасування...' : 'Підтвердити скасування'}
        </button>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setConfirmCancel(true)}>Скасувати зміну</button>
      ))}
    </>
  )

  return (
    <>
      <ModalShell title={title} onClose={onClose} footer={footer}>
        <div className={styles.detailMeta}>
          <span>{row.series_title}</span>
          <span className={styles.dot}>·</span>
          <span>{periodLabel(row.date_from, row.date_to)}</span>
          {row.trainer_name && (<><span className={styles.dot}>·</span><span>{row.trainer_name}</span></>)}
          <span className={styles.dot}>·</span>
          <StatusBadge row={row} />
        </div>
        {row.note && <p className={styles.stepHint}>{row.note}</p>}
        {confirmCancel && (
          <p className={styles.stepHint} role="alert">
            Нові тижні відкриватимуться без цієї зміни. Уже застосоване до відкритих занять не відкотиться —
            за потреби поправте вручну.
          </p>
        )}

        {loading && !dates ? (
          <p className={styles.muted}>Завантаження...</p>
        ) : error ? (
          <p className={styles.previewError}>{error}</p>
        ) : (dates ?? []).length === 0 ? (
          <p className={styles.muted}>Занять у цьому періоді немає</p>
        ) : (
          <ul className={styles.dateList}>
            {(dates ?? []).map((d, i) => {
              const r = dateResult(kind, d)
              return (
                <li key={d.classId ?? `p${i}`} className={styles.dateRow}>
                  <span className={styles.dateRowDate}>{kyivDateLabel(d.startsAt)}</span>
                  <span className={styles.dateRowResult} style={r.warn ? { color: 'var(--warning-text)' } : undefined}>{r.label}</span>
                  {d.classId && (
                    <button type="button" className={styles.linkBtn} onClick={() => setOpenClassId(d.classId)}>
                      Відкрити
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ModalShell>

      {openClassId && (
        <ClassDetailModal
          classId={openClassId}
          isStaff={isStaff}
          viewerTrainerId={viewerTrainerId}
          onClose={() => { setOpenClassId(null); refetch() }}
          onClassUpdated={refetch}
        />
      )}
    </>
  )
}
