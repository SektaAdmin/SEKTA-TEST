'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
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
    <ModalShell
      title={existing ? 'Редагування типу' : 'Новий тип тренування'}
      onClose={onClose}
      width={380}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit(onSubmit)}
          loading={loading}
        />
      }
    >
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
    </ModalShell>
  )
}
