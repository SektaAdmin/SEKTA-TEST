'use client'
import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import styles from './CopyButton.module.css'

interface Props {
  /** Текст для копіювання. Функція — щоб будувати ліниво в момент кліку; може повертати Promise (напр. підвантажити дані перед копіюванням). */
  text: string | (() => string) | (() => Promise<string>)
  /** Підпис поряд з іконкою. Без нього — квадратна icon-only кнопка (Geist Copy Button). */
  label?: ReactNode
  /** Підпис у стані «скопійовано» (лише коли є `label`). */
  copiedLabel?: ReactNode
  /** Підпис під час асинхронного білда тексту (лише коли є `label`). */
  loadingLabel?: ReactNode
  title?: string
  ariaLabel?: string
  className?: string
  onCopied?: () => void
  /** 'sm' — компактний квадрат (26px/14px іконка) для щільних рядків таблиць. За замовч. 'default' = Geist 40px. */
  size?: 'default' | 'sm'
}

const REVERT_MS = 1500

// Точні іконки Geist (Vercel_DS/Copy Button) — заливні, viewBox 0 0 16 16.
const CopyGlyph = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.25 2c.14 0 .25.11.25.25V3H10v-.75C10 1.28 9.22.5 8.25.5h-5.5C1.78.5 1 1.28 1 2.25v7.5c0 .97.78 1.75 1.75 1.75H4.5V10H2.75a.25.25 0 0 1-.25-.25v-7.5c0-.14.11-.25.25-.25zm5 4c.14 0 .25.11.25.25v7.5q-.02.23-.25.25h-5.5a.25.25 0 0 1-.25-.25v-7.5c0-.14.11-.25.25-.25zm0 9.5c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75h-5.5C6.78 4.5 6 5.28 6 6.25v7.5c0 .97.78 1.75 1.75 1.75z"
    />
  </svg>
)
const CheckGlyph = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
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
export function CopyButton({ text, label, copiedLabel = 'Скопійовано', loadingLabel = '…', title, ariaLabel, className, onCopied, size = 'default' }: Props) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  async function handleClick() {
    const value = typeof text === 'function' ? text() : text
    setLoading(value instanceof Promise)
    try {
      await navigator.clipboard.writeText(await value)
      setCopied(true)
      onCopied?.()
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), REVERT_MS)
    } catch {
      toast.error(MSG.toast.copyFailed)
    } finally {
      setLoading(false)
    }
  }

  const iconOnly = label == null
  const glyphSize = size === 'sm' ? 14 : 16

  return (
    <button
      type="button"
      className={[styles.btn, iconOnly && styles.iconOnly, size === 'sm' && styles.sm, className].filter(Boolean).join(' ')}
      onClick={handleClick}
      disabled={loading}
      title={copied ? 'Скопійовано!' : (title ?? 'Копіювати')}
      aria-label={ariaLabel ?? (iconOnly ? 'Копіювати' : undefined)}
    >
      <span className={styles.iconWrap}>
        <span className={`${styles.iconLayer} ${copied ? styles.hidden : styles.shown}`}>
          <CopyGlyph size={glyphSize} />
        </span>
        <span className={`${styles.iconLayer} ${copied ? styles.shown : styles.hidden}`}>
          <CheckGlyph size={glyphSize} />
        </span>
      </span>
      {!iconOnly && <span>{loading ? loadingLabel : (copied ? copiedLabel : label)}</span>}
    </button>
  )
}
