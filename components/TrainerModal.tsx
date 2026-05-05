'use client'
import { useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
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
  const modalRef = useModalFocus(onClose)

  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrainerFormValues>({
    defaultValues: { name: '', instagram_username: '', telegram_username: '' },
  })

  const onSubmit = async (data: TrainerFormValues) => {
    setLoading(true)
    setServerError('')

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
