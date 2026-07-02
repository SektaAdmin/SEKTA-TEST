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

const CopyGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <rect x="4" y="4" width="8" height="8" rx="1" />
    <path d="M3.5 2.5h8a1 1 0 011 1v8" />
  </svg>
)
const CheckGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <polyline points="2.5 8.5 6 12 13.5 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * Geist-style Copy Button — outline-кнопка, що копіює в буфер і показує
 * інлайн-фідбек Copy→Check (замість тосту про успіх). Помилка → toast.error.
 * Без `label` — квадратна icon-only (як у Vercel_DS/Copy Button).
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
  const stateTitle = copied ? 'Скопійовано!' : 'Копіювати'

  return (
    <button
      type="button"
      className={[styles.btn, iconOnly && styles.iconOnly, copied && styles.copied, className].filter(Boolean).join(' ')}
      onClick={handleClick}
      title={copied ? 'Скопійовано!' : (title ?? 'Копіювати')}
      aria-label={ariaLabel ?? (iconOnly ? stateTitle : undefined)}
    >
      {copied ? <CheckGlyph /> : <CopyGlyph />}
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </button>
  )
}
