'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClientViaApi } from '@/lib/queries/trainer-cabinet'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { SocialHandleInput } from '@/components/ui/SocialHandleInput'
import { VM } from '@/lib/validation-messages'
import styles from '@/components/ClientModal.module.css'

const schema = z.object({
  first_name: z.string().min(1, VM.required.name),
  last_name: z.string().min(1, VM.required.lastName),
  phone: z.string().optional().or(z.literal('')),
  instagram_username: z.string().optional().or(z.literal('')),
  telegram_username: z.string().optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

// Локалізація кодів помилок із серверного API.
const ERROR_LABEL: Record<string, string> = {
  phone_exists: 'Клієнт з таким номером телефону вже існує',
  name_exists: "Клієнт з таким ім'ям вже існує",
  forbidden: 'Недостатньо прав для створення клієнта',
  name_required: "Вкажіть ім'я та прізвище",
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function CreateClientModal({ onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      instagram_username: '',
      telegram_username: '',
    },
  })

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    setError('')
    const { error: err } = await createClientViaApi({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      phone: data.phone?.trim() || undefined,
      instagram_username: data.instagram_username?.trim() || undefined,
      telegram_username: data.telegram_username?.trim() || undefined,
    })
    if (err) {
      setError(ERROR_LABEL[err] ?? 'Не вдалося створити клієнта. Спробуйте ще раз.')
      setLoading(false)
      return
    }
    onSaved()
  }

  return (
    <ModalShell
      title="Новий клієнт"
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit(onSubmit)}
          saveLabel="Зберегти"
          loading={loading}
        />
      }
    >
      <div className={styles.row}>
        <FormField id="tclient-first-name" label="Ім'я" required error={errors.first_name}>
          <input
            id="tclient-first-name"
            type="text"
            {...register('first_name')}
            placeholder="Анна"
            disabled={loading}
          />
        </FormField>

        <FormField id="tclient-last-name" label="Прізвище" required error={errors.last_name}>
          <input
            id="tclient-last-name"
            type="text"
            {...register('last_name')}
            placeholder="Іваненко"
            disabled={loading}
          />
        </FormField>
      </div>

      <FormField id="tclient-phone" label="Телефон">
        <input
          id="tclient-phone"
          type="tel"
          {...register('phone')}
          placeholder="+380 XX XXX XX XX"
          disabled={loading}
        />
      </FormField>

      <SocialHandleInput
        id="tclient-instagram"
        label="Instagram"
        registration={register('instagram_username')}
        disabled={loading}
      />

      <SocialHandleInput
        id="tclient-telegram"
        label="Telegram"
        registration={register('telegram_username')}
        disabled={loading}
      />

      {error && <p className={styles.error} role="alert">{error}</p>}
    </ModalShell>
  )
}
