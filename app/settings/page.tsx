'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import TicketModal from '@/components/TicketModal'
import TrainerModal from '@/components/TrainerModal'
import HallModal from '@/components/HallModal'
import TrainingTypeModal from '@/components/TrainingTypeModal'
import { useTickets } from '@/hooks/useTickets'
import type { Trainer, Hall, TrainingType } from '@/types'
import styles from './settings.module.css'

type Tab = 'tickets' | 'trainers' | 'halls' | 'training-types'

const TABS: { id: Tab; label: string }[] = [
  { id: 'tickets', label: 'Абонементи' },
  { id: 'trainers', label: 'Тренери' },
  { id: 'halls', label: 'Зали' },
  { id: 'training-types', label: 'Типи тренувань' },
]

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as Tab | null
  const activeTab: Tab = TABS.find(t => t.id === tabParam) ? (tabParam as Tab) : 'tickets'

  function setTab(tab: Tab) {
    router.replace(`/settings?tab=${tab}`)
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Налаштування</h1>
        </div>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.tabContent}>
          {activeTab === 'tickets' && <TicketsTab />}
          {activeTab === 'trainers' && <TrainersTab />}
          {activeTab === 'halls' && <HallsTab />}
          {activeTab === 'training-types' && <TrainingTypesTab />}
        </div>
      </main>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}

/* ── Tickets tab ─────────────────────────────────────────────── */
function TicketsTab() {
  const { tickets, loading, fetchError, toggling, toggle, refetch } = useTickets()
  const [showModal, setShowModal] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  function handleSaved() {
    setShowModal(false)
    refetch()
    toast.success('Збережено')
  }

  const active = tickets.filter(t => t.is_active)
  const archived = tickets.filter(t => !t.is_active)

  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHeader}>
        <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати абонемент</button>
      </div>

      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : fetchError ? (
        <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
      ) : active.length === 0 ? (
        <div className={styles.empty}>
          <span>Активних абонементів немає</span>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати абонемент</button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>
              <th>Назва</th><th>Тип</th><th>Занять</th><th>Ціна</th><th>Статус</th>
            </tr></thead>
            <tbody>
              {active.map(t => (
                <tr key={t.id}>
                  <td className={styles.name}>{t.name}</td>
                  <td><span className={styles.typeBadge}>{t.ticket_type}</span></td>
                  <td className={styles.mono}>{t.sessions}</td>
                  <td className={styles.mono}>{t.price.toLocaleString('uk-UA')} ₴</td>
                  <td><ToggleBtns id={t.id} active={t.is_active} toggling={toggling} onToggle={toggle} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ArchiveSection label="Архів абонементів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
        {archived.length === 0 ? null : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Назва</th><th>Тип</th><th>Занять</th><th>Ціна</th><th></th></tr></thead>
              <tbody>
                {archived.map(t => (
                  <tr key={t.id} className={styles.archivedRow}>
                    <td className={styles.name}>{t.name}</td>
                    <td><span className={styles.typeBadge}>{t.ticket_type}</span></td>
                    <td className={styles.mono}>{t.sessions}</td>
                    <td className={styles.mono}>{t.price.toLocaleString('uk-UA')} ₴</td>
                    <td>
                      <button className={styles.restoreBtn} onClick={() => toggle(t.id, true)} disabled={toggling === t.id}>
                        {toggling === t.id ? '...' : 'Відновити'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ArchiveSection>

      {showModal && <TicketModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}
    </div>
  )
}

/* ── Trainers tab ────────────────────────────────────────────── */
function TrainersTab() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const fetchTrainers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('trainers')
      .select('id, name, is_active, instagram_username, telegram_username')
      .order('name', { ascending: true })
    if (error) setFetchError(error.message)
    else setTrainers((data as Trainer[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('trainers').update({ is_active: newValue }).eq('id', id)
    if (error) toast.error('Не вдалося змінити статус')
    else setTrainers(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    setToggling(null)
  }

  const active = trainers.filter(t => t.is_active)
  const archived = trainers.filter(t => !t.is_active)

  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHeader}>
        <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати тренера</button>
      </div>

      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : fetchError ? (
        <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
      ) : active.length === 0 ? (
        <div className={styles.empty}>
          <span>Активних тренерів немає</span>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати тренера</button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Ім&apos;я</th><th>Instagram</th><th>Telegram</th><th>Статус</th></tr></thead>
            <tbody>
              {active.map(t => (
                <tr key={t.id}>
                  <td className={styles.name}>{t.name}</td>
                  <td className={styles.handle}>{t.instagram_username ? <span>@{t.instagram_username}</span> : <span className={styles.dash}>—</span>}</td>
                  <td className={styles.handle}>{t.telegram_username ? <span>@{t.telegram_username}</span> : <span className={styles.dash}>—</span>}</td>
                  <td><ToggleBtns id={t.id} active={t.is_active} toggling={toggling} onToggle={handleToggle} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ArchiveSection label="Архів тренерів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
        {archived.length === 0 ? null : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Ім&apos;я</th><th>Instagram</th><th>Telegram</th><th></th></tr></thead>
              <tbody>
                {archived.map(t => (
                  <tr key={t.id} className={styles.archivedRow}>
                    <td className={styles.name}>{t.name}</td>
                    <td className={styles.handle}>{t.instagram_username ? <span>@{t.instagram_username}</span> : <span className={styles.dash}>—</span>}</td>
                    <td className={styles.handle}>{t.telegram_username ? <span>@{t.telegram_username}</span> : <span className={styles.dash}>—</span>}</td>
                    <td>
                      <button className={styles.restoreBtn} onClick={() => handleToggle(t.id, true)} disabled={toggling === t.id}>
                        {toggling === t.id ? '...' : 'Відновити'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ArchiveSection>

      {showModal && (
        <TrainerModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast.success('Збережено'); fetchTrainers() }}
        />
      )}
    </div>
  )
}

/* ── Halls tab ───────────────────────────────────────────────── */
function HallsTab() {
  const [halls, setHalls] = useState<Hall[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const fetchHalls = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('halls')
      .select('id, name, capacity, description, is_active')
      .order('name', { ascending: true })
    if (error) setFetchError(error.message)
    else setHalls((data as Hall[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchHalls() }, [fetchHalls])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('halls').update({ is_active: newValue }).eq('id', id)
    if (error) toast.error('Не вдалося змінити статус')
    else setHalls(prev => prev.map(h => h.id === id ? { ...h, is_active: newValue } : h))
    setToggling(null)
  }

  const active = halls.filter(h => h.is_active)
  const archived = halls.filter(h => !h.is_active)

  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHeader}>
        <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати зал</button>
      </div>

      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : fetchError ? (
        <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
      ) : active.length === 0 ? (
        <div className={styles.empty}>
          <span>Активних залів немає</span>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>+ Додати зал</button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Назва</th><th>Місткість</th><th>Опис</th><th>Статус</th></tr></thead>
            <tbody>
              {active.map(h => (
                <tr key={h.id}>
                  <td className={styles.name}>{h.name}</td>
                  <td className={styles.mono}>{h.capacity} осіб</td>
                  <td className={styles.description}>{h.description ?? '—'}</td>
                  <td><ToggleBtns id={h.id} active={h.is_active} toggling={toggling} onToggle={handleToggle} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ArchiveSection label="Архів залів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
        {archived.length === 0 ? null : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Назва</th><th>Місткість</th><th>Опис</th><th></th></tr></thead>
              <tbody>
                {archived.map(h => (
                  <tr key={h.id} className={styles.archivedRow}>
                    <td className={styles.name}>{h.name}</td>
                    <td className={styles.mono}>{h.capacity} осіб</td>
                    <td className={styles.description}>{h.description ?? '—'}</td>
                    <td>
                      <button className={styles.restoreBtn} onClick={() => handleToggle(h.id, true)} disabled={toggling === h.id}>
                        {toggling === h.id ? '...' : 'Відновити'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ArchiveSection>

      {showModal && (
        <HallModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast.success('Збережено'); fetchHalls() }}
        />
      )}
    </div>
  )
}

/* ── Training types tab ──────────────────────────────────────── */
function TrainingTypesTab() {
  const [types, setTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<TrainingType | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const fetchTypes = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('training_types')
      .select('id, code, label, is_active, sort_order, created_at')
      .order('sort_order', { ascending: true })
    if (error) setFetchError(error.message)
    else setTypes((data as TrainingType[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTypes() }, [fetchTypes])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    const { error } = await supabase.from('training_types').update({ is_active: newValue }).eq('id', id)
    if (error) toast.error('Не вдалося змінити статус')
    else setTypes(prev => prev.map(t => t.id === id ? { ...t, is_active: newValue } : t))
    setToggling(null)
  }

  function handleEdit(t: TrainingType) { setEditing(t); setShowModal(true) }
  function handleClose() { setShowModal(false); setEditing(null) }
  function handleSaved() { handleClose(); toast.success('Збережено'); fetchTypes() }

  const active = types.filter(t => t.is_active)
  const archived = types.filter(t => !t.is_active)

  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHeader}>
        <button className={styles.btnNew} onClick={() => { setEditing(null); setShowModal(true) }}>+ Додати тип</button>
      </div>

      {loading ? (
        <div className={styles.loading}><span /><span /><span /></div>
      ) : fetchError ? (
        <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
      ) : active.length === 0 ? (
        <div className={styles.empty}>Активних типів немає</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Назва</th><th>Код</th><th>Статус</th><th></th></tr></thead>
            <tbody>
              {active.map(t => (
                <tr key={t.id}>
                  <td className={styles.name}>{t.label}</td>
                  <td><span className={styles.typeBadge}>{t.code}</span></td>
                  <td><ToggleBtns id={t.id} active={t.is_active} toggling={toggling} onToggle={handleToggle} /></td>
                  <td><button className={styles.editBtn} onClick={() => handleEdit(t)}>Редагувати</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ArchiveSection label="Архів типів" count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
        {archived.length === 0 ? null : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Назва</th><th>Код</th><th></th><th></th></tr></thead>
              <tbody>
                {archived.map(t => (
                  <tr key={t.id} className={styles.archivedRow}>
                    <td className={styles.name}>{t.label}</td>
                    <td><span className={styles.typeBadge}>{t.code}</span></td>
                    <td>
                      <button className={styles.restoreBtn} onClick={() => handleToggle(t.id, true)} disabled={toggling === t.id}>
                        {toggling === t.id ? '...' : 'Відновити'}
                      </button>
                    </td>
                    <td><button className={styles.editBtn} onClick={() => handleEdit(t)}>Редагувати</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ArchiveSection>

      {showModal && <TrainingTypeModal onClose={handleClose} onSaved={handleSaved} existing={editing} />}
    </div>
  )
}

/* ── Shared sub-components ───────────────────────────────────── */
function ToggleBtns({ id, active, toggling, onToggle }: {
  id: string; active: boolean; toggling: string | null; onToggle: (id: string, v: boolean) => void
}) {
  return (
    <div className={styles.toggleBtns}>
      <button
        className={`${styles.toggleBtn} ${styles.toggleTrue} ${active ? styles.toggleActiveTrue : ''}`}
        onClick={() => !active && onToggle(id, true)}
        disabled={toggling === id || active}
        aria-pressed={active}
      >TRUE</button>
      <button
        className={`${styles.toggleBtn} ${styles.toggleFalse} ${!active ? styles.toggleActiveFalse : ''}`}
        onClick={() => active && onToggle(id, false)}
        disabled={toggling === id || !active}
        aria-pressed={!active}
      >FALSE</button>
    </div>
  )
}

function ArchiveSection({ label, count, open, onToggle, children }: {
  label: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className={styles.archiveSection}>
      <button className={styles.archiveToggle} onClick={onToggle} aria-expanded={open}>
        <span className={`${styles.archiveChevron} ${open ? styles.archiveChevronOpen : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.5 4.5l3.5 3.5 3.5-3.5"/>
          </svg>
        </span>
        {label}
        <span className={styles.archiveCount}>{count}</span>
      </button>
      {open && (count === 0 ? <div className={styles.archiveEmpty}>Архів порожній</div> : children)}
    </div>
  )
}
