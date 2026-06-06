'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clientCancel } from '@/lib/queries/client-cabinet'
import type { MyEnrollmentDetailRow } from '@/lib/queries/client-cabinet-data'
import { formatMoney, fullWhen, hhmm, pluralHours } from '@/lib/formatters'
import { ticketTypeShortLabel, enrollmentStatusLabel, enrollmentStatusClass } from '@/lib/badges'
import { MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { cancellationDeadline, isFreeCancellation } from '@/lib/cancellation'
import { STUDIO } from '@/lib/studio'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import StudioContactIcons from '@/components/StudioContactIcons'
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
  basePrice: number | null
  sessionBalance: number
  typeLabels: Record<string, string>
  isPast: boolean
}

export default function VisitDetail({ enrollment, basePrice, sessionBalance, typeLabels, isPast }: Props) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const c = enrollment.classes
  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)
  const className = c.title || typeLabel(c.ticket_type)
  const trainerName = c.trainers?.name ?? null

  // Скільки сесій коштує заняття: минуле — фактичне sessions_used; майбутнє —
  // hours_attended.length ?? 1 (як спише mark_attendance / auto_close, і як
  // спише штраф при пізньому скасуванні — change_enrollment_status).
  const cost = isPast
    ? (enrollment.sessions_used || 1)
    : (enrollment.hours_attended?.length ?? 1)
  const hasBalance = sessionBalance >= cost
  const canCancel = !isPast && !c.is_cancelled && (enrollment.status === 'enrolled' || enrollment.status === 'waitlist')

  // Правило відміни для модалки — копія БД-логіки (cancellation.ts), щоб показати
  // клієнту дедлайн і можливий штраф ДО підтвердження (без зайвого запиту).
  const free = isFreeCancellation(c.starts_at)
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
                onClick={() => setConfirmOpen(true)}
                disabled={cancelling}
              >
                <span className={styles.detailActionIcon}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" focusable="false">
                    <line x1="5" y1="5" x2="15" y2="15"/>
                    <line x1="15" y1="5" x2="5" y2="15"/>
                  </svg>
                </span>
                <span>Скасувати запис</span>
              </button>
            )}
            {!isPast && !c.is_cancelled && enrollment.status !== 'cancelled' && (
              <a
                className={styles.detailAction}
                href={googleCalendarUrl(className, c.starts_at, c.duration_min, STUDIO.address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.detailActionIcon}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" focusable="false">
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

      {/* Студія. Без вбудованої карти — щоб не тягнути сторонній трекінг (Google
          iframe) у кабінет. Адреса + кнопка «Показати на карті» на всю ширину. */}
      <div className={styles.sectionLabel}>Студія</div>
      <section className={styles.detailCard}>
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
      <StudioContactIcons styles={styles} />

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
            />
          }
        >
          <p className={styles.confirmText}>{className} · {fullWhen(c.starts_at, c.duration_min)}</p>
          {free ? (
            <p className={styles.confirmRule}>
              Скасування безкоштовне до <b>{deadlineText}</b>. Після цього часу
              спишеться {cost} {pluralHours(cost)}.
            </p>
          ) : (
            <p className={`${styles.confirmRule} ${styles.confirmRuleWarn}`}>
              ⚠️ Час безкоштовного скасування минув ({deadlineText}). Буде списано
              {' '}{cost} {pluralHours(cost)}.
            </p>
          )}
        </ModalShell>
      )}
    </>
  )
}
