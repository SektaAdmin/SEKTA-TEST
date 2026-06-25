'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listTrainerClients, type TrainerClientRow } from '@/lib/queries/trainer-cabinet'
import { useListQuery } from '@/hooks/useListQuery'
import { formatMoney } from '@/lib/formatters'
import { balanceClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import Pagination, { type PageSize } from '@/components/ui/Pagination'
import CreateClientModal from './CreateClientModal'
import ClientSessionsModal from './ClientSessionsModal'
import styles from './clients.module.css'

function clientName(c: TrainerClientRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

export default function TrainerClients() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<TrainerClientRow | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(20)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: clients, total, loading, error, refetch } = useListQuery<TrainerClientRow>(
    () => listTrainerClients(supabase, { search, page, pageSize }),
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
    toast.success(MSG.toast.saved)
    refetch()
  }

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/trainer')} aria-label="Меню">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
          <span>Меню</span>
        </button>
        <span className={styles.topbarTitle}>Клієнти</span>
        <span className={styles.topbarSpacer} />
      </div>

      <div className={styles.searchWrap}>
        <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" />
        </svg>
        <input
          className={styles.searchInput}
          type="text"
          value={searchInput}
          onChange={e => handleSearchInput(e.target.value)}
          placeholder="Пошук за іменем..."
          aria-label="Пошук клієнта"
        />
        {searchInput && (
          <button className={styles.searchClear} onClick={clearSearch} aria-label="Очистити пошук">
            ✕
          </button>
        )}
      </div>

      <div className={styles.scroll}>
        {loading ? (
          <div className="loading-dots"><span /><span /><span /></div>
        ) : error ? (
          <div className={styles.empty}>Помилка завантаження: {error}</div>
        ) : clients.length === 0 ? (
          <div className={styles.empty}>
            {search
              ? `За запитом «${search}» нічого не знайдено`
              : MSG.empty.clients}
          </div>
        ) : (
          <div className={styles.list}>
            {clients.map(c => (
              <button
                key={c.id}
                type="button"
                className={styles.card}
                onClick={() => setSelected(c)}
                aria-label={`Залишок занять: ${clientName(c)}`}
              >
                <span className={styles.cardName}>{clientName(c)}</span>
                <span className={balanceClass(c.balance ?? 0)}>
                  {formatMoney(c.balance ?? 0)}
                </span>
              </button>
            ))}
          </div>
        )}

        {!loading && !error && clients.length > 0 && (
          <div className={styles.pagination}>
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
      </div>

      <button
        className={styles.fab}
        onClick={() => setShowModal(true)}
        aria-label="Додати клієнта"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="11" y1="4" x2="11" y2="18" />
          <line x1="4" y1="11" x2="18" y2="11" />
        </svg>
      </button>

      {showModal && (
        <CreateClientModal onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}

      {selected && (
        <ClientSessionsModal client={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
