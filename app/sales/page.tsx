'use client'
import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import SaleModal from '@/components/SaleModal'
import SalesDateRangePicker from '@/components/SalesDateRangePicker'
import { useRefs } from '@/contexts/RefsContext'
import { useSales, PAGE_SIZES, type PageSize } from '@/hooks/useSales'
import { formatClientName, formatSaleDatetime, formatMoney } from '@/lib/formatters'
import { paymentLabel, paymentClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import type { Sale } from '@/types'
import Pagination from '@/components/ui/Pagination'
import styles from './sales.module.css'

export default function SalesPage() {
  const { tickets, trainers } = useRefs()
  const activeTickets = tickets.filter(t => t.is_active)
  const activeTrainers = trainers.filter(t => t.is_active)

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

  const { sales, total, loading, fetchError, refetch } = useSales({ page, pageSize, search, dateFrom, dateTo })

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const totalPages = Math.ceil(total / pageSize)
  const from = page * pageSize
  const hasFilters = search.trim() !== '' || dateFrom !== '' || dateTo !== ''

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
    toast.success('Продаж видалено')
    refetch()
  }

  function handleSaved() {
    setShowModal(false)
    setEditSale(null)
    toast.success('Збережено')
    refetch()
  }

  function handlePageSize(size: PageSize) {
    setPageSize(size)
    setPage(0)
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className="page-title">Продажи</h1>
          <button className="btn-primary" onClick={() => { setEditSale(null); setShowModal(true) }}>
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

          <SalesDateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChangeFrom={handleDateFrom}
            onChangeTo={handleDateTo}
            onClear={() => { setDateFrom(''); setDateTo(''); setPage(0) }}
          />

          {hasFilters && (
            <button className={styles.filterClear} onClick={clearFilters}>
              Скинути
            </button>
          )}
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className="loading-dots"><span /><span /><span /></div>
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : sales.length === 0 ? (
            <div className={styles.empty}>
              <span>{search || dateFrom || dateTo ? MSG.empty.salesFiltered : MSG.empty.sales}</span>
              {!search && !dateFrom && !dateTo && (
                <button className="btn-primary" onClick={() => { setEditSale(null); setShowModal(true) }}>+ Записати продаж</button>
              )}
            </div>
          ) : (
            <>
            {/* ── Десктоп: таблиця ── */}
            <div className={`data-table-wrap ${styles.tableDesktop}`}>
              <table className="data-table">
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
                        {s.ticket_price != null ? formatMoney(s.ticket_price) : '—'}
                      </td>
                      <td className={styles.price}>
                        {s.ticket_id != null && s.payment_method !== 'deposit'
                          ? formatMoney(s.price_paid)
                          : '—'}
                      </td>
                      <td className={styles.deposit}>
                        {depDelta !== 0 ? (
                          <span className={depDelta > 0 ? styles.depositPos : styles.depositNeg}>
                            {depDelta > 0 ? '+' : ''}{formatMoney(depDelta)}
                          </span>
                        ) : <span className={styles.depositZero}>—</span>}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[paymentClass(s.payment_method)]}`}>
                          {paymentLabel(s.payment_method)}
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

            {/* ── Мобільний: картки ── */}
            <div className={styles.cardList}>
              {sales.map(s => {
                const depDelta = s.amount_given - s.price_paid
                const isDeposit = !s.ticket_id
                return (
                  <div key={s.id} className={styles.card}>
                    <div className={styles.cardRow}>
                      <span className={styles.cardClient}>{formatClientName(s.clients)}</span>
                      <span className={styles.cardDate}>{formatSaleDatetime(s.created_at)}</span>
                    </div>
                    <div className={styles.cardOperation}>
                      {s.ticket_name
                        ? s.ticket_name
                        : depDelta >= 0
                          ? <span className={styles.opTopup}>↑ Поповнення</span>
                          : <span className={styles.opDeduction}>↓ Списання</span>
                      }
                    </div>
                    <div className={styles.cardMeta}>
                      {!isDeposit && s.payment_method !== 'deposit' && (
                        <>
                          <span className={styles.cardMetaLabel}>Оплачено</span>
                          <span className={styles.cardMetaValue}>{formatMoney(s.price_paid)}</span>
                          <span>·</span>
                        </>
                      )}
                      <span className={`${styles.badge} ${styles[paymentClass(s.payment_method)]}`}>
                        {paymentLabel(s.payment_method)}
                      </span>
                    </div>
                    {depDelta !== 0 && (
                      <div className={styles.cardMeta}>
                        <span className={styles.cardMetaLabel}>Депозит</span>
                        <span className={depDelta > 0 ? styles.depositPos : styles.depositNeg}>
                          {depDelta > 0 ? '+' : ''}{formatMoney(depDelta)}
                        </span>
                      </div>
                    )}
                    {s.trainers?.name && (
                      <div className={styles.cardTrainer}>Тренер: {s.trainers.name}</div>
                    )}
                    <div className={styles.cardActions}>
                      <button className={styles.btnEdit} onClick={() => { setEditSale(s); setShowModal(true) }}>
                        Змінити
                      </button>
                      <button className={styles.btnDel} onClick={() => setDeleteId(s.id)}>
                        Видалити
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={styles.paginationDesktop}>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPage={setPage}
                onPageSize={handlePageSize}
                pageSizeLabel="Продажів на сторінці"
              />
            </div>
            </>
          )}
        </div>

        {!loading && !fetchError && sales.length > 0 && (
          <div className={styles.paginationMobile}>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
              onPageSize={handlePageSize}
              pageSizeLabel="Продажів на сторінці"
            />
          </div>
        )}
      </main>

      {showModal && (
        <SaleModal
          onClose={() => { setShowModal(false); setEditSale(null) }}
          onSaved={handleSaved}
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
