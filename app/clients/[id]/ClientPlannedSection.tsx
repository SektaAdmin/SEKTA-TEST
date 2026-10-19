'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import PlannedChangeModal from '@/components/planned/PlannedChangeModal'
import { listPlannedRegister } from '@/lib/queries/planned'
import { KIND_LABEL, STATUS_LABEL, periodLabel, statusBadgeClass, type PlannedKind, type PlannedStatus } from '@/lib/planned'
import styles from './client-profile.module.css'

/* Ярлик «Запланованого» в картці клієнта: активні паузи / записи наперед /
   тимчасові постійництва + «Запланувати» (майстер із підставленим клієнтом).
   Повний реєстр і розбір «потребує уваги» — /planned. */
export default function ClientPlannedSection({ clientId, clientName, onChanged }: {
  clientId: string
  clientName: string
  /** Зміна могла скасувати/додати майбутні записи — перечитати картку. */
  onChanged: () => void
}) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const { data, refetch } = useAsync(() => listPlannedRegister(supabase, { clientId }), [clientId])
  const rows = data ?? []

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.sectionTitle}>Заплановані зміни</h2>
        <button className="btn-primary" onClick={() => setWizardOpen(true)}>Запланувати</button>
      </div>
      {rows.length === 0 ? (
        <div className={styles.emptySection}>
          <span className={styles.empty2}>Пауз і записів наперед немає</span>
        </div>
      ) : (
        <div className={styles.sessionCards}>
          {rows.map(r => (
            <div key={`${r.kind}-${r.id}`} className={styles.sessionCard}>
              <span className={styles.sessionType}>
                {KIND_LABEL[r.kind as PlannedKind]} · {r.series_title} · {periodLabel(r.date_from, r.date_to)}
              </span>
              <span className={statusBadgeClass(r.status)}>{STATUS_LABEL[r.status as PlannedStatus] ?? r.status}</span>
            </div>
          ))}
          <Link href="/planned" className={styles.empty2}>Усі в «Запланованому» →</Link>
        </div>
      )}

      {wizardOpen && (
        <PlannedChangeModal
          canEditTemplates
          prefill={{ client: { id: clientId, name: clientName } }}
          onClose={() => setWizardOpen(false)}
          onSaved={() => { setWizardOpen(false); refetch(); onChanged() }}
        />
      )}
    </section>
  )
}
