'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { toYMD, DOW_LABELS_FULL, MONTHS_UK_FULL } from '@/lib/dateUtils'
import { MoneyCardsBlock } from './_components/MoneyCardsBlock'
import { AlertCardsBlock } from './_components/AlertCardsBlock'
import { SessionDebtBlock } from './_components/SessionDebtBlock'
import { FreeSlotsBlock } from './_components/FreeSlotsBlock'
import { FreeSpacesBlock } from './_components/FreeSpacesBlock'
import { TrainerCashBlock } from './_components/TrainerCashBlock'
import styles from './dashboard.module.css'

export default function DashboardPage() {
  // Дата перераховується при поверненні на вкладку — пульт тримають відкритим весь день,
  // після опівночі має показати новий день, а не той, що був на момент монтування.
  const [today, setToday] = useState(() => toYMD(new Date()))

  useEffect(() => {
    const sync = () => setToday(toYMD(new Date()))
    document.addEventListener('visibilitychange', sync)
    const id = setInterval(sync, 60_000)
    return () => { document.removeEventListener('visibilitychange', sync); clearInterval(id) }
  }, [])

  const now = new Date(`${today}T00:00:00`)
  const headerDate = `${DOW_LABELS_FULL[now.getDay()]}, ${now.getDate()} ${MONTHS_UK_FULL[now.getMonth()]}`

  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className={`page-main ${styles.dashboard}`}>
        <div className="page-head">
          <div className={styles.head}>
            <h1 className={styles.title}>Дашборд</h1>
            <span className={styles.headDate}>{headerDate}</span>
          </div>
        </div>

        <div className={`page-body ${styles.body}`}>
          {/* Гроші за день + алерти — дві окремі групи з мітками */}
          <div className={styles.statGroups}>
            <div className={styles.statGroup}>
              <span className={styles.groupLabel}>Гроші сьогодні</span>
              <div className={styles.groupCards}>
                <MoneyCardsBlock date={today} />
              </div>
            </div>
            <div className={styles.statGroupDivider} />
            <div className={styles.statGroup}>
              <span className={styles.groupLabel}>Потребує уваги</span>
              <div className={styles.groupCards}>
                <AlertCardsBlock date={today} />
              </div>
            </div>
          </div>

          {/* Боржники по сесіях + вільні місця на заняттях */}
          <div className={styles.twoCol}>
            <SessionDebtBlock date={today} />
            <FreeSpacesBlock date={today} />
          </div>

          {/* Розклад: вільні слоти залів + готівка тренерів */}
          <div className={styles.twoCol}>
            <FreeSlotsBlock date={today} />
            <TrainerCashBlock date={today} />
          </div>
        </div>
      </main>
    </div>
  )
}
