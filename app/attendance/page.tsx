'use client'
import { useRouter } from 'next/navigation'
import AttendanceView from '@/components/attendance/AttendanceView'
import styles from './attendance.module.css'

export default function AttendancePage() {
  const router = useRouter()
  return (
    <>
      <div className="page-head">
        <div className={styles.topbar}>
          <h1 className="page-title">Відвідуваність</h1>
        </div>
      </div>
      <div className={`page-body ${styles.content}`}>
        <AttendanceView showTrainerFilter onRowClick={r => router.push(`/clients/${r.client_id}`)} />
      </div>
    </>
  )
}
