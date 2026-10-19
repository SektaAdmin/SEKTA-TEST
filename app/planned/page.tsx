'use client'
import PlannedView from '@/components/planned/PlannedView'
import styles from './planned.module.css'

export default function PlannedPage() {
  return (
    <>
      <div className="page-head">
        <div className={styles.topbar}>
          <h1 className="page-title">Заплановане</h1>
        </div>
      </div>
      <div className={`page-body ${styles.content}`}>
        <PlannedView isStaff />
      </div>
    </>
  )
}
