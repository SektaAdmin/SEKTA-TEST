'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import SaleModal from '@/components/SaleModal'
import StudioExpenseModal from '@/components/StudioExpenseModal'
import SalesDateRangePicker from '@/components/SalesDateRangePicker'
import { useRefs } from '@/contexts/RefsContext'
import { useSales, PAGE_SIZES, type PageSize } from '@/hooks/useSales'
import { listStudioExpenses } from '@/lib/queries/studio-expenses'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import { deleteStudioExpense } from '@/lib/queries/studio-expenses'
import { formatClientName, formatSaleDatetime, formatMoney } from '@/lib/formatters'
import { paymentLabel, paymentClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import type { Sale } from '@/types'
import Pagination from '@/components/ui/Pagination'
import FilterSelect from '@/components/ui/FilterSelect'
import styles from './sales.module.css'

type FeedTab = 'all' | 'sales' | 'expenses'

type FeedItem =
  | { kind: 'sale'; data: Sale }
  | { kind: 'expense'; data: StudioExpense }

export default function SalesPage() {
  const { tickets, trainers } = useRefs()
  const activeTrainers = trainers.filter(t => t.is_active)

  const [showModal, setShowModal]       = useState(false)
  const [editSale, setEditSale]         = useState<Sale | null>(null)
  const [expenseModal, setExpenseModal] = useState(false)
  const [editExpense, setEditExpense]   = useState<StudioExpense | null>(null)
  const [deleteId, setDeleteId]             = useState<string | null>(null)
  const [deleting, setDeleting]             = useState(false)
  const [deleteError, setDeleteError]       = useState('')
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [deletingExpense, setDeletingExpense]  = useState(false)
  const [feedTab, setFeedTab]         = useState<FeedTab>('all')

  const [page, setPage]               = useState(0)
  const [pageSize, setPageSize]       = useState<PageSize>(20)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [expenses, setExpenses]           = useState<StudioExpense[]>([])
  const [expenseMethod, setExpenseMethod]   = useState<'cash' | 'fop' | 'personal_card' | ''>('')
  const [trainerFilter, setTrainerFilter]   = useState<string>('')

  const { sales, total, loading, fetchError, refetch } = useSales({ page, pageSize, search, dateFrom, dateTo, trainerId: feedTab !== 'expenses' ? trainerFilter : '' })

  const fetchExpenses = useCallback(async () => {
    const from = dateFrom || '2000-01-01'
    const to   = dateTo   || '2099-12-31'
    const { data } = await listStudioExpenses(supabase, from, to)
    setExpenses(data ?? [])
  }, [dateFrom, dateTo])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  // unified feed sorted by created_at desc
  const feed = useMemo<FeedItem[]>(() => {
    let filteredExpenses = expenses
    if (expenseMethod) filteredExpenses = filteredExpenses.filter(e => e.payment_method === expenseMethod)
    if (trainerFilter) filteredExpenses = filteredExpenses.filter(e => e.trainer_id === trainerFilter)
    if (feedTab === 'sales')    return sales.map(s => ({ kind: 'sale' as const, data: s }))
    if (feedTab === 'expenses') return filteredExpenses.map(e => ({ kind: 'expense' as const, data: e }))
    const items: FeedItem[] = [
      ...sales.map(s => ({ kind: 'sale' as const, data: s })),
      ...filteredExpenses.map(e => ({ kind: 'expense' as const, data: e })),
    ]
    items.sort((a, b) => b.data.created_at.localeCompare(a.data.created_at))
    return items
  }, [feedTab, sales, expenses, expenseMethod, trainerFilter])

  const totalPages = Math.ceil(total / pageSize)
  const hasFilters = search.trim() !== '' || dateFrom !== '' || dateTo !== '' || expenseMethod !== '' || trainerFilter !== ''

  function handleSearchInput(value: string) {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(value); setPage(0) }, 300)
  }

  function handleDateFrom(value: string) { setDateFrom(value); setPage(0) }
  function handleDateTo(value: string)   { setDateTo(value);   setPage(0) }

  function clearFilters() {
    setSearchInput(''); setSearch(''); setDateFrom(''); setDateTo('')
    setExpenseMethod(''); setTrainerFilter(''); setPage(0)
  }

  function handleTabChange(tab: FeedTab) {
    setFeedTab(tab)
    setPage(0)
    if (tab === 'expenses') { setSearchInput(''); setSearch('') }
    if (tab === 'sales')    { setExpenseMethod('') }
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

  async function handleDeleteExpense() {
    if (!deleteExpenseId) return
    setDeletingExpense(true)
    await deleteStudioExpense(supabase, deleteExpenseId)
    setExpenses(prev => prev.filter(e => e.id !== deleteExpenseId))
    setDeleteExpenseId(null)
    setDeletingExpense(false)
    toast.success('Операцію видалено')
  }

  function handleSaved() {
    setShowModal(false)
    setEditSale(null)
    toast.success('Збережено')
    refetch()
  }

  function handleExpenseSaved() {
    setExpenseModal(false)
    setEditExpense(null)
    fetchExpenses()
  }

  function handlePageSize(size: PageSize) {
    setPageSize(size)
    setPage(0)
  }

  const showPagination = feedTab !== 'expenses' && !loading && !fetchError && total > 0

  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main">
        <div className="page-head">
          <div className={styles.topbar}>
            <h1 className="page-title">Продажі</h1>
            <div className={styles.topbarBtns}>
              <button className={styles.expenseBtn} onClick={() => setExpenseModal(true)}>
                + Студійна операція
              </button>
              <button className="btn-primary" onClick={() => { setEditSale(null); setShowModal(true) }}>
                + Продаж
              </button>
            </div>
          </div>

          <div className={styles.filters}>
            {/* Таби — завжди видимі */}
            <div className={styles.feedTabGroup}>
              {(['all', 'sales', 'expenses'] as FeedTab[]).map(tab => (
                <button
                  key={tab}
                  className={`${styles.feedTab} ${feedTab === tab ? styles.feedTabActive : ''}`}
                  onClick={() => handleTabChange(tab)}
                >
                  {tab === 'all' ? 'Всі' : tab === 'sales' ? 'Продажі' : 'Операції'}
                </button>
              ))}
            </div>

            {/* Пошук по клієнту — тільки для Продажі або Всі */}
            {feedTab !== 'expenses' && (
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
            )}

            {/* Метод оплати — тільки для Операції або Всі */}
            {feedTab !== 'sales' && (
              <FilterSelect
                value={expenseMethod}
                onChange={v => setExpenseMethod(v as typeof expenseMethod)}
                placeholder="Метод"
                options={[
                  { value: '', label: 'Всі методи' },
                  { value: 'cash', label: 'Готівка' },
                  { value: 'fop', label: 'ФОП' },
                  { value: 'personal_card', label: 'Картка' },
                ]}
              />
            )}

            {/* Тренер — завжди */}
            <FilterSelect
              value={trainerFilter}
              onChange={v => { setTrainerFilter(v); setPage(0) }}
              placeholder="Тренер"
              options={[
                { value: '', label: 'Всі тренери' },
                ...trainers.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })),
              ]}
            />

            {/* Дати — завжди */}
            <div className={styles.filterDateWrap}>
              <SalesDateRangePicker
                dateFrom={dateFrom}
                dateTo={dateTo}
                onChangeFrom={handleDateFrom}
                onChangeTo={handleDateTo}
                onClear={() => { setDateFrom(''); setDateTo(''); setPage(0) }}
              />
            </div>

            {hasFilters && (
              <button className={styles.filterClear} onClick={clearFilters}>
                Скинути
              </button>
            )}
          </div>
        </div>

        <div className={`page-body ${styles.content}`}>
          {loading ? (
            <div className="loading-dots"><span /><span /><span /></div>
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : feed.length === 0 ? (
            <div className={styles.empty}>
              <span>
                {feedTab === 'expenses'
                  ? 'Операцій немає'
                  : search || dateFrom || dateTo
                    ? MSG.empty.salesFiltered
                    : MSG.empty.sales}
              </span>
              {feedTab !== 'expenses' && !search && !dateFrom && !dateTo && (
                <button className="btn-primary" onClick={() => { setEditSale(null); setShowModal(true) }}>
                  + Продаж
                </button>
              )}
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
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
                    {feed.map(item => {
                      if (item.kind === 'expense') {
                        const e = item.data
                        const isExpense = e.direction === 'expense'
                        return (
                          <tr key={`exp-${e.id}`}>
                            <td className={styles.date}>{formatSaleDatetime(e.created_at)}</td>
                            <td style={{ color: 'var(--text-2)' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-3)' }}>
                                  {isExpense ? <ShoppingBag size={13} /> : <TrendingUp size={13} />}
                                </span>
                                {isExpense ? 'Витрата студії' : 'Дохід студії'}
                              </span>
                            </td>
                            <td style={{ color: 'var(--text-2)' }}>
                              {e.description || '—'}
                            </td>
                            <td>—</td>
                            <td>—</td>
                            <td className={styles.price}>
                              <span className={isExpense ? styles.depositNeg : styles.depositPos}>
                                {isExpense ? '−' : '+'}{formatMoney(e.amount)}
                              </span>
                            </td>
                            <td>—</td>
                            <td>
                              <span className={paymentClass(e.payment_method)}>
                                {paymentLabel(e.payment_method)}
                              </span>
                            </td>
                            <td className={styles.trainer}>{e.trainers?.name ?? '—'}</td>
                            <td>
                              <div className={styles.actions}>
                                <button className={styles.btnEdit} onClick={() => { setEditExpense(e); setExpenseModal(true) }}>
                                  Змінити
                                </button>
                                <button className={styles.btnDel} onClick={() => setDeleteExpenseId(e.id)}>
                                  Видалити
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      const s = item.data
                      const depDelta = s.amount_given - s.price_paid
                      return (
                        <tr key={`sale-${s.id}`}>
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
                            <span className={paymentClass(s.payment_method)}>
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

              {/* ── Mobile cards ── */}
              <div className={styles.cardList}>
                {feed.map(item => {
                  if (item.kind === 'expense') {
                    const e = item.data
                    const isExpense = e.direction === 'expense'
                    return (
                      <div key={`exp-${e.id}`} className={`${styles.card} ${isExpense ? styles.cardExpense : styles.cardIncome}`}>
                        <div className={styles.cardRow}>
                          <span className={styles.cardClient}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-3)' }}>
                                {isExpense ? <ShoppingBag size={13} /> : <TrendingUp size={13} />}
                              </span>
                              {isExpense ? 'Витрата студії' : 'Дохід студії'}
                            </span>
                          </span>
                          <span className={styles.cardDate}>{formatSaleDatetime(e.created_at)}</span>
                        </div>
                        {e.description && (
                          <div className={styles.cardOperation}>{e.description}</div>
                        )}
                        <div className={styles.cardMeta}>
                          <span className={isExpense ? styles.depositNeg : styles.depositPos}>
                            {isExpense ? '−' : '+'}{formatMoney(e.amount)}
                          </span>
                          <span className={paymentClass(e.payment_method)}>
                            {paymentLabel(e.payment_method)}
                          </span>
                        </div>
                        {e.trainers?.name && (
                          <div className={styles.cardTrainer}>{e.trainers.name}</div>
                        )}
                        <div className={styles.cardActions}>
                          <button className={styles.btnEdit} onClick={() => { setEditExpense(e); setExpenseModal(true) }}>
                            Змінити
                          </button>
                          <button className={styles.btnDel} onClick={() => setDeleteExpenseId(e.id)}>
                            Видалити
                          </button>
                        </div>
                      </div>
                    )
                  }

                  const s = item.data
                  const depDelta = s.amount_given - s.price_paid
                  const isDeposit = !s.ticket_id
                  return (
                    <div key={`sale-${s.id}`} className={styles.card}>
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
                        <span className={paymentClass(s.payment_method)}>
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
            </>
          )}
        </div>

        {showPagination && (
          <div className="page-foot" style={{padding: '10px 28px'}}>
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
            cash_holder: editSale.cash_holder ?? null,
            price_paid: editSale.price_paid,
            amount_given: editSale.amount_given,
            payment_method: editSale.payment_method,
            notes: editSale.notes,
            created_at: editSale.created_at,
          } : undefined}
        />
      )}

      {expenseModal && (
        <StudioExpenseModal
          trainers={activeTrainers}
          onClose={() => { setExpenseModal(false); setEditExpense(null) }}
          onSaved={handleExpenseSaved}
          editExpense={editExpense ?? undefined}
        />
      )}

      {deleteId && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>Видалити продаж?</h3>
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

      {deleteExpenseId && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>Видалити операцію?</h3>
            <p>Цю дію неможливо скасувати.</p>
            <div className={styles.confirmBtns}>
              <button className={styles.btnCancel} onClick={() => setDeleteExpenseId(null)}>Скасувати</button>
              <button className={styles.btnConfirmDel} onClick={handleDeleteExpense} disabled={deletingExpense}>
                {deletingExpense ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
