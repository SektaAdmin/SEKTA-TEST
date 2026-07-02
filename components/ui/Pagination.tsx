import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './Pagination.module.css'

const PAGE_SIZES = [20, 50, 100] as const
type PageSize = typeof PAGE_SIZES[number]

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const pages: (number | '...')[] = [0]
  if (current > 2) pages.push('...')
  const start = Math.max(1, current - 1)
  const end = Math.min(total - 2, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 3) pages.push('...')
  pages.push(total - 1)
  return pages
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (size: PageSize) => void
  pageSizeLabel?: string
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizeLabel = 'на сторінці',
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  const from = page * pageSize

  return (
    <div className={styles.pagination}>
      <div className={styles.left}>
        <select
          className={styles.sizeSelect}
          value={pageSize}
          onChange={e => onPageSize(Number(e.target.value) as PageSize)}
          aria-label={pageSizeLabel}
        >
          {PAGE_SIZES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className={styles.info}>
          {total === 0 ? '0' : `${from + 1}–${Math.min(from + pageSize, total)}`} з {total}
        </span>
      </div>

      {totalPages > 1 ? (
        <div className={styles.btns}>
          <button
            className={styles.btn}
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
            aria-label="Попередня сторінка"
          ><ChevronLeft size={16} /></button>

          {getPageRange(page, totalPages).map((p, i) =>
            p === '...'
              ? <span key={`el-${i}`} className={styles.ellipsis}>…</span>
              : <button
                  key={p}
                  className={`${styles.btn}${p === page ? ` ${styles.btnActive}` : ''}`}
                  onClick={() => onPage(p as number)}
                  aria-current={p === page ? 'page' : undefined}
                >{(p as number) + 1}</button>
          )}

          <button
            className={styles.btn}
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages - 1}
            aria-label="Наступна сторінка"
          ><ChevronRight size={16} /></button>
        </div>
      ) : <div />}
    </div>
  )
}

export type { PageSize }
