'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clientCancel } from '@/lib/queries/client-cabinet'
import type { MyEnrollmentDetailRow } from '@/lib/queries/client-cabinet-data'
import { formatMoney } from '@/lib/formatters'
import { ticketTypeShortLabel, enrollmentStatusLabel, enrollmentStatusClass } from '@/lib/badges'
import { DOW_LABELS_FULL, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { STUDIO, STUDIO_TELEGRAM_URL, STUDIO_INSTAGRAM_URL } from '@/lib/studio'
import { MSG } from '@/lib/messages'
import styles from '../../client.module.css'

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fullWhen(startISO: string, durationMin: number): string {
  const start = new Date(startISO)
  const end = new Date(start.getTime() + durationMin * 60000)
  const dow = DOW_LABELS_FULL[start.getDay()]
  return `${dow}, ${start.getDate()} ${MONTHS_UK_GENITIVE[start.getMonth()]}, ${hhmm(start)} – ${hhmm(end)}`
}

// Google Calendar «додати подію»: dates у форматі UTC YYYYMMDDTHHMMSSZ.
function googleCalendarUrl(title: string, startISO: string, durationMin: number, location: string): string {
  const start = new Date(startISO)
  const end = new Date(start.getTime() + durationMin * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    location,
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}


type Props = {
  enrollment: MyEnrollmentDetailRow
  basePrice: number | null
  sessionBalance: number
  typeLabels: Record<string, string>
  isPast: boolean
}

export default function VisitDetail({ enrollment, basePrice, sessionBalance, typeLabels, isPast }: Props) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)

  const c = enrollment.classes
  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)
  const className = c.title || typeLabel(c.ticket_type)
  const trainerName = c.trainers?.name ?? null

  // Скільки сесій коштує заняття: минуле — фактичне sessions_used; майбутнє —
  // hours_attended.length ?? 1 (як спише mark_attendance / auto_close).
  const cost = isPast
    ? (enrollment.sessions_used || 1)
    : (enrollment.hours_attended?.length ?? 1)
  const hasBalance = sessionBalance >= cost
  const canCancel = !isPast && !c.is_cancelled && (enrollment.status === 'enrolled' || enrollment.status === 'waitlist')

  async function handleCancel() {
    if (!confirm('Скасувати запис? Якщо до заняття лишилось мало часу, заняття буде списано.')) return
    setCancelling(true)
    const { success, charged, error } = await clientCancel(supabase, enrollment.id)
    setCancelling(false)
    if (!success) {
      toast.error(error ?? MSG.toast.deleteFailed)
      return
    }
    toast.success(charged ? 'Запис скасовано, заняття списано' : 'Запис скасовано')
    router.push('/client/visits')
    router.refresh()
  }

  const initial = trainerName?.trim()[0]?.toUpperCase() || '?'

  return (
    <>
      {/* Тренер */}
      <section className={styles.detailHero}>
        <div className={styles.detailAvatar}>{initial}</div>
        <div className={styles.detailTrainerName}>{trainerName || 'Тренер'}</div>
        <div className={styles.detailTrainerRole}>Тренер</div>
        <div className={styles.detailWhen}>{fullWhen(c.starts_at, c.duration_min)}</div>
        {isPast && (
          <span className={enrollmentStatusClass(enrollment.status)}>{enrollmentStatusLabel(enrollment.status)}</span>
        )}
        {!isPast && c.is_cancelled && <span className={styles.badge}>Заняття скасовано</span>}

        {(canCancel || !isPast) && (
          <div className={styles.detailActions}>
            {canCancel && (
              <button
                type="button"
                className={styles.detailAction}
                onClick={handleCancel}
                disabled={cancelling}
              >
                <span className={styles.detailActionIcon}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <line x1="5" y1="5" x2="15" y2="15"/>
                    <line x1="15" y1="5" x2="5" y2="15"/>
                  </svg>
                </span>
                <span>{cancelling ? '…' : 'Скасувати запис'}</span>
              </button>
            )}
            {!isPast && !c.is_cancelled && (
              <a
                className={styles.detailAction}
                href={googleCalendarUrl(className, c.starts_at, c.duration_min, STUDIO.address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.detailActionIcon}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="3" y="4" width="14" height="13" rx="2"/>
                    <line x1="3" y1="8" x2="17" y2="8"/>
                    <line x1="7" y1="2" x2="7" y2="5.5"/>
                    <line x1="13" y1="2" x2="13" y2="5.5"/>
                    <line x1="7" y1="12" x2="13" y2="12"/>
                  </svg>
                </span>
                <span>Додати до Google-календаря</span>
              </a>
            )}
          </div>
        )}
      </section>

      {/* Заняття */}
      <div className={styles.sectionLabel}>Заняття</div>
      <section className={styles.detailCard}>
        <div className={styles.detailRow}>
          <span className={styles.detailRowMain}>{className}</span>
          {!hasBalance && basePrice != null && (
            <span className={styles.detailPrice}>{formatMoney(basePrice * cost)}</span>
          )}
        </div>
        <div className={styles.detailRowSub}>
          {hasBalance ? (
            <>
              {cost === 1 ? '1 заняття' : `${cost} заняття`} з абонемента
              {!isPast && ` · залишок після: ${sessionBalance - cost} год`}
            </>
          ) : (
            'Буде списано з балансу (немає активного абонемента)'
          )}
        </div>
        {c.halls?.name && <div className={styles.detailRowSub}>{c.halls.name} · {c.duration_min} хв</div>}
      </section>

      {/* Студія */}
      <div className={styles.sectionLabel}>Студія</div>
      <section className={styles.detailCard}>
        <div className={styles.detailRow}>
          <span className={styles.detailRowMain}>{STUDIO.name}</span>
        </div>
        <div className={styles.detailRowSub}>{STUDIO.address}</div>
        <div className={styles.detailMap}>
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d563.929085849513!2d35.04347147941503!3d48.46453316770994!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40dbe2e70d6686bb%3A0x9492dd4a63962314!2z0JHRg9C00LjQvdC-0Log0L_QvtCx0YPRgtGD!5e0!3m2!1suk!2sua!4v1780650402076!5m2!1suk!2sua"
            width="600"
            height="240"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Карта студії SEKTA"
          />
        </div>
      </section>

      {/* Контакти */}
      <div className={`${styles.sectionLabel} ${styles.sectionLabelCenter}`}>Контакти</div>
      <div className={styles.contactIcons}>
        <a className={styles.contactIcon} href={STUDIO_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="22" cy="22" r="19"/>
            <path d="M13 22l5 5 13-13" strokeLinecap="round" strokeLinejoin="round" stroke="none"/>
            <path d="M12 21c5-2.2 8.5-3.6 10.5-4.4 5-2 6-2.3 6.7-2.3.2 0 .5 0 .7.2.2.2.2.4.2.6v.5l-1.7 8c-.1.5-.4.6-.7.6-.3 0-.6-.2-.9-.4l-2.4-1.8-1.2 1.1c-.2.2-.3.2-.6.2l.2-2.5 5.3-4.8c.2-.2 0-.3-.3-.1l-6.5 4.1-2.8-.9c-.6-.2-.6-.6.2-.9z" strokeWidth="0" fill="currentColor"/>
          </svg>
          <span className={styles.contactIconLabel}>Telegram</span>
        </a>
        <a className={styles.contactIcon} href={STUDIO_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="22" cy="22" r="19"/>
            <rect x="14" y="14" width="16" height="16" rx="4.5" strokeWidth="1.4"/>
            <circle cx="22" cy="22" r="4" strokeWidth="1.4"/>
            <circle cx="27" cy="17" r="1" fill="currentColor" stroke="none"/>
          </svg>
          <span className={styles.contactIconLabel}>Instagram</span>
        </a>
      </div>
    </>
  )
}
