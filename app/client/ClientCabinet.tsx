'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clientCancel } from '@/lib/queries/client-cabinet'
import type {
  MyEnrollmentRow,
  MyPurchaseRow,
  MyPastEnrollmentRow,
} from '@/lib/queries/client-cabinet-data'
import { formatMoney, formatDateShort } from '@/lib/formatters'
import { ticketTypeShortLabel, ticketTypeGenitiveLabel, paymentLabel, enrollmentStatusLabel, enrollmentStatusClass } from '@/lib/badges'
import { MONTHS_UK_SHORT } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import styles from './client.module.css'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Опис одного рядка sales: покупка абонемента (з тікетом) АБО депозитна операція
// (ticket_id=null: +amount_given поповнення / −price_paid списання).
function describeSale(p: MyPurchaseRow, typeLabel: (t: string) => string): { title: string; amount: number; sign: '' | '+' | '−' } {
  if (p.ticket_id) {
    return { title: p.ticket_name ?? typeLabel(p.ticket_type ?? ''), amount: p.price_paid, sign: '' }
  }
  if (p.amount_given > 0) {
    return { title: 'Поповнення депозиту', amount: p.amount_given, sign: '+' }
  }
  return { title: 'Списання з депозиту', amount: p.price_paid, sign: '−' }
}

type Contacts = {
  phone: string | null
  instagram_username: string | null
  telegram_username: string | null
} | null

type Tab = 'upcoming' | 'archive' | 'purchases'

type Props = {
  balance: number
  sessions: { ticket_type: string; sessions_balance: number }[]
  enrollments: MyEnrollmentRow[]
  contacts: Contacts
  purchases: MyPurchaseRow[]
  pastEnrollments: MyPastEnrollmentRow[]
  typeLabels: Record<string, string>
}

export default function ClientCabinet({
  balance,
  sessions,
  enrollments: initial,
  contacts,
  purchases,
  pastEnrollments,
  typeLabels,
}: Props) {
  const [enrollments, setEnrollments] = useState(initial)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [slide, setSlide] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  // Повна назва типу з БД (training_types.label); fallback — короткий ярлик.
  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  async function handleCancel(enrollmentId: string) {
    if (!confirm('Скасувати запис? Якщо до заняття лишилось мало часу, заняття буде списано.')) return
    setCancelling(enrollmentId)
    const { success, charged, error } = await clientCancel(supabase, enrollmentId)
    setCancelling(null)
    if (!success) {
      toast.error(error ?? MSG.toast.deleteFailed)
      return
    }
    setEnrollments(prev => prev.filter(e => e.id !== enrollmentId))
    toast.success(charged ? 'Запис скасовано, заняття списано' : 'Запис скасовано')
  }

  function onCarouselScroll() {
    const el = carouselRef.current
    if (!el || el.children.length === 0) return
    // Картки ~85% ширини + gap → міряємо по реальному кроку першої картки.
    const first = el.children[0] as HTMLElement
    const step = first.offsetWidth + 12 // gap: 12px
    const i = Math.round(el.scrollLeft / step)
    if (i !== slide) setSlide(i)
  }

  const sorted = [...enrollments].sort(
    (a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()
  )

  // Картки каруселі: депозит + кожен тип занять.
  const cards = [
    { key: '__deposit', label: 'Депозит:', value: formatMoney(balance), unit: '' },
    ...sessions.map(s => ({
      key: s.ticket_type,
      label: `Залишок: ${ticketTypeGenitiveLabel(s.ticket_type, typeLabel(s.ticket_type))}`,
      value: String(s.sessions_balance),
      unit: 'годин',
    })),
  ]

  return (
    <>
      {(contacts?.phone || contacts?.instagram_username || contacts?.telegram_username) && (
        <section className={styles.profile}>
          {contacts?.phone && (
            <div className={styles.profileRow}>
              <span className={styles.profileLabel}>Телефон</span>
              <span className={styles.profileValue}>{contacts.phone}</span>
            </div>
          )}
          {contacts?.instagram_username && (
            <div className={styles.profileRow}>
              <span className={styles.profileLabel}>Instagram</span>
              <span className={styles.profileValue}>@{contacts.instagram_username}</span>
            </div>
          )}
          {contacts?.telegram_username && (
            <div className={styles.profileRow}>
              <span className={styles.profileLabel}>Telegram</span>
              <span className={styles.profileValue}>@{contacts.telegram_username}</span>
            </div>
          )}
          <p className={styles.hint}>Щоб змінити дані, зверніться до адміністратора студії.</p>
        </section>
      )}

      <section>
        <div ref={carouselRef} className={styles.carousel} onScroll={onCarouselScroll}>
          {cards.map(c => (
            <div key={c.key} className={styles.balanceCard}>
              <div className={styles.balanceLabel}>{c.label}</div>
              <div className={styles.balanceValue}>
                {c.value}
                {c.unit && <span className={styles.balanceUnit}> {c.unit}</span>}
              </div>
            </div>
          ))}
        </div>
        {cards.length > 1 && (
          <div className={styles.dots}>
            {cards.map((c, i) => (
              <span key={c.key} className={`${styles.dot} ${i === slide ? styles.dotActive : ''}`} />
            ))}
          </div>
        )}
      </section>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          className={`${styles.tab} ${tab === 'upcoming' ? styles.tabActive : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Майбутні
        </button>
        <button
          type="button"
          role="tab"
          className={`${styles.tab} ${tab === 'archive' ? styles.tabActive : ''}`}
          onClick={() => setTab('archive')}
        >
          Архів
        </button>
        <button
          type="button"
          role="tab"
          className={`${styles.tab} ${tab === 'purchases' ? styles.tabActive : ''}`}
          onClick={() => setTab('purchases')}
        >
          Покупки
        </button>
      </div>

      {tab === 'upcoming' &&
        (sorted.length === 0 ? (
          <p className={styles.empty}>{MSG.empty.futureEnrollments}.</p>
        ) : (
          <ul className={styles.list}>
            {sorted.map(e => {
              const c = e.classes!
              const d = new Date(c.starts_at)
              return (
                <li key={e.id} className={`${styles.item} ${c.is_cancelled ? styles.cancelled : ''}`}>
                  <div className={styles.date}>
                    <span className={styles.day}>{d.getDate()}</span>
                    <span className={styles.month}>{MONTHS_UK_SHORT[d.getMonth()]}</span>
                  </div>
                  <div className={styles.info}>
                    <div className={styles.title}>{c.title || typeLabel(c.ticket_type)}</div>
                    <div className={styles.meta}>
                      {timeOf(c.starts_at)} · {c.duration_min} хв
                      {c.trainers?.name ? ` · ${c.trainers.name}` : ''}
                      {c.halls?.name ? ` · ${c.halls.name}` : ''}
                    </div>
                    {e.status === 'waitlist' && <div className={styles.waitlist}>У черзі</div>}
                  </div>
                  {c.is_cancelled ? (
                    <span className={styles.badge}>Скасовано</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      onClick={() => handleCancel(e.id)}
                      disabled={cancelling === e.id}
                    >
                      {cancelling === e.id ? '…' : 'Скасувати'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        ))}

      {tab === 'archive' &&
        (pastEnrollments.length === 0 ? (
          <p className={styles.empty}>{MSG.empty.pastEnrollments}.</p>
        ) : (
          <ul className={styles.list}>
            {pastEnrollments.map(e => {
              const c = e.classes!
              const d = new Date(c.starts_at)
              return (
                <li key={e.id} className={styles.item}>
                  <div className={styles.date}>
                    <span className={styles.day}>{d.getDate()}</span>
                    <span className={styles.month}>{MONTHS_UK_SHORT[d.getMonth()]}</span>
                  </div>
                  <div className={styles.info}>
                    <div className={styles.title}>{c.title || typeLabel(c.ticket_type)}</div>
                    <div className={styles.meta}>
                      {timeOf(c.starts_at)} · {c.duration_min} хв
                      {c.trainers?.name ? ` · ${c.trainers.name}` : ''}
                      {c.halls?.name ? ` · ${c.halls.name}` : ''}
                    </div>
                  </div>
                  <span className={enrollmentStatusClass(e.status)}>{enrollmentStatusLabel(e.status)}</span>
                </li>
              )
            })}
          </ul>
        ))}

      {tab === 'purchases' &&
        (purchases.length === 0 ? (
          <p className={styles.empty}>{MSG.empty.purchases}.</p>
        ) : (
          <ul className={styles.txList}>
            {purchases.map(p => {
              const { title, amount, sign } = describeSale(p, typeLabel)
              return (
                <li key={p.id} className={styles.txItem}>
                  <div className={styles.txMain}>
                    <div className={styles.txTitle}>{title}</div>
                    <div className={styles.txMeta}>
                      {formatDateShort(p.created_at)}
                      {p.ticket_id ? ` · ${p.sessions} занять · ${paymentLabel(p.payment_method)}` : ''}
                    </div>
                  </div>
                  <div
                    className={`${styles.txAmount} ${sign === '+' ? styles.amountPos : sign === '−' ? styles.amountNeg : ''}`}
                  >
                    {sign}
                    {formatMoney(amount)}
                  </div>
                </li>
              )
            })}
          </ul>
        ))}
    </>
  )
}
