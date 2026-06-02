'use client'
import type { ReactNode } from 'react'
import Link from 'next/link'
import styles from './StatCard.module.css'

/* Канон KPI-картки. value передавати ВЖЕ форматованим (formatMoney тощо).
   Якщо href — вся картка стає клікабельним посиланням.
   Не плодити локальні .balanceBlock-копії — використовувати цей компонент. */

interface Props {
  label: string
  value: ReactNode      // вже форматований рядок/нода
  hint?: ReactNode
  href?: string
  accent?: 'default' | 'danger' | 'success'
  loading?: boolean     // скелет замість value (не плодити '…'-рядки)
}

export function StatCard({ label, value, hint, href, accent = 'default', loading = false }: Props) {
  const cls = `${styles.card} ${accent !== 'default' ? styles[accent] : ''} ${href ? styles.clickable : ''}`
  const inner = (
    <>
      <div className={styles.label}>{label}</div>
      {loading
        ? <div className={styles.skeleton} />
        : <div className={styles.value}>{value}</div>}
      {hint != null && <div className={styles.hint}>{hint}</div>}
    </>
  )

  if (href) {
    return <Link href={href} className={cls}>{inner}</Link>
  }
  return <div className={cls}>{inner}</div>
}
