'use client'
import { useState, useRef, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import styles from './TrainerModal.module.css'

interface TrainerFormValues {
  name: string
  instagram_username: string
  telegram_username: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function TrainerModal({ onClose, onSaved }: Props) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrainerFormValues>({
    defaultValues: { name: '', instagram_username: '', telegram_username: '' },
  })

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    modal.querySelector<HTMLElement>(
      'input:not(:disabled), button:not(:disabled)'
    )?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab') return

      const focusable = Array.from((modal as HTMLDivElement).querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const onSubmit = async (data: TrainerFormValues) => {
    setLoading(true)
    setServerError('')

    const supabase = createClient()
    const { error: insertError } = await supabase.from('trainers').insert({
      name: data.name.trim(),
      instagram_username: data.instagram_username.trim() || null,
      telegram_username: data.telegram_username.trim() || null,
      is_active: true,
    })

    if (insertError) {
      setServerError(insertError.message)
      setLoading(false)
      return
    }

    onSaved()
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId}>Новий тренер</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label htmlFor="trainer-name">
              Ім&apos;я <span className={styles.required}>*</span>
            </label>
            <input
              id="trainer-name"
              type="text"
              {...register('name', { required: 'Ім\'я обов\'язкове' })}
              placeholder="Ім'я тренера"
              disabled={loading}
            />
            {errors.name && (
              <p className={styles.errorHint} role="alert">{errors.name.message}</p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="trainer-instagram">Instagram</label>
            <div className={styles.inputWithPrefix}>
              <span className={styles.prefix}>@</span>
              <input
                id="trainer-instagram"
                type="text"
                {...register('instagram_username')}
                placeholder="username"
                disabled={loading}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="trainer-telegram">Telegram</label>
            <div className={styles.inputWithPrefix}>
              <span className={styles.prefix}>@</span>
              <input
                id="trainer-telegram"
                type="text"
                {...register('telegram_username')}
                placeholder="username"
                disabled={loading}
              />
            </div>
          </div>

          {serverError && <p className={styles.error} role="alert">{serverError}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
