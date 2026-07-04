'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { toYMD, DOW_LABELS_FULL, MONTHS_UK_FULL } from '@/lib/dateUtils'
import { DebtorListsBlock } from './_components/DebtorListsBlock'
import { SessionDebtBlock } from './_components/SessionDebtBlock'
import { FreeSlotsBlock } from './_components/FreeSlotsBlock'
import { FreeSpacesBlock } from './_components/FreeSpacesBlock'
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
            <h1 className="page-title">Дашборд</h1>
            <span className={styles.headDate}>{headerDate}</span>
          </div>
        </div>

        <div className={`page-body ${styles.body}`}>
          {/* Операційний ряд: що можна здати (оренда) + куди посадити (вільні місця).
              Danger-алерт «нема кому відкрити зал» живе всередині FreeSlotsBlock. */}
          <div className={styles.opsRow}>
            <FreeSlotsBlock date={today} />
            <FreeSpacesBlock date={today} />
          </div>

          {/* Довідковий шар — на всю ширину. Спершу оперативний звіт боржників
              сьогодні (завжди розгорнутий), нижче — повна таблиця боржників по
              сесіях (складається; за замовчуванням згорнута). */}
          <SessionDebtBlock date={today} />
          <DebtorListsBlock date={today} />
        </div>
      </main>
    </div>
  )
}
