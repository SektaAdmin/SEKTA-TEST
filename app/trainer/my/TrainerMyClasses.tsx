'use client'
import { useState } from 'react'
import { MONTHS_UK_SHORT } from '@/lib/dateUtils'
import type { TrainerClassRow } from '@/lib/queries/trainer-cabinet'
import styles from '../trainer.module.css'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ClassList({ classes, empty }: { classes: TrainerClassRow[]; empty: string }) {
  if (classes.length === 0) return <p className={styles.empty}>{empty}</p>
  return (
    <ul className={styles.list}>
      {classes.map(c => {
        const d = new Date(c.starts_at)
        return (
          <li key={c.id} className={`${styles.item} ${c.is_cancelled ? styles.cancelled : ''}`}>
            <div className={styles.date}>
              <span className={styles.day}>{d.getDate()}</span>
              <span className={styles.month}>{MONTHS_UK_SHORT[d.getMonth()]}</span>
            </div>
            <div className={styles.info}>
              <div className={styles.title}>{c.title || c.ticket_type}</div>
              <div className={styles.meta}>
                {timeOf(c.starts_at)} · {c.duration_min} хв
                {c.halls?.name ? ` · ${c.halls.name}` : ''}
              </div>
              {c.choreo_stage && <div className={styles.choreo}>Етап: {c.choreo_stage}</div>}
            </div>
            {c.is_cancelled && <span className={styles.badge}>Скасовано</span>}
          </li>
        )
      })}
    </ul>
  )
}

type Props = {
  upcoming: TrainerClassRow[]
  past: TrainerClassRow[]
}

export default function TrainerMyClasses({ upcoming, past }: Props) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  return (
    <div className={styles.scroll}>
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${tab === 'upcoming' ? styles.tabActive : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Майбутні ({upcoming.length})
        </button>
        <button
          className={`${styles.tab} ${tab === 'past' ? styles.tabActive : ''}`}
          onClick={() => setTab('past')}
        >
          Минулі
        </button>
      </div>
      {tab === 'upcoming'
        ? <ClassList classes={upcoming} empty="Найближчих занять немає." />
        : <ClassList classes={past} empty="Минулих занять немає." />
      }
    </div>
  )
}
