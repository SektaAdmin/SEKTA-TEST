'use client'
import { type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'
type Size = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const base = 'inline-flex items-center justify-center rounded-[var(--radius-sm)] font-[var(--font)] cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary:   'border-none bg-[var(--accent)] text-[var(--accent-text)] font-semibold hover:bg-[var(--accent-hover)]',
  secondary: 'border border-[0.5px] border-[var(--border)] bg-transparent text-[var(--text-2)] hover:border-[var(--border-hover)] hover:text-[var(--text)]',
  danger:    'border-none bg-transparent text-[var(--danger)] hover:bg-[var(--danger-dim)]',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-[6px] text-[12px]',
  md: 'px-[14px] py-[7px] text-[13px]',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? '...' : children}
    </button>
  )
}
