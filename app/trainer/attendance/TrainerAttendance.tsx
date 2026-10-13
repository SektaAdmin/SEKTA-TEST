'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AttendanceView from '@/components/attendance/AttendanceView'
import ClientSessionsModal from '@/app/trainer/clients/ClientSessionsModal'
import type { TrainerClientRow } from '@/lib/queries/trainer-cabinet'
import styles from './attendance.module.css'

export default function TrainerAttendance() {
  const router = useRouter()
  const [selected, setSelected] = useState<TrainerClientRow | null>(null)

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/trainer')} aria-label="Меню">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
          <span>Меню</span>
        </button>
        <span className={styles.topbarTitle}>Відвідуваність</span>
        <span className={styles.topbarSpacer} />
      </div>

      <div className={styles.scroll}>
        <AttendanceView
          showTrainerFilter={false}
          compact
          onRowClick={r => setSelected({ id: r.client_id, first_name: r.first_name, last_name: r.last_name, balance: r.balance })}
        />
      </div>

      {selected && <ClientSessionsModal client={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
