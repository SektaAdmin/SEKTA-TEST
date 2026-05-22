'use client'
import { useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import { VM } from '@/lib/validation-messages'
import type { TrainingType } from '@/types'
import styles from './TrainingTypeModal.module.css'


interface FormValues {
  code: string
  label: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  existing?: TrainingType | null
}

export default function TrainingTypeModal({ onClose, onSaved, existing }: Props) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)

  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: existing
      ? { code: existing.code, label: existing.label }
      : { code: '', label: '' },
  })

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    setServerError('')

    if (existing) {
      const { error } = await supabase
        .from('training_types')
        .update({ label: data.label.trim() })
        .eq('id', existing.id)
      if (error) { setServerError(error.message); setLoading(false); return }
    } else {
      const { error } = await supabase
        .from('training_types')
        .insert({ code: data.code.trim(), label: data.label.trim() })
      if (error) { setServerError(error.message); setLoading(false); return }
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
          <h2 id={titleId}>{existing ? 'Редагування типу' : 'Новий тип тренування'}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={styles.body}>
            <div className={styles.field}>
              <label htmlFor="tt-code">
                Код <span className={styles.required}>*</span>
              </label>
              <input
                id="tt-code"
                type="text"
                {...register('code', {
                  required: VM.required.code,
                  pattern: { value: /^[a-z0-9]+$/, message: VM.invalid.codePattern },
                })}
                placeholder="group"
                disabled={loading || !!existing}
              />
              {errors.code && <p className={styles.errorHint} role="alert">{errors.code.message}</p>}
              {!existing && (
                <span className={styles.codeHint}>
                  Незмінний ідентифікатор. Використовується в абонементах і розкладі.
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="tt-label">
                Назва <span className={styles.required}>*</span>
              </label>
              <input
                id="tt-label"
                type="text"
                {...register('label', { required: VM.required.title })}
                placeholder="Групові"
                disabled={loading}
              />
              {errors.label && <p className={styles.errorHint} role="alert">{errors.label.message}</p>}
            </div>

            {serverError && <p className={styles.error} role="alert">{serverError}</p>}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={loading}>
              Скасувати
            </button>
            <button type="submit" className={styles.btnSave} disabled={loading}>
              {loading ? 'Збереження...' : 'Зберегти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
