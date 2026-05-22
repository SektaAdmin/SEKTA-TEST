'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { SocialHandleInput } from '@/components/ui/SocialHandleInput'
import { VM } from '@/lib/validation-messages'
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
    <ModalShell
      title="Новий тренер"
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
        <label htmlFor="trainer-name">
          Ім&apos;я <span className={styles.required}>*</span>
        </label>
        <input
          id="trainer-name"
          type="text"
          {...register('name', { required: VM.required.name })}
          placeholder="Ім'я тренера"
          disabled={loading}
        />
        {errors.name && (
          <p className={styles.errorHint} role="alert">{errors.name.message}</p>
        )}
      </div>

      <SocialHandleInput
        id="trainer-instagram"
        label="Instagram"
        registration={register('instagram_username')}
        disabled={loading}
      />

      <SocialHandleInput
        id="trainer-telegram"
        label="Telegram"
        registration={register('telegram_username')}
        disabled={loading}
      />

      {serverError && <p className={styles.error} role="alert">{serverError}</p>}
    </ModalShell>
  )
}
