'use client'
import { useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import styles from './settings.module.css'

const SETTINGS_TABS = [
  { href: '/settings/tickets', label: 'Абонементи' },
  { href: '/settings/trainers', label: 'Тренери' },
  { href: '/settings/halls', label: 'Зали' },
  { href: '/settings/training-types', label: 'Типи' },
]

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

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5]

/** Скелетон під геометрію конкретних `columns` — кількість колонок і те,
    чи є картка з редагуванням, відомі заздалегідь (не залежать від даних). */
function RefEntitySkeleton({ columnCount, editable }: { columnCount: number; editable?: boolean }) {
  return (
    <div role="status" aria-label="Завантаження...">
      <div className={styles.tableDesktop}>
        <div className="data-table-wrap">
          <table className="data-table" aria-hidden="true">
            <thead>
              <tr>
                {Array.from({ length: columnCount }).map((_, i) => <th key={i}></th>)}
                <th></th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {SKELETON_ROWS.map(i => (
                <tr key={i}>
                  {Array.from({ length: columnCount }).map((_, ci) => (
                    <td key={ci}>
                      <div className={`skeleton-bone ${ci === 0 ? styles.skelName : ''}`} style={ci === 0 ? { width: `${70 - (i % 3) * 8}%` } : { width: 70 }} />
                    </td>
                  ))}
                  <td><div className={`skeleton-bone ${styles.skelToggle}`} /></td>
                  {editable && <td></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={styles.cardList}>
        {SKELETON_ROWS.slice(0, 4).map(i => (
          <div key={i} className={styles.settingCard}>
            <div className={styles.cardRow}>
              <div className="skeleton-bone" style={{ width: `${45 - (i % 3) * 6}%` }} />
              <div className={`skeleton-bone ${styles.skelToggle}`} />
            </div>
            <div className={styles.cardMeta}>
              <div className={`skeleton-bone ${styles.skelCardMeta}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArchiveSection({ label, count, open, onToggle, children }: {
  label: string; count: number; open: boolean; onToggle: () => void; children: ReactNode
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
        <span className="count-chip">{count}</span>
      </button>
      {open && (count === 0 ? <div className={styles.archiveEmpty}>Архів порожній</div> : children)}
    </div>
  )
}

/** Опис колонки: рендер для desktop-таблиці (`cell`) і для mobile-картки (`card`). */
export interface RefColumn<T> {
  header: string
  /** desktop <td> вміст */
  cell: (row: T) => ReactNode
  /** mobile-картка: ярлик у cardMeta. Якщо не задано — колонка не показується на мобілці. */
  card?: (row: T) => ReactNode
  /** className на <td> (напр. styles.name / styles.mono / styles.description) */
  tdClassName?: string
}

interface EntityHook<T> {
  data: T[]
  loading: boolean
  fetchError: string | null
  toggling: string | null
  toggle: (id: string, v: boolean) => Promise<void>
  refetch: () => Promise<void>
}

interface Props<T extends { id: string; is_active?: boolean }> {
  title: string
  addLabel: string
  archiveLabel: string
  emptyMsg: ReactNode
  useEntity: () => EntityHook<T>
  columns: RefColumn<T>[]
  /** modal — engine володіє open/editing-станом */
  renderModal: (p: { editing: T | null; onClose: () => void; onSaved: () => void }) => ReactNode
  /** якщо true — рядок отримує кнопку «Редагувати» що відкриває renderModal з editing=row */
  editable?: boolean
}

/**
 * Рушій довідкової сторінки в /settings/*. Володіє «хромом»: таби, head,
 * loading/error/empty, desktop-таблиця + mobile-картки, архів, toggle, модалка.
 * Сторінка передає лише title/columns/modal/hook. CSS — settings.module.css
 * (той самий, що в рукописних сторінках — нуль візуальних змін).
 */
export function RefEntityPage<T extends { id: string; is_active?: boolean }>({
  title, addLabel, archiveLabel, emptyMsg, useEntity, columns, renderModal, editable,
}: Props<T>) {
  const pathname = usePathname()
  const { data, loading, fetchError, toggling, toggle, refetch } = useEntity()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const openAdd = () => { setEditing(null); setShowModal(true) }
  const openEdit = (row: T) => { setEditing(row); setShowModal(true) }
  const onClose = () => { setShowModal(false); setEditing(null) }
  const onSaved = () => { onClose(); toast.success(MSG.toast.saved); refetch() }

  const active = data.filter(r => r.is_active)
  const archived = data.filter(r => !r.is_active)

  // desktop-рядок
  const renderRow = (row: T, opts: { archived?: boolean }) => (
    <tr key={row.id} className={opts.archived ? styles.archivedRow : undefined}>
      {columns.map((col, i) => (
        <td key={i} className={col.tdClassName}>{col.cell(row)}</td>
      ))}
      {!opts.archived ? (
        <td><ToggleBtns id={row.id} active={!!row.is_active} toggling={toggling} onToggle={toggle} /></td>
      ) : (
        <td>
          <button className={styles.restoreBtn} onClick={() => toggle(row.id, true)} disabled={toggling === row.id}>
            {toggling === row.id ? '...' : 'Відновити'}
          </button>
        </td>
      )}
      {editable && (
        <td><button className={styles.editBtn} onClick={() => openEdit(row)}>Редагувати</button></td>
      )}
    </tr>
  )

  // mobile-картка
  const renderCard = (row: T, opts: { archived?: boolean }) => {
    // Лише колонки з card(), і лише ті, що повертають непорожнє значення —
    // інакше у cardMeta з'являвся б порожній <span> (gap). Відповідає рукописним сторінкам.
    const cardCells = columns
      .filter(c => c.card)
      .map(c => c.card!(row))
      .filter((v): v is ReactNode => v !== null && v !== undefined && v !== false)
    return (
      <div key={row.id} className={styles.settingCard} style={opts.archived ? { opacity: 0.65 } : undefined}>
        <div className={styles.cardRow}>
          <span className={styles.name}>{columns[0].cell(row)}</span>
          <div className={styles.cardActions}>
            {!opts.archived ? (
              <>
                {editable && <button className={styles.editBtn} onClick={() => openEdit(row)}>Редагувати</button>}
                <ToggleBtns id={row.id} active={!!row.is_active} toggling={toggling} onToggle={toggle} />
              </>
            ) : (
              <>
                <button className={styles.restoreBtn} onClick={() => toggle(row.id, true)} disabled={toggling === row.id}>
                  {toggling === row.id ? '...' : 'Відновити'}
                </button>
                {editable && <button className={styles.editBtn} onClick={() => openEdit(row)}>Редагувати</button>}
              </>
            )}
          </div>
        </div>
        <div className={styles.cardMeta}>
          {cardCells.map((v, i) => <span key={i}>{v}</span>)}
        </div>
      </div>
    )
  }

  const headerCells = (withTrailing: boolean) => (
    <tr>
      {columns.map((c, i) => <th key={i}>{c.header}</th>)}
      <th>{withTrailing ? 'Статус' : ''}</th>
      {editable && <th></th>}
    </tr>
  )

  return (
    <>
      <div className="page-head">
        <div className={styles.topbar}>
          <h1 className="page-title">{title}</h1>
          <button className="btn-primary" onClick={openAdd}>{addLabel}</button>
        </div>
        <nav className={styles.tabNav}>
          {SETTINGS_TABS.map(tab => (
            <a key={tab.href} href={tab.href} className={`${styles.tabNavLink} ${pathname === tab.href ? styles.tabNavLinkActive : ''}`}>{tab.label}</a>
          ))}
        </nav>
      </div>{/* /page-head */}

      <div className={`page-body ${styles.tabSection}`}>
        {loading ? (
          <RefEntitySkeleton columnCount={columns.length} editable={editable} />
        ) : fetchError ? (
          <div className={styles.empty}>Помилка завантаження: {fetchError}</div>
        ) : active.length === 0 ? (
          <div className={styles.empty}>
            <span>{emptyMsg}</span>
            <button className="btn-primary" onClick={openAdd}>{addLabel}</button>
          </div>
        ) : (
          <>
            <div className={styles.tableDesktop}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>{headerCells(true)}</thead>
                  <tbody>{active.map(r => renderRow(r, {}))}</tbody>
                </table>
              </div>
            </div>
            <div className={styles.cardList}>
              {active.map(r => renderCard(r, {}))}
            </div>
          </>
        )}

        <ArchiveSection label={archiveLabel} count={archived.length} open={archiveOpen} onToggle={() => setArchiveOpen(o => !o)}>
          {archived.length === 0 ? null : (
            <>
              <div className={styles.tableDesktop}>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>{headerCells(false)}</thead>
                    <tbody>{archived.map(r => renderRow(r, { archived: true }))}</tbody>
                  </table>
                </div>
              </div>
              <div className={styles.cardList}>
                {archived.map(r => renderCard(r, { archived: true }))}
              </div>
            </>
          )}
        </ArchiveSection>
      </div>

      {showModal && renderModal({ editing, onClose, onSaved })}
    </>
  )
}
