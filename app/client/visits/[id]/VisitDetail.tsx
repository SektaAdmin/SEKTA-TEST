'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clientCancel } from '@/lib/queries/client-cabinet'
import type { MyEnrollmentDetailRow } from '@/lib/queries/client-cabinet-data'
import { fullWhen, hhmm } from '@/lib/formatters'
import { avatarColor } from '@/lib/avatarColor'
import { enrollmentBadge, enrollmentBadgeClass } from '@/lib/badges'
import { MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { cancellationDeadline, isFreeCancellation } from '@/lib/cancellation'
import { STUDIO, STUDIO_TELEGRAM_URL, STUDIO_INSTAGRAM_URL } from '@/lib/studio'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { MSG } from '@/lib/messages'
import styles from '../../client.module.css'

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
  typeLabels: Record<string, string>
  isPast: boolean
}

export default function VisitDetail({ enrollment, typeLabels, isPast }: Props) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const c = enrollment.classes
  const className = c.title || (typeLabels[c.ticket_type] ?? c.ticket_type)
  const trainerName = c.trainers?.name ?? null

  // cost потрібен лише для модалки скасування (штраф = N годин).
  // Майбутнє: hours_attended.length ?? 1 (як спише auto_close/change_enrollment_status).
  const cost = enrollment.hours_attended?.length ?? 1
  const canCancel = !isPast && !c.is_cancelled && (enrollment.status === 'enrolled' || enrollment.status === 'waitlist')

  // Правило відміни для модалки — копія БД-логіки (cancellation.ts), щоб показати
  // клієнту дедлайн і можливий штраф ДО підтвердження (без зайвого запиту).
  const isWaitlist = enrollment.status === 'waitlist'
  const free = isWaitlist || isFreeCancellation(c.starts_at)
  const deadline = cancellationDeadline(c.starts_at)
  const deadlineText = `${deadline.getDate()} ${MONTHS_UK_GENITIVE[deadline.getMonth()]}, ${hhmm(deadline)}`

  async function handleCancel() {
    setCancelling(true)
    const { success, charged, error } = await clientCancel(supabase, enrollment.id)
    setCancelling(false)
    setConfirmOpen(false)
    if (!success) {
      toast.error(error ?? MSG.toast.deleteFailed)
      return
    }
    toast.success(charged ? 'Запис скасовано, заняття списано' : 'Запис скасовано')
    router.push('/client/visits')
    router.refresh()
  }

  const initial = trainerName?.trim()[0]?.toUpperCase() || '?'
  const hallName = c.halls?.name ?? null

  return (
    <>
      {/* Hero: назва тренування + зал, потім час */}
      <section className={styles.detailHero}>
        <div className={styles.detailAvatar} style={{ background: avatarColor(trainerName || ''), color: '#fff' }}>{initial}</div>
        <div className={styles.detailTrainerName}>{className}</div>
        <div className={styles.detailTrainerRole}>
          {trainerName || 'Тренер'}{hallName ? ` · ${hallName}` : ''}
        </div>
        <div className={styles.detailWhen}>{fullWhen(c.starts_at, c.duration_min)}</div>
        {isPast && (() => {
          const badge = enrollmentBadge(enrollment, 'client')
          return (
            <span className={enrollmentBadgeClass(badge.tone)}>{badge.label}</span>
          )
        })()}
        {!isPast && c.is_cancelled && <span className={styles.badge}>Заняття скасовано</span>}

        {!isPast && !c.is_cancelled && enrollment.status !== 'cancelled' && enrollment.status !== 'waitlist' && (
          <a
            className={styles.mapBtn}
            href={googleCalendarUrl(className, c.starts_at, c.duration_min, STUDIO.address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
              <rect x="3" y="4" width="14" height="13" rx="2"/>
              <line x1="3" y1="8" x2="17" y2="8"/>
              <line x1="7" y1="2" x2="7" y2="5.5"/>
              <line x1="13" y1="2" x2="13" y2="5.5"/>
              <line x1="7" y1="12" x2="13" y2="12"/>
            </svg>
            Додати до Google-календаря
          </a>
        )}
      </section>

      {/* Кнопка скасування — між hero і адресою */}
      {canCancel && (
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() => setConfirmOpen(true)}
          disabled={cancelling}
        >
          Скасувати запис
        </button>
      )}

      {/* Адреса */}
      <div className={`${styles.sectionLabel} ${styles.sectionLabelCenter}`}>Адреса</div>
      <section className={`${styles.detailCard} ${styles.detailCardCenter}`}>
        <div className={styles.detailRow}>
          <span className={styles.detailRowMain}>{STUDIO.name}</span>
        </div>
        <div className={styles.detailRowSub}>{STUDIO.address}</div>
        <a
          className={styles.mapBtn}
          href={STUDIO.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
            <path d="M10 18s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z" strokeLinejoin="round"/>
            <circle cx="10" cy="8" r="2.2"/>
          </svg>
          Показати на карті
        </a>
      </section>

      {/* Контакти */}
      <div className={`${styles.sectionLabel} ${styles.sectionLabelCenter}`}>Контакти</div>
      <section className={`${styles.detailCard} ${styles.contactIcons}`}>
        <a
          className={styles.contactIcon}
          href={STUDIO_TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Telegram"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.24 14.028l-2.95-.924c-.64-.203-.652-.64.136-.948l11.526-4.445c.535-.194 1.002.13.61.537z"/>
          </svg>
          <span className={styles.contactIconLabel}>Telegram</span>
        </a>
        <a
          className={styles.contactIcon}
          href={STUDIO_INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5"/>
            <circle cx="12" cy="12" r="4.5"/>
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
          </svg>
          <span className={styles.contactIconLabel}>Instagram</span>
        </a>
      </section>

      {confirmOpen && (
        <ModalShell
          title="Скасувати запис?"
          onClose={() => !cancelling && setConfirmOpen(false)}
          footer={
            <ModalFooter
              onCancel={() => setConfirmOpen(false)}
              onSave={handleCancel}
              saveLabel="Скасувати запис"
              cancelLabel="Назад"
              loading={cancelling}
              danger
            />
          }
        >
          <p className={styles.confirmText}>{className} · {fullWhen(c.starts_at, c.duration_min)}</p>
          {isWaitlist ? (
            <p className={styles.confirmRule}>
              Ви в резерві — скасування безкоштовне.
            </p>
          ) : free ? (
            <p className={styles.confirmRule}>
              Безкоштовне скасування діє до <b>{deadlineText}</b>. Пізніше —
              спишеться {cost} год.
            </p>
          ) : (
            <p className={`${styles.confirmRule} ${styles.confirmRuleWarn}`}>
              ❗️ Пізнє скасування ❗️ З вашого абонемента буде списано {cost} год
            </p>
          )}
        </ModalShell>
      )}
    </>
  )
}
