'use client'
import { openInApp } from '@/lib/openInApp'
import {
  STUDIO_TELEGRAM_URL,
  STUDIO_TELEGRAM_APP_URL,
  STUDIO_INSTAGRAM_URL,
  STUDIO_INSTAGRAM_APP_URL,
} from '@/lib/studio'

/**
 * Блок іконок контактів студії (Telegram + Instagram) для кабінету клієнта.
 * Клік відкриває нативний застосунок (deep-link) із fallback у браузер —
 * через openInApp. Спільний для ClientHome і VisitDetail (був дубльований SVG).
 *
 * `styles` прокидуємо ззовні (client.module.css) — компонент без власного CSS,
 * щоб вписатися в наявну розмітку обох екранів без зайвих залежностей.
 */
export default function StudioContactIcons({
  styles,
}: {
  styles: Record<string, string>
}) {
  return (
    <div className={styles.contactIcons}>
      <a
        className={styles.contactIcon}
        href={STUDIO_TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault()
          openInApp(STUDIO_TELEGRAM_APP_URL, STUDIO_TELEGRAM_URL)
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="22" cy="22" r="19" />
          <path d="M9 21.5 Q9 21.5 28.5 13.5 Q31 12.5 30.5 14.5 L27 30 Q26.7 31.3 25.3 30.7 L20.5 27 L18 29.5 Q17.5 30 17 29 L15.5 24 Z" strokeLinejoin="round" strokeLinecap="round" />
          <line x1="17" y1="29" x2="20.5" y2="27" strokeLinecap="round" />
          <line x1="20.5" y1="27" x2="28.5" y2="13.5" strokeLinecap="round" />
        </svg>
        <span className={styles.contactIconLabel}>Telegram</span>
      </a>
      <a
        className={styles.contactIcon}
        href={STUDIO_INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault()
          openInApp(STUDIO_INSTAGRAM_APP_URL, STUDIO_INSTAGRAM_URL)
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="22" cy="22" r="19" />
          <rect x="14" y="14" width="16" height="16" rx="4.5" strokeWidth="1.4" />
          <circle cx="22" cy="22" r="4" strokeWidth="1.4" />
          <circle cx="27" cy="17" r="1" fill="currentColor" stroke="none" />
        </svg>
        <span className={styles.contactIconLabel}>Instagram</span>
      </a>
    </div>
  )
}
