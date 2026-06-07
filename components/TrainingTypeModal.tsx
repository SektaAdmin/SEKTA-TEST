'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { insertTrainingType, updateTrainingType } from '@/lib/queries/training-types'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { VM } from '@/lib/validation-messages'
import type { TrainingType } from '@/types'
import styles from './TrainingTypeModal.module.css'


interface FormValues {
  code: string
  label: string
  short_label: string
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
      ? { code: existing.code, label: existing.label, short_label: existing.short_label ?? '' }
      : { code: '', label: '', short_label: '' },
  })

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    setServerError('')

    const shortLabel = data.short_label.trim() || null
    if (existing) {
      const { error } = await updateTrainingType(supabase, existing.id, { label: data.label.trim(), short_label: shortLabel })
      if (error) { setServerError(error); setLoading(false); return }
    } else {
      const { error } = await insertTrainingType(supabase, { code: data.code.trim(), label: data.label.trim(), short_label: shortLabel })
      if (error) { setServerError(error); setLoading(false); return }
    }

    onSaved()
  }

  return (
    <ModalShell
      title={existing ? 'Редагування типу' : 'Новий тип тренування'}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit(onSubmit)}
          loading={loading}
        />
      }
    >
      <FormField
        id="tt-code"
        label="Код"
        required
        error={errors.code}
        hint={!existing ? 'Незмінний ідентифікатор. Використовується в абонементах і розкладі.' : undefined}
      >
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
      </FormField>

      <FormField
        id="tt-label"
        label="Назва"
        required
        error={errors.label}
      >
        <input
          id="tt-label"
          type="text"
          {...register('label', { required: VM.required.title })}
          placeholder="Групові"
          disabled={loading}
        />
      </FormField>

      <FormField
        id="tt-short-label"
        label="Коротка назва"
        hint="Для звітів і компактного відображення. Залиште порожнім якщо не потрібно."
        error={errors.short_label}
      >
        <input
          id="tt-short-label"
          type="text"
          {...register('short_label')}
          placeholder="Індив"
          disabled={loading}
        />
      </FormField>

      {serverError && <p className={styles.error} role="alert">{serverError}</p>}
    </ModalShell>
  )
}
