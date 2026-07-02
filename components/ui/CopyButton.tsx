'use client'
import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import styles from './CopyButton.module.css'

interface Props {
  /** Текст для копіювання. Функція — щоб будувати ліниво в момент кліку. */
  text: string | (() => string)
  /** Підпис поряд з іконкою. Без нього — квадратна icon-only кнопка (Geist Copy Button). */
  label?: ReactNode
  /** Підпис у стані «скопійовано» (лише коли є `label`). */
  copiedLabel?: ReactNode
  title?: string
  ariaLabel?: string
  className?: string
}

const REVERT_MS = 1500

// Точні іконки Geist (Vercel_DS/Copy Button) — заливні, viewBox 0 0 16 16, 16px.
const CopyGlyph = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.25 2c.14 0 .25.11.25.25V3H10v-.75C10 1.28 9.22.5 8.25.5h-5.5C1.78.5 1 1.28 1 2.25v7.5c0 .97.78 1.75 1.75 1.75H4.5V10H2.75a.25.25 0 0 1-.25-.25v-7.5c0-.14.11-.25.25-.25zm5 4c.14 0 .25.11.25.25v7.5q-.02.23-.25.25h-5.5a.25.25 0 0 1-.25-.25v-7.5c0-.14.11-.25.25-.25zm0 9.5c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75h-5.5C6.78 4.5 6 5.28 6 6.25v7.5c0 .97.78 1.75 1.75 1.75z"
    />
  </svg>
)
const CheckGlyph = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="m15.56 4-.53.53-8.8 8.8c-.68.68-1.78.68-2.47 0l.53-.54-.53.53-2.79-2.79L.44 10 1.5 8.94l.53.53 2.8 2.8c.1.09.25.09.35 0l8.79-8.8.53-.53z"
    />
  </svg>
)

/**
 * Geist Copy Button (Vercel_DS/Copy Button) — outline-кнопка 40px (form-height),
 * що копіює в буфер і показує інлайн-кросфейд Copy↔Check (200ms). Помилка →
 * toast.error. Без `label` — квадратна icon-only 40×40 з іконкою 16px.
 */
export function CopyButton({ text, label, copiedLabel = 'Скопійовано', title, ariaLabel, className }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  async function handleClick() {
    const value = typeof text === 'function' ? text() : text
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), REVERT_MS)
    } catch {
      toast.error(MSG.toast.copyFailed)
    }
  }

  const iconOnly = label == null

  return (
    <button
      type="button"
      className={[styles.btn, iconOnly && styles.iconOnly, className].filter(Boolean).join(' ')}
      onClick={handleClick}
      title={copied ? 'Скопійовано!' : (title ?? 'Копіювати')}
      aria-label={ariaLabel ?? (iconOnly ? 'Копіювати' : undefined)}
    >
      <span className={styles.iconWrap}>
        <span className={`${styles.iconLayer} ${copied ? styles.hidden : styles.shown}`}>
          <CopyGlyph />
        </span>
        <span className={`${styles.iconLayer} ${copied ? styles.shown : styles.hidden}`}>
          <CheckGlyph />
        </span>
      </span>
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </button>
  )
}
