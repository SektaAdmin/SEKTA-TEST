'use client'
import type { ReactNode } from 'react'
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form'
import styles from './FormField.module.css'

interface Props {
  id: string
  label: string
  required?: boolean
  registration?: UseFormRegisterReturn
  error?: FieldError
  hint?: ReactNode
  children?: ReactNode
  className?: string
}

export function FormField({ id, label, required, registration, error, hint, children, className }: Props) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id}>
        {label}{required && <span className={styles.required}> *</span>}
      </label>
      {children ?? (registration && <input id={id} {...registration} />)}
      {error && <p className={styles.errorHint} role="alert">{error.message}</p>}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}
