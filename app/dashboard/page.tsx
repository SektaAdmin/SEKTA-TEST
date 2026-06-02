'use client'
import { useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { toYMD, DOW_LABELS_FULL, MONTHS_UK_FULL } from '@/lib/dateUtils'
import { FopTodayCard } from './_components/FopTodayCard'
import { SessionDebtBlock } from './_components/SessionDebtBlock'
import { FreeSlotsBlock } from './_components/FreeSlotsBlock'
import { TrainerCashBlock } from './_components/TrainerCashBlock'
import styles from './dashboard.module.css'

export default function DashboardPage() {
  const now = useMemo(() => new Date(), [])
  const today = toYMD(now)
  const headerDate = `${DOW_LABELS_FULL[now.getDay()]}, ${now.getDate()} ${MONTHS_UK_FULL[now.getMonth()]}`

  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main">
        <div className="page-head">
          <div className={styles.head}>
            <h1 className={styles.title}>Дашборд</h1>
            <span className={styles.headDate}>{headerDate}</span>
          </div>
        </div>

        <div className={`page-body ${styles.body}`}>
          <div className={styles.topCards}>
            <FopTodayCard date={today} />
          </div>

          <SessionDebtBlock date={today} />

          <div className={styles.twoCol}>
            <FreeSlotsBlock date={today} />
            <TrainerCashBlock date={today} />
          </div>
        </div>
      </main>
    </div>
  )
}
