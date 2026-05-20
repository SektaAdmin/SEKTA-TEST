'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listClients } from '@/lib/queries/clients'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import ClientModal from '@/components/ClientModal'
import { formatClientName } from '@/lib/formatters'
import type { Client } from '@/types'
import styles from './clients.module.css'


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

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(20)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalPages = Math.ceil(total / pageSize)
  const from = page * pageSize

  const fetchClients = useCallback(async (
    q: string, p: number, size: number,
    abortSignal?: AbortSignal
  ) => {
    setLoading(true)
    setFetchError(null)
    const { data, count, error } = await listClients(supabase, { search: q, page: p, pageSize: size })
    if (abortSignal?.aborted) return
    if (error) {
      setFetchError(typeof error === 'string' ? error : 'Помилка завантаження')
    } else {
      setClients(data)
      setTotal(count)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchClients(search, page, pageSize, controller.signal)
    return () => controller.abort()
  }, [search, page, pageSize, fetchClients])

  function handleSearchInput(value: string) {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(value)
      setPage(0)
    }, 300)
  }

  function clearSearch() {
    setSearchInput('')
    setSearch('')
    setPage(0)
  }

  function handlePageSize(size: PageSize) {
    setPageSize(size)
    setPage(0)
  }

  function handleSaved() {
    setShowModal(false)
    setEditingClient(null)
    toast.success('Збережено')
    fetchClients(search, page, pageSize)
  }

  function handleEditClose() {
    setEditingClient(null)
  }

  const pageRange = getPageRange(page, totalPages)

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Клієнти</h1>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>
            + Додати клієнта
          </button>
        </div>

        <div className={styles.filterBar}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5"/>
              <line x1="10.5" y1="10.5" x2="14" y2="14"/>
            </svg>
            <input
              className={styles.searchInput}
              type="text"
              value={searchInput}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="Пошук за клієнтом..."
              aria-label="Пошук клієнта"
            />
            {searchInput && (
              <button className={styles.searchClear} onClick={clearSearch} aria-label="Очистити пошук">
                ✕
              </button>
            )}
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>
              <span /><span /><span />
            </div>
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : clients.length === 0 ? (
            <div className={styles.empty}>
              {search
                ? `За запитом «${search}» нічого не знайдено`
                : <>
                    <span>Клієнтів ще немає</span>
                    <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати клієнта</button>
                  </>
              }
            </div>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ім'я</th>
                      <th>Телефон</th>
                      <th>Instagram</th>
                      <th>Telegram</th>
                      <th>Депозит</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr
                        key={c.id}
                        className={styles.clickableRow}
                        onClick={() => router.push(`/clients/${c.id}`)}
                        role="link"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter') router.push(`/clients/${c.id}`) }}
                      >
                        <td className={styles.name}>{formatClientName(c)}</td>
                        <td className={styles.phone} onClick={e => e.stopPropagation()}>
                          {c.phone
                            ? <a href={`tel:${c.phone}`} className={styles.link}>{c.phone}</a>
                            : <span className={styles.empty2}>—</span>
                          }
                        </td>
                        <td>
                          {c.instagram_username
                            ? <span className={styles.handle}>@{c.instagram_username.replace(/^@/, '')}</span>
                            : <span className={styles.empty2}>—</span>
                          }
                        </td>
                        <td>
                          {c.telegram_username
                            ? <span className={styles.handle}>@{c.telegram_username.replace(/^@/, '')}</span>
                            : <span className={styles.empty2}>—</span>
                          }
                        </td>
                        <td>
                          <span className={
                            (c.balance ?? 0) > 0
                              ? styles.balancePos
                              : (c.balance ?? 0) < 0
                                ? styles.balanceNeg
                                : styles.balanceZero
                          }>
                            {c.balance ?? 0} ₴
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.pagination}>
                <div className={styles.paginationLeft}>
                  <select
                    className={styles.pageSizeSelect}
                    value={pageSize}
                    onChange={e => handlePageSize(Number(e.target.value) as PageSize)}
                    aria-label="Клієнтів на сторінці"
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

                    {pageRange.map((p, i) =>
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
        <ClientModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {editingClient && (
        <ClientModal
          client={editingClient}
          onClose={handleEditClose}
          onSaved={handleSaved}
        />
      )}

    </div>
  )
}
