'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlannedAttention } from '@/hooks/usePlannedAttention'
import { ArrowRightIcon } from '@/components/icons/navigation'
import { KIND_LABEL, periodLabel, type PlannedKind } from '@/lib/planned'
import { CollapseHead } from './CollapseHead'
import styles from '../dashboard.module.css'

/* «Заплановане»: намір не виконався у відкритому тижні (пауза після дедлайну,
   запис наперед у черзі/без запису). Блок існує лише коли є що розбирати —
   сірий спокій за замовчуванням, колір лише для алерту. */
export function PlannedAttentionBlock() {
  const router = useRouter()
  const { rows } = usePlannedAttention()
  const [open, setOpen] = useState(true)

  if (rows.length === 0) return null

  return (
    <section className={styles.fullBlock}>
      <CollapseHead
        title="Заплановане: потребують уваги"
        open={open}
        onToggle={() => setOpen(o => !o)}
        count={rows.length}
      />
      {open && rows.map(r => (
        <button
          key={`${r.kind}-${r.id}`}
          type="button"
          className={styles.spacesRow}
          onClick={() => router.push('/planned')}
        >
          <div className={styles.spacesInfo}>
            <div className={styles.spacesMain}>
              <span className={styles.spacesTime}>{r.client_name ?? r.series_title}</span>
              <span className={styles.spacesType}>{KIND_LABEL[r.kind as PlannedKind]} · {r.series_title}</span>
            </div>
            <div className={styles.spacesChoreo}>
              {periodLabel(r.date_from, r.date_to)} · {r.issues_count} {r.issues_count === 1 ? 'заняття' : 'занять'} без виконання
            </div>
          </div>
          <div className={styles.spacesRight}>
            <span className="badge badge-warning">Розібрати</span>
            <ArrowRightIcon className={styles.spacesChevron} />
          </div>
        </button>
      ))}
    </section>
  )
}
