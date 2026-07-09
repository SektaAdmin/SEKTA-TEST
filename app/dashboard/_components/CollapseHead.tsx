'use client'
import styles from '../dashboard.module.css'

interface Props {
  title: string
  open: boolean
  onToggle: () => void
  /** Кількість — бейдж поруч із назвою (не показується при 0/undefined). */
  count?: number
  /** Правий слот (напр. CopyButton) — лишається видимим і в згорнутому стані. */
  right?: React.ReactNode
}

/* Спільна складана шапка блоку дашборду: шеврон + назва + бейдж-лічильник
   ліворуч (клікабельна кнопка розкриття), опційний правий слот, що не
   ховається при згортанні (див. DebtorListsBlock / SessionDebtBlock).
   Розмітка за WAI-ARIA Accordion: <h2> обгортає кнопку-тогл (heading не може
   лежати всередині button — phrasing content only). */
export function CollapseHead({ title, open, onToggle, count, right }: Props) {
  return (
    <div className={styles.collapseHeadRow}>
      <h2 className={styles.collapseHeadTitle}>
        <button
          type="button"
          className={styles.collapseHead}
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className={`${styles.collapseChevron} ${open ? styles.collapseChevronOpen : ''}`} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 4.5l3.5 3.5 3.5-3.5" />
            </svg>
          </span>
          <span className={styles.blockTitle}>{title}</span>
          {!!count && <span className="badge badge-type">{count}</span>}
        </button>
      </h2>
      {right}
    </div>
  )
}
