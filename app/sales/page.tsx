'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { ShoppingBag, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import SaleModal from '@/components/SaleModal'
import StudioExpenseModal from '@/components/StudioExpenseModal'
import SalesDateRangePicker from '@/components/SalesDateRangePicker'
import { useRefs } from '@/contexts/RefsContext'
import { useSalesFeed, PAGE_SIZES, type PageSize } from '@/hooks/useSales'
import { useReceipt } from '@/hooks/useReceipt'
import { deleteSale } from '@/lib/queries/sales'
import { deleteStudioExpense } from '@/lib/queries/studio-expenses'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import { formatClientName, formatSaleDatetime, formatMoney } from '@/lib/formatters'
import { paymentLabel, paymentClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import type { Sale, PaymentMethod } from '@/types'
import Pagination from '@/components/ui/Pagination'
import FilterSelect from '@/components/ui/FilterSelect'
import { CopyButton } from '@/components/ui/CopyButton'
import styles from './sales.module.css'

type FeedTab = 'all' | 'sales' | 'expenses'

/**
 * Mobile bottom-sheet фільтрів виноситься в document.body через portal: інакше
 * fixed-оверлей застряг би в потоці .page-head і BottomNav (теж fixed, але
 * пізніший сиблінг body) перекривав би його нижні ~56px — недоступна «Готово».
 * Коли active=false (desktop, або mobile-sheet закритий) діти рендеряться
 * inline, де desktop-гілка через display:contents вкладає їх назад у .filters.
 */
function MaybePortal({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (active && mounted) return createPortal(children, document.body)
  return <>{children}</>
}

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
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [page, setPage]               = useState(0)
  const [pageSize, setPageSize]       = useState<PageSize>(20)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [expenseMethod, setExpenseMethod]   = useState<'cash' | 'fop' | 'personal_card' | ''>('')
  const [trainerFilter, setTrainerFilter]   = useState<string>('')

  // Весь feed (sales+expenses) пагінується й фільтрується в БД через
  // sales_feed_page RPC — без клієнтського злиття/сортування тисяч рядків.
  const { feed, total, loading, fetchError, refetch } = useSalesFeed({
    tab: feedTab, page, pageSize, search, dateFrom, dateTo,
    trainerId: trainerFilter, expenseMethod,
  })

  const { prepareReceipt } = useReceipt()

  const totalPages = Math.ceil(total / pageSize)
  const hasFilters = search.trim() !== '' || dateFrom !== '' || dateTo !== '' || expenseMethod !== '' || trainerFilter !== ''
  // Лічильник для mobile-кнопки «Фільтри» — усе, що сховане в sheet (без пошуку, він видимий завжди).
  const activeFilterCount =
    (feedTab !== 'all' ? 1 : 0) +
    (expenseMethod !== '' ? 1 : 0) +
    (trainerFilter !== '' ? 1 : 0) +
    (dateFrom !== '' || dateTo !== '' ? 1 : 0)

  function handleSearchInput(value: string) {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(value); setPage(0) }, 300)
  }

  function handleDateFrom(value: string) { setDateFrom(value); setPage(0) }
  function handleDateTo(value: string)   { setDateTo(value);   setPage(0) }
  function handleExpenseMethod(value: typeof expenseMethod) { setExpenseMethod(value); setPage(0) }

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
    const { success, error } = await deleteSale(supabase, deleteId)
    if (!success) {
      setDeleteError(error ?? 'Помилка видалення')
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
    setDeleteExpenseId(null)
    setDeletingExpense(false)
    toast.success('Операцію видалено')
    refetch()
  }

  function handleSaved() {
    setShowModal(false)
    setEditSale(null)
    toast.success(MSG.toast.saved)
    refetch()
  }

  function handleExpenseSaved() {
    setExpenseModal(false)
    setEditExpense(null)
    refetch()
  }

  function handlePageSize(size: PageSize) {
    setPageSize(size)
    setPage(0)
  }

  const showPagination = !loading && !fetchError && total > 0

  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className={`page-main ${styles.salesMain}`}>
        <div className="page-head">
          <div className={styles.topbar}>
            <h1 className="page-title">Продажі</h1>
            <div className={styles.topbarBtns}>
              <button className="btn-secondary" onClick={() => setExpenseModal(true)}>
                + Студійна операція
              </button>
              {/* Desktop: кнопка в топбарі. Mobile: схована, дублюється FAB нижче. */}
              <button className={`btn-primary ${styles.saleBtnDesktop}`} onClick={() => { setEditSale(null); setShowModal(true) }}>
                + Продаж
              </button>
            </div>
          </div>

          <div className={styles.filters}>
            {/* Таби — desktop у рядку фільтрів; mobile сховані (живуть у sheet) */}
            <div className={`${styles.feedTabGroup} ${styles.tabsDesktopOnly}`} role="tablist">
              {(['all', 'sales', 'expenses'] as FeedTab[]).map(tab => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={feedTab === tab}
                  aria-controls={`panel-${tab}`}
                  className={`tab-seg ${feedTab === tab ? 'tab-seg-active' : ''}`}
                  onClick={() => handleTabChange(tab)}
                >
                  {tab === 'all' ? 'Всі' : tab === 'sales' ? 'Продажі' : 'Операції'}
                </button>
              ))}
            </div>

            {/* Пошук по клієнту — тільки для Продажі або Всі */}
            {feedTab !== 'expenses' && (
              <div className={styles.filterSearch}>
                <label htmlFor="search-input" className="sr-only">
                  Пошук за клієнтом
                </label>
                <svg className={styles.filterSearchIcon} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
                </svg>
                <input
                  id="search-input"
                  className={styles.filterSearchInput}
                  type="text"
                  value={searchInput}
                  onChange={e => handleSearchInput(e.target.value)}
                  placeholder="Пошук за клієнтом..."
                />
              </div>
            )}

            {/* Mobile-only: кнопка «Фільтри» відкриває bottom-sheet */}
            <button
              className={styles.filterToggleBtn}
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="4" x2="14" y2="4"/><line x1="4" y1="8" x2="12" y2="8"/><line x1="6" y1="12" x2="10" y2="12"/>
              </svg>
              Фільтри
              {activeFilterCount > 0 && (
                <span className={styles.filterToggleBadge}>{activeFilterCount}</span>
              )}
            </button>

            {/* Розширені фільтри: desktop — у рядку (display:contents); mobile — у bottom-sheet
                (через portal у body, коли відкритий, щоб не застрягти під BottomNav). */}
            <MaybePortal active={filtersOpen}>
            <div className={`${styles.advancedFilters} ${filtersOpen ? styles.advancedFiltersOpen : ''}`}>
              <div className={styles.sheetOverlay} onClick={() => setFiltersOpen(false)} />
              <div className={styles.sheetBody} role="dialog" aria-label="Фільтри" aria-modal="true">
                <div className={styles.sheetHeader}>
                  <span className={styles.sheetTitle}>Фільтри</span>
                  <button className={styles.sheetClose} onClick={() => setFiltersOpen(false)} aria-label="Закрити">✕</button>
                </div>

                {/* Таби — у sheet на mobile (на desktop сховані тут, видимі вище) */}
                <div className={`${styles.feedTabGroup} ${styles.tabsMobileSheet}`} role="tablist">
                  {(['all', 'sales', 'expenses'] as FeedTab[]).map(tab => (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={feedTab === tab}
                      className={`tab-seg ${feedTab === tab ? 'tab-seg-active' : ''}`}
                      onClick={() => handleTabChange(tab)}
                    >
                      {tab === 'all' ? 'Всі' : tab === 'sales' ? 'Продажі' : 'Операції'}
                    </button>
                  ))}
                </div>

                {/* Метод оплати — тільки для Операції або Всі (desktop: dropdown) */}
                {feedTab !== 'sales' && (
                  <div className={styles.filterDesktopOnly}>
                    <FilterSelect
                      value={expenseMethod}
                      onChange={v => handleExpenseMethod(v as typeof expenseMethod)}
                      placeholder="Метод"
                      options={[
                        { value: '', label: 'Всі методи' },
                        { value: 'cash', label: 'Готівка' },
                        { value: 'fop', label: 'ФОП' },
                        { value: 'personal_card', label: 'Картка' },
                      ]}
                    />
                  </div>
                )}

                {/* Тренер — завжди (desktop: dropdown) */}
                <div className={styles.filterDesktopOnly}>
                  <FilterSelect
                    value={trainerFilter}
                    onChange={v => { setTrainerFilter(v); setPage(0) }}
                    placeholder="Тренер"
                    options={[
                      { value: '', label: 'Всі тренери' },
                      ...trainers.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })),
                    ]}
                  />
                </div>

                {/* Чипи методу — лише mobile (у sheet) */}
                {feedTab !== 'sales' && (
                  <div className={`filterChips ${styles.salesChipsMobile}`}>
                    {([
                      { value: '', label: 'Всі методи' },
                      { value: 'cash', label: 'Готівка' },
                      { value: 'fop', label: 'ФОП' },
                      { value: 'personal_card', label: 'Картка' },
                    ] as { value: typeof expenseMethod; label: string }[]).map(o => (
                      <button
                        key={o.value || 'all'}
                        className={['filterChip', expenseMethod === o.value ? 'filterChipActive' : ''].filter(Boolean).join(' ')}
                        onClick={() => handleExpenseMethod(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Чипи тренера — лише mobile (у sheet) */}
                <div className={`filterChips ${styles.salesChipsMobile}`}>
                  <button
                    className={['filterChip', !trainerFilter ? 'filterChipActive' : ''].filter(Boolean).join(' ')}
                    onClick={() => { setTrainerFilter(''); setPage(0) }}
                  >
                    Всі тренери
                  </button>
                  {trainers.filter(t => t.is_active).map(t => (
                    <button
                      key={t.id}
                      className={['filterChip', trainerFilter === t.id ? 'filterChipActive' : ''].filter(Boolean).join(' ')}
                      onClick={() => { setTrainerFilter(t.id); setPage(0) }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>

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

                {/* «Готово» — лише mobile (закрити sheet) */}
                <button className={styles.sheetDone} onClick={() => setFiltersOpen(false)}>
                  Готово
                </button>
              </div>
            </div>
            </MaybePortal>
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
                                <span className={styles.actionsSpacer} aria-hidden="true" />
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
                              <CopyButton
                                size="sm"
                                text={() => prepareReceipt(s)}
                                onCopied={() => toast.success(MSG.toast.copied)}
                                title="Скопіювати повідомлення для клієнта"
                              />
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
                        {/* Мета: ±сума (знак несе колір) · метод · тренер. */}
                        <div className={styles.cardMeta}>
                          <span className={isExpense ? styles.depositNeg : styles.depositPos}>
                            {isExpense ? '−' : '+'}{formatMoney(e.amount)}
                          </span>
                          <span className={styles.cardDot}>·</span>
                          <span className={paymentClass(e.payment_method)}>
                            {paymentLabel(e.payment_method)}
                          </span>
                          {e.trainers?.name && (
                            <>
                              <span className={styles.cardDot}>·</span>
                              <span>{e.trainers.name}</span>
                            </>
                          )}
                        </div>
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
                      {/* Geist list-item мета: метод оплати · оплачено · тренер —
                          один приглушений рядок замість трьох блоків з підписами. */}
                      <div className={styles.cardMeta}>
                        <span className={paymentClass(s.payment_method)}>
                          {paymentLabel(s.payment_method)}
                        </span>
                        {!isDeposit && s.payment_method !== 'deposit' && (
                          <>
                            <span className={styles.cardDot}>·</span>
                            <span className={styles.cardMetaLabel}>Оплачено</span>
                            <span className={styles.cardMetaValue}>{formatMoney(s.price_paid)}</span>
                          </>
                        )}
                        {s.trainers?.name && (
                          <>
                            <span className={styles.cardDot}>·</span>
                            <span>{s.trainers.name}</span>
                          </>
                        )}
                      </div>
                      {depDelta !== 0 && (
                        <div className={styles.cardMeta}>
                          <span className={styles.cardMetaLabel}>Депозит</span>
                          <span className={depDelta > 0 ? styles.depositPos : styles.depositNeg}>
                            {depDelta > 0 ? '+' : ''}{formatMoney(depDelta)}
                          </span>
                        </div>
                      )}
                      <div className={styles.cardActions}>
                        <CopyButton
                          text={() => prepareReceipt(s)}
                          onCopied={() => toast.success(MSG.toast.copied)}
                          title="Скопіювати повідомлення для клієнта"
                          ariaLabel="Скопіювати клієнту"
                        />
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

        {/* FAB — mobile only, новий продаж (дублює кнопку «+ Продаж» з топбара).
            Ховаємо при відкритому sheet фільтрів, щоб не висів поверх затемнення. */}
        <button
          className={`${styles.fab} ${filtersOpen ? styles.fabHidden : ''}`}
          onClick={() => { setEditSale(null); setShowModal(true) }}
          aria-label="Новий продаж"
        >
          +
        </button>
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
            payment_method: editSale.payment_method as PaymentMethod,
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
              <button className="btn-secondary" onClick={() => { setDeleteId(null); setDeleteError('') }}>Скасувати</button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
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
              <button className="btn-secondary" onClick={() => setDeleteExpenseId(null)}>Скасувати</button>
              <button className="btn-danger" onClick={handleDeleteExpense} disabled={deletingExpense}>
                {deletingExpense ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
