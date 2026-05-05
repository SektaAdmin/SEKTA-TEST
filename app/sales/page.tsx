'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SaleModal from '@/components/features/SaleModal'
import { useTickets } from '@/hooks/useTickets'
import { useTrainers } from '@/hooks/useTrainers'
import { formatClientName, formatSaleDatetime } from '@/lib/formatters'
import type { Sale, PaymentMethod } from '@/types'
import styles from './sales.module.css'

const supabase = createClient()

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Готівка',
  fop: 'ФОП',
  personal_card: 'Особиста карта',
  deposit: 'Депозит',
}

const PAYMENT_CLASS: Record<PaymentMethod, string> = {
  cash: styles.badgeCash,
  fop: styles.badgeFop,
  personal_card: styles.badgeCard,
  deposit: styles.badgeDeposit,
}

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

export default function SalesPage() {
  const { tickets } = useTickets()
  const { trainers } = useTrainers()
  const activeTickets = tickets.filter(t => t.is_active)
  const activeTrainers = trainers.filter(t => t.is_active)

  const [sales, setSales] = useState<Sale[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editSale, setEditSale] = useState<Sale | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(20)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalPages = Math.ceil(total / pageSize)
  const from = page * pageSize
  const hasFilters = search.trim() !== '' || dateFrom !== '' || dateTo !== ''

  const fetchSales = useCallback(async (
    p: number, size: number, q: string, from: string, to: string
  ) => {
    setLoading(true)
    setFetchError(null)

    let clientIds: string[] | null = null

    if (q.trim()) {
      const s = q.trim()
      const parts = s.split(/\s+/)
      let cq = supabase.from('clients').select('id')
      if (parts.length === 1) {
        cq = cq.or(`first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[0]}%`)
      } else {
        const [a, b] = parts
        cq = cq.or(
          `first_name.ilike.%${a}%,last_name.ilike.%${b}%,` +
          `first_name.ilike.%${b}%,last_name.ilike.%${a}%`
        )
      }
      const { data: matched } = await cq.limit(200)
      clientIds = (matched ?? []).map((c: { id: string }) => c.id)
      if (clientIds.length === 0) {
        setSales([]); setTotal(0); setLoading(false); return
      }
    }

    const rangeFrom = p * size
    let query = supabase
      .from('sales')
      .select(`
        id, created_at, client_id, ticket_id, trainer_id,
        ticket_name, ticket_price, ticket_type, sessions, price_paid, amount_given,
        payment_method, notes,
        clients(first_name, last_name),
        tickets(name),
        trainers(name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(rangeFrom, rangeFrom + size - 1)

    if (clientIds !== null) query = query.in('client_id', clientIds)
    if (from) query = query.gte('created_at', `${from}T00:00:00`)
    if (to)   query = query.lte('created_at', `${to}T23:59:59`)

    const { data, count, error } = await query
    if (error) {
      setFetchError(error.message)
    } else {
      setSales((data as unknown as Sale[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSales(page, pageSize, search, dateFrom, dateTo)
  }, [page, pageSize, search, dateFrom, dateTo, fetchSales])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchSales(page, pageSize, search, dateFrom, dateTo)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchSales, page, pageSize, search, dateFrom, dateTo])

  function handleSearchInput(value: string) {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(value); setPage(0) }, 300)
  }

  function handleDateFrom(value: string) { setDateFrom(value); setPage(0) }
  function handleDateTo(value: string)   { setDateTo(value);   setPage(0) }

  function clearFilters() {
    setSearchInput(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(0)
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError('')

    const { data, error } = await supabase.rpc('delete_sale', { p_sale_id: deleteId })
    if (error || !data?.[0]?.success) {
      setDeleteError(error?.message ?? data?.[0]?.error_message ?? 'Помилка видалення')
      setDeleting(false)
      return
    }

    setDeleteId(null)
    setDeleting(false)
    fetchSales(page, pageSize, search, dateFrom, dateTo)
  }

  function handleSaved() {
    setShowModal(false)
    setEditSale(null)
    fetchSales(page, pageSize, search, dateFrom, dateTo)
  }

  function handlePageSize(size: PageSize) {
    setPageSize(size)
    setPage(0)
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Продажи</h1>
          <button className={styles.btnNew} onClick={() => { setEditSale(null); setShowModal(true) }}>
            + Нова продажа
          </button>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterSearch}>
            <svg className={styles.filterSearchIcon} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
            </svg>
            <input
              className={styles.filterSearchInput}
              type="text"
              value={searchInput}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="Пошук за клієнтом..."
              aria-label="Пошук за клієнтом"
            />
          </div>

          <div className={styles.filterDates}>
            <span className={styles.filterLabel}>Від</span>
            <input
              className={styles.filterDate}
              type="date"
              value={dateFrom}
              onChange={e => handleDateFrom(e.target.value)}
              aria-label="Дата від"
            />
            <span className={styles.filterLabel}>До</span>
            <input
              className={styles.filterDate}
              type="date"
              value={dateTo}
              onChange={e => handleDateTo(e.target.value)}
              aria-label="Дата до"
            />
          </div>

          {hasFilters && (
            <button className={styles.filterClear} onClick={clearFilters}>
              Скинути
            </button>
          )}
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : sales.length === 0 ? (
            <div className={styles.empty}>Продажів ще немає</div>
          ) : (
            <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Клієнт</th>
                    <th>Операція</th>
                    <th>Занять</th>
                    <th>Ціна</th>
                    <th>Оплачено</th>
                    <th>Δ Депозит</th>
                    <th>Оплата</th>
                    <th>Тренер</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => {
                    const depDelta = s.amount_given - s.price_paid
                    return (
                    <tr key={s.id}>
                      <td className={styles.date}>{formatSaleDatetime(s.created_at)}</td>
                      <td>{formatClientName(s.clients)}</td>
                      <td>
                        {s.ticket_name
                          ? s.ticket_name
                          : depDelta >= 0
                            ? <span className={styles.opTopup}>↑ Поповнення</span>
                            : <span className={styles.opDeduction}>↓ Списання</span>
                        }
                      </td>
                      <td className={styles.sessions}>{s.sessions ?? '—'}</td>
                      <td className={styles.price}>
                        {s.ticket_price != null ? `${s.ticket_price.toLocaleString('uk-UA')} ₴` : '—'}
                      </td>
                      <td className={styles.price}>
                        {s.ticket_id != null && s.payment_method !== 'deposit'
                          ? `${s.price_paid.toLocaleString('uk-UA')} ₴`
                          : '—'}
                      </td>
                      <td className={styles.deposit}>
                        {depDelta !== 0 ? (
                          <span className={depDelta > 0 ? styles.depositPos : styles.depositNeg}>
                            {depDelta > 0 ? '+' : ''}{depDelta.toLocaleString('uk-UA')} ₴
                          </span>
                        ) : <span className={styles.depositZero}>—</span>}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${PAYMENT_CLASS[s.payment_method]}`}>
                          {PAYMENT_LABELS[s.payment_method]}
                        </span>
                      </td>
                      <td className={styles.trainer}>{s.trainers?.name ?? '—'}</td>
                      <td>
                        <div className={styles.actions}>
                          <button className={styles.btnEdit} onClick={() => { setEditSale(s); setShowModal(true) }}>
                            Змінити
                          </button>
                          <button className={styles.btnDel} onClick={() => setDeleteId(s.id)}>
                            Видалити
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <div className={styles.paginationLeft}>
                <select
                  className={styles.pageSizeSelect}
                  value={pageSize}
                  onChange={e => handlePageSize(Number(e.target.value) as PageSize)}
                  aria-label="Продажів на сторінці"
                >
                  {PAGE_SIZES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span className={styles.paginationInfo}>
                  {total === 0 ? '0' : `${from + 1}–${Math.min(from + pageSize, total)}`} з {total}
                </span>
              </div>

              {totalPages > 1 ? (
                <div className={styles.paginationBtns}>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 0}
                    aria-label="Попередня сторінка"
                  >←</button>

                  {getPageRange(page, totalPages).map((p, i) =>
                    p === '...'
                      ? <span key={`el-${i}`} className={styles.pageEllipsis}>…</span>
                      : <button
                          key={p}
                          className={`${styles.pageBtn}${p === page ? ` ${styles.pageBtnActive}` : ''}`}
                          onClick={() => setPage(p as number)}
                          aria-current={p === page ? 'page' : undefined}
                        >{(p as number) + 1}</button>
                  )}

                  <button
                    className={styles.pageBtn}
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    aria-label="Наступна сторінка"
                  >→</button>
                </div>
              ) : <div />}
            </div>
            </>
          )}
        </div>
      </main>

      {showModal && (
        <SaleModal
          onClose={() => { setShowModal(false); setEditSale(null) }}
          onSaved={handleSaved}
          tickets={activeTickets}
          trainers={activeTrainers}
          editSale={editSale ? {
            id: editSale.id,
            client_id: editSale.client_id,
            client_name: formatClientName(editSale.clients),
            ticket_id: editSale.ticket_id,
            ticket_name: editSale.ticket_name,
            ticket_price: editSale.ticket_price,
            ticket_type: editSale.ticket_type,
            sessions: editSale.sessions,
            trainer_id: editSale.trainer_id,
            trainer_name: editSale.trainers?.name ?? null,
            price_paid: editSale.price_paid,
            amount_given: editSale.amount_given,
            payment_method: editSale.payment_method,
            notes: editSale.notes,
            created_at: editSale.created_at,
          } : undefined}
        />
      )}

      {deleteId && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>Видалити продажу?</h3>
            <p>Цю дію неможливо скасувати.</p>
            {deleteError && <p className={styles.confirmError}>{deleteError}</p>}
            <div className={styles.confirmBtns}>
              <button className={styles.btnCancel} onClick={() => { setDeleteId(null); setDeleteError('') }}>Скасувати</button>
              <button className={styles.btnConfirmDel} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
