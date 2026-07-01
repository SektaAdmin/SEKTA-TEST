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

/* Mobile-фокус: чип показує один блок (або «Всі» стопкою). Ховання через CSS
   (display:none) — блоки лишаються змонтованими, realtime-підписки живі. */
const BLOCK_CHIPS = [
  { key: 'all', label: 'Всі' },
  { key: 'rental', label: 'Оренда залу' },
  { key: 'spaces', label: 'Вільні місця' },
  { key: 'debtors', label: 'Боржники' },
  { key: 'today', label: 'Сьогодні в мінус' },
] as const

type BlockFocus = (typeof BLOCK_CHIPS)[number]['key']

export default function DashboardPage() {
  // Дата перераховується при поверненні на вкладку — пульт тримають відкритим весь день,
  // після опівночі має показати новий день, а не той, що був на момент монтування.
  const [today, setToday] = useState(() => toYMD(new Date()))
  const [focus, setFocus] = useState<BlockFocus>('all')

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
          <div className={`filterChips ${styles.blockChips}`}>
            {BLOCK_CHIPS.map(c => (
              <button
                key={c.key}
                type="button"
                className={`filterChip ${focus === c.key ? 'filterChipActive' : ''}`}
                aria-pressed={focus === c.key}
                onClick={() => setFocus(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`page-body ${styles.body}`}>
          <div className={styles.grid} data-focus={focus}>
            <FreeSlotsBlock date={today} />
            <FreeSpacesBlock date={today} />
            <DebtorListsBlock date={today} />
            <SessionDebtBlock date={today} />
          </div>
        </div>
      </main>
    </div>
  )
}
