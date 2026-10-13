'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, CornerDownLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import { useRefs } from '@/contexts/RefsContext'
import { listMyStageClasses, type TrainerStageClassRow } from '@/lib/queries/trainer-cabinet'
import { updateClassChoreoStage } from '@/lib/queries/classes'
import { buildStageGroups } from '@/lib/choreoStages'
import { DOW_LABELS_SHORT, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import styles from './stages.module.css'

type Filter = 'empty' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'empty', label: 'Без етапу' },
  { key: 'all', label: 'Усі' },
]

// Вікно: минулі 14 днів — для «минулого разу» й підказок; майбутні 14 — редагуємо.
const WINDOW_DAYS = 14

function dayLabel(iso: string): string {
  const d = new Date(iso)
  return `${DOW_LABELS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_UK_GENITIVE[d.getMonth()]}`
}

type Props = { trainerId: string }

export default function TrainerStages({ trainerId }: Props) {
  const router = useRouter()
  const { trainingTypes } = useRefs()
  const [filter, setFilter] = useState<Filter>('empty')
  // Збережені на цьому екрані значення поверх серверних (до наступного refetch).
  const [saved, setSaved] = useState<Record<string, string | null>>({})

  const { data, loading, error } = useAsync(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const from = new Date(today); from.setDate(today.getDate() - WINDOW_DAYS)
    const to = new Date(today); to.setDate(today.getDate() + WINDOW_DAYS + 1)
    const res = await listMyStageClasses(supabase, trainerId, from.toISOString(), to.toISOString())
    setSaved({})
    return res
  }, [trainerId], { refetchOnVisible: true })

  const groups = useMemo(() => buildStageGroups(data ?? [], new Date()), [data])

  // Фільтр — за серверним станом, не за `saved`: інакше рядок зникав би
  // одразу після збереження, під пальцем тренера.
  const visible = groups
    .map(g => ({ g, rows: filter === 'all' ? g.upcoming : g.upcoming.filter(c => !c.choreo_stage) }))
    .filter(v => v.rows.length > 0)

  function typeLabel(code: string): string {
    return trainingTypes.find(t => t.code === code)?.label ?? code
  }

  function currentValue(c: TrainerStageClassRow): string {
    return (c.id in saved ? saved[c.id] : c.choreo_stage) ?? ''
  }

  async function save(c: TrainerStageClassRow, raw: string): Promise<boolean> {
    const value = raw.trim() || null
    if (value === (currentValue(c) || null)) return true
    const { error } = await updateClassChoreoStage(supabase, c.id, value)
    if (error) {
      toast.error('Не вдалося зберегти етап')
      return false
    }
    setSaved(s => ({ ...s, [c.id]: value }))
    return true
  }

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/trainer')} aria-label="Меню">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
          <span>Меню</span>
        </button>
        <span className={styles.topbarTitle}>Етапи занять</span>
        <span className={styles.topbarSpacer} />
      </div>

      <div className={`filterChips ${styles.chips}`} role="tablist">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`filterChip ${filter === f.key ? 'filterChipActive' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.scroll}>
        {loading && !data ? (
          <div className={styles.empty}><span className="loading-dots" /></div>
        ) : error ? (
          <div className={styles.empty}>{MSG.error.dataLoad}</div>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            {groups.length === 0 ? MSG.empty.stageClasses : MSG.empty.stagesAllFilled}
          </div>
        ) : (
          visible.map(({ g, rows }) => (
            <section key={g.key} className={styles.group}>
              <div className={styles.groupHead}>
                <div className={styles.groupTitle}>{g.title || typeLabel(g.ticketType)}</div>
                <div className={styles.groupMeta}>{g.meta}</div>
                <div className={styles.groupLast}>
                  Минулого разу: {g.lastStage ?? <span className={styles.muted}>не вказано</span>}
                </div>
              </div>

              <datalist id={`stages-${g.key}`}>
                {g.stages.map(s => <option key={s} value={s} />)}
              </datalist>

              <ul className={styles.rows}>
                {rows.map(c => {
                  // «Як минулого разу»: для першого майбутнього — останній етап групи,
                  // далі — попереднє заняття групи (рахуємо по повному списку, не відфільтрованому).
                  const i = g.upcoming.indexOf(c)
                  const prev = i === 0 ? g.lastStage : currentValue(g.upcoming[i - 1]) || null
                  return (
                    <StageRow
                      key={c.id}
                      label={dayLabel(c.starts_at)}
                      initial={currentValue(c)}
                      prev={prev}
                      listId={`stages-${g.key}`}
                      onSave={v => save(c, v)}
                    />
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

type RowProps = {
  label: string
  initial: string
  prev: string | null
  listId: string
  onSave: (value: string) => Promise<boolean>
}

function StageRow({ label, initial, prev, listId, onSave }: RowProps) {
  const [draft, setDraft] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function commit(value: string) {
    if (value.trim() === initial.trim()) return
    setState('saving')
    const ok = await onSave(value)
    setState(ok ? 'saved' : 'idle')
  }

  return (
    <li className={styles.row}>
      <label className={styles.rowLabel}>
        <span className={styles.rowDate}>{label}</span>
        {state === 'saved' && (
          <span className={styles.rowSaved}><Check size={12} aria-hidden /> Збережено</span>
        )}
      </label>
      <div className={styles.rowInputWrap}>
        <input
          className={styles.rowInput}
          value={draft}
          list={listId}
          placeholder="Етап хореографії…"
          aria-label={`Етап хореографії, ${label}`}
          disabled={state === 'saving'}
          onChange={e => { setDraft(e.target.value); setState('idle') }}
          onBlur={() => commit(draft)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          enterKeyHint="done"
        />
        {!draft.trim() && prev && (
          <button
            type="button"
            className={styles.copyPrev}
            onClick={() => { setDraft(prev); commit(prev) }}
            title={`Як минулого разу: ${prev}`}
          >
            <CornerDownLeft size={14} aria-hidden />
            <span className={styles.copyPrevText}>{prev}</span>
          </button>
        )}
      </div>
    </li>
  )
}
