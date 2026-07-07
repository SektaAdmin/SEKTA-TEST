'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listClients } from '@/lib/queries/clients'
import { useListQuery } from '@/hooks/useListQuery'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import ClientModal from '@/components/ClientModal'
import { formatClientName, formatMoney } from '@/lib/formatters'
import { MSG } from '@/lib/messages'
import { balanceClass } from '@/lib/badges'
import type { Client } from '@/types'
import Pagination, { type PageSize } from '@/components/ui/Pagination'
import styles from './clients.module.css'


const PAGE_SIZES = [20, 50, 100] as const

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]

function ClientsSkeleton() {
  return (
    <div role="status" aria-label="Завантаження...">
      <div className={`data-table-wrap ${styles.tableDesktop}`}>
        <table className="data-table" aria-hidden="true">
          <thead>
            <tr>
              <th>Ім&apos;я</th>
              <th>Телефон</th>
              <th>Instagram</th>
              <th>Telegram</th>
              <th>Депозит</th>
            </tr>
          </thead>
          <tbody>
            {SKELETON_ROWS.map(i => (
              <tr key={i}>
                <td><div className={styles.skeletonBone} style={{ width: `${68 - (i % 3) * 8}%` }} /></td>
                <td><div className={`${styles.skeletonBone} ${styles.skelPhone}`} /></td>
                <td><div className={`${styles.skeletonBone} ${styles.skelHandle}`} /></td>
                <td><div className={`${styles.skeletonBone} ${styles.skelHandle}`} /></td>
                <td><div className={`${styles.skeletonBone} ${styles.skelBalance}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.cardList} aria-hidden="true">
        {SKELETON_ROWS.slice(0, 5).map(i => (
          <div key={i} className={styles.clientCard}>
            <div className={styles.cardRow1}>
              <div className={styles.skeletonBone} style={{ width: `${55 - (i % 3) * 8}%` }} />
              <div className={`${styles.skeletonBone} ${styles.skelCardBalance}`} />
            </div>
            <div className={`${styles.skeletonBone} ${styles.skelCardContacts}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(20)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: clients, total, loading, error: fetchError, refetch } = useListQuery<Client>(
    () => listClients(supabase, { search, page, pageSize }),
    [search, page, pageSize]
  )

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
    toast.success(MSG.toast.saved)
    refetch()
  }

  function handleEditClose() {
    setEditingClient(null)
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main">
        <div className="page-head">
        <div className={styles.topbar}>
          <h1 className="page-title">Клієнти</h1>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
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
        </div>{/* /page-head */}

        <div className={`page-body ${styles.content}`}>
          {loading ? (
            <ClientsSkeleton />
          ) : fetchError ? (
            <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
          ) : clients.length === 0 ? (
            <div className={styles.empty}>
              {search
                ? `За запитом «${search}» нічого не знайдено`
                : <>
                    <span>{MSG.empty.clients}</span>
                    <button className="btn-primary" onClick={() => setShowModal(true)}>+ Додати клієнта</button>
                  </>
              }
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className={`data-table-wrap ${styles.tableDesktop}`}>
                <table className="data-table">
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
                          <span className={balanceClass(c.balance ?? 0)}>
                            {formatMoney(c.balance ?? 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className={styles.cardList}>
                {clients.map(c => (
                  <div
                    key={c.id}
                    className={styles.clientCard}
                    onClick={() => router.push(`/clients/${c.id}`)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') router.push(`/clients/${c.id}`) }}
                  >
                    <div className={styles.cardRow1}>
                      <span className={styles.cardName}>{formatClientName(c)}</span>
                      <span className={balanceClass(c.balance ?? 0)}>
                        {formatMoney(c.balance ?? 0)}
                      </span>
                    </div>
                    {(c.phone || c.instagram_username || c.telegram_username) && (
                      <div className={styles.cardContacts}>
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className={styles.cardPhone}
                            onClick={e => e.stopPropagation()}
                          >{c.phone}</a>
                        )}
                        {c.instagram_username && (
                          <span className={styles.cardHandle}>@{c.instagram_username.replace(/^@/, '')}</span>
                        )}
                        {c.telegram_username && (
                          <span className={styles.cardHandle}>tg: @{c.telegram_username.replace(/^@/, '')}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </>
          )}
        </div>

        {!loading && !fetchError && clients.length > 0 && (
          <div className="page-foot" style={{padding: '10px 28px'}}>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
              onPageSize={handlePageSize}
              pageSizeLabel="Клієнтів на сторінці"
            />
          </div>
        )}
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
